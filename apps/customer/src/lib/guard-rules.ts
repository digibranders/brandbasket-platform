import type { CustomerAccess, TenantContext } from "@brandbasket/shared/lib/access";
import type { CustomerBilling } from "@brandbasket/shared/lib/billing/status";

/**
 * The decisions behind the guards in ./guards.ts, as pure functions: who may open what, and where everyone else is sent.
 * Ported from apps/platform (lib/server/customer-access.ts, lib/server/billing.ts, lib/first-look.ts) with the paths of the
 * new route map (plan 61, section 3).
 */

/** The three services, by the names the app uses for them, in catalogue order. */
export const SERVICES = ["website", "social", "search"] as const;
export type Service = (typeof SERVICES)[number];

/** Where a guard sends someone who may not open the page. */
export const GUARD_PATHS = {
  signIn: "/login",
  restoreAccount: "/restore-account",
  checkout: "/checkout",
  billing: "/billing",
  home: "/",
} as const;

/**
 * Paths that an unpaid customer is allowed to open inside the signed-in workspace.
 * An unpaid customer can open Help and Settings (and sign out from the shell) instead of being locked to /start.
 */
export const UNPAID_ALLOWED_PATH_PREFIXES = ["/help", "/settings"] as const;

export function isUnpaidAllowedPath(pathname: string): boolean {
  return UNPAID_ALLOWED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Where to send an unpaid sign-up account that is awaiting first payment:
 * if they are on an allowed path (Help, Settings), they may stay (null); otherwise, they are sent to /checkout.
 */
export function unpaidHoldRedirect(pathname: string, awaitingFirstPayment: boolean): string | null {
  if (!awaitingFirstPayment) return null;
  return isUnpaidAllowedPath(pathname) ? null : GUARD_PATHS.checkout;
}

/**
 * What a page or action needs beyond a signed-in member of a business.
 * - `paid: "ever"`: the business has paid at least once. A lapsed customer keeps read access (plan 60, section 13).
 * - `paid: "live"`: a paid period is running now. Every write that needs the plan asks for this.
 */
export interface Requirement {
  readonly paid?: "ever" | "live";
  readonly owner?: boolean;
  readonly service?: Service;
}

/** The facts a requirement is checked against, read once per request by the guards. */
export interface CustomerFacts {
  readonly role: TenantContext["role"];
  readonly billing: Pick<CustomerBilling, "status" | "hasWebsite">;
  readonly services: readonly Service[];
}

/** Where someone without a workspace is sent, or null when they have one. */
export function accessRedirect(access: CustomerAccess): string | null {
  switch (access.kind) {
    case "signed-out":
    case "no-business":
      return GUARD_PATHS.signIn;
    // An account that asked to be deleted is locked until it is restored or erased.
    case "closing":
      return GUARD_PATHS.restoreAccount;
    case "granted":
      return null;
    default: {
      const unhandled: never = access;
      throw new Error(`Unhandled customer access: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Where a business that may not open the page is sent, or null when it may. */
export function requirementRedirect(facts: CustomerFacts, requirement: Requirement): string | null {
  const { status } = facts.billing;
  const live = requirement.paid === "live";
  if ((requirement.paid === "ever" || live) && status === "unpaid") return GUARD_PATHS.checkout;
  // Restarting a lapsed plan is reactivation, on Plan & billing, never a new first payment.
  if (live && status === "lapsed") return GUARD_PATHS.billing;
  if (requirement.owner === true && facts.role !== "owner") return GUARD_PATHS.home;
  if (requirement.service !== undefined && !holdsService(facts, requirement.service, live)) return GUARD_PATHS.home;
  return null;
}

/**
 * Whether the business holds a service. For a write (`live`) the Website follows billing's own rule (hasWebsiteService: a
 * paid period and a paid Managed Website line, so a dropped website runs to the end of its month). For reading, a paying
 * business follows the same rule; an unpaid or lapsed one is judged by the services on its plan, so a lapsed customer can
 * still read their website's pages.
 */
function holdsService(facts: CustomerFacts, service: Service, live: boolean): boolean {
  const onPlan = facts.services.includes(service);
  if (service !== "website") return live ? facts.billing.status === "paid" && onPlan : onPlan;
  if (live || facts.billing.status === "paid") return facts.billing.hasWebsite;
  return onPlan;
}

/** A service line as stored in bundled_add_ons. */
export interface ServiceLine {
  readonly addOn: string;
  readonly status: string;
  readonly endRequestedAt: Date | null;
}

/**
 * The services the plan keeps, in catalogue order: the Website from the plan's own active lines that are not on their way
 * out, and Social & Ads and Local SEO + AEO by the db package's rule (taken with the plan or bought later), which the
 * caller reads with listBoughtSetupServices. Ported from apps/platform lib/first-look.ts servicesBought and
 * lib/server/first-look.ts loadSetupServices.
 */
export function servicesFrom(lines: readonly ServiceLine[], setupServices: readonly ("social" | "search")[]): readonly Service[] {
  const website = lines.some((line) => line.addOn === "managed-website" && line.status === "active" && line.endRequestedAt === null);
  return SERVICES.filter((service) => (service === "website" ? website : setupServices.includes(service)));
}
