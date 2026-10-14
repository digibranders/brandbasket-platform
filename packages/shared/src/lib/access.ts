import type { ActiveStaffMember, BusinessMembership, StaffRole } from "@fynix/db";

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  /** The user opened a link we emailed to that address (a free listing sign-up's confirmation). */
  readonly emailConfirmed: boolean;
  /**
   * The number the user signs in with, E.164, proven theirs by a code we texted; null for an account that signs in
   * with an email. With a number, `email` is only a placeholder (isPhoneAccountEmail) and must not be shown or
   * written to.
   */
  readonly phone: string | null;
}

/** Everything a customer-facing server operation needs to scope its work to one business. */
export interface TenantContext {
  readonly userId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly role: BusinessMembership["role"];
}

export type CustomerAccess =
  | { readonly kind: "signed-out" }
  | { readonly kind: "no-business"; readonly user: SessionUser }
  /** The user asked to delete their account: it is locked until it is restored or erased. */
  | { readonly kind: "closing"; readonly user: SessionUser; readonly eraseAfter: Date }
  | { readonly kind: "granted"; readonly user: SessionUser; readonly tenant: TenantContext };

/**
 * In Phase 1 a customer belongs to one business. If an account has several, the oldest membership wins
 * until a business switcher exists. `memberships` must be ordered oldest first.
 */
export function decideCustomerAccess(
  user: SessionUser | null,
  memberships: readonly BusinessMembership[],
): CustomerAccess {
  if (user === null) return { kind: "signed-out" };
  const membership = memberships[0];
  if (membership === undefined) return { kind: "no-business", user };
  return {
    kind: "granted",
    user,
    tenant: {
      userId: user.id,
      businessId: membership.businessId,
      businessName: membership.businessName,
      role: membership.role,
    },
  };
}

/**
 * What each kind of staff work needs. An admin can do everything, so `admin` is in every list. `support` is in none
 * of them: it runs the day to day (leads, clients, support, the directory) and nothing that moves money or reads
 * what other staff did.
 */
export const STAFF_CAPABILITIES = {
  /** Pricing, invoices and their export, payments, charges, waivers, upgrades and add-on endings. */
  money: ["finance", "admin"],
  /** The access log: who opened what. */
  oversight: ["admin"],
} as const satisfies Readonly<Record<string, readonly StaffRole[]>>;

export type StaffCapability = keyof typeof STAFF_CAPABILITIES;

export function staffCan(role: StaffRole, capability: StaffCapability): boolean {
  return (STAFF_CAPABILITIES[capability] as readonly StaffRole[]).includes(role);
}

export type StaffAccess =
  | { readonly kind: "signed-out" }
  | { readonly kind: "not-staff"; readonly user: SessionUser }
  | { readonly kind: "granted"; readonly user: SessionUser; readonly staff: ActiveStaffMember };

export function decideStaffAccess(user: SessionUser | null, staff: ActiveStaffMember | null): StaffAccess {
  if (user === null) return { kind: "signed-out" };
  if (staff === null || staff.userId !== user.id) return { kind: "not-staff", user };
  return { kind: "granted", user, staff };
}
