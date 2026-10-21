import { BRANDBASKET_DEFAULT_CHOICE, offersChoice, type Brand } from "@/lib/brand";
import { readJoinChoice, type JoinChoice } from "@/lib/join-form";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { readBundleSelection, WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";

/*
 * The one entry page (/login): everyone signs in and everyone creates their account here (docs/superpowers/specs/
 * 2026-09-30-single-entry-premium-design.md). This reads what its address asks for. Browser-safe and pure, so the
 * page, the old /join address that redirects to it, and the tests share one reading.
 */

export const ENTRY_PATH = "/login";

/**
 * A spot at the end of the entry screen's lede line (components/panel/entry-screen.tsx), where a form puts a control
 * that belongs beside it: the create-account form's "Go back" on its details step.
 */
export const ENTRY_LEDE_SLOT_ID = "entry-lede-action";

/** Opens the page on its Create account view. */
const NEW_PARAM = "new";
/** The older links' add-ons on top of the website, comma separated: `plan=managed&addons=digital-growth,local-seo-aeo`. */
const ADDONS_PARAM = "addons";
/**
 * Opens the Create account view with a plan already chosen: brandbasket-website's `signupHref` names the services in its
 * basket (`plan=website,growth`), older links name `managed`.
 */
const PLAN_PARAM = "plan";
/** What brandbasket-website calls each service in its links (its lib/pricing.ts), and the catalogue id it is here. */
const WEBSITE_SERVICE_IDS: ReadonlyMap<string, MonthlyAddOnId> = new Map([
  ["website", "managed-website"],
  ["growth", "digital-growth"],
  ["search", "local-seo-aeo"],
]);
/** What the address calls each plan: the database's `listing_only` is `free` here, so the link reads as the owner thinks of it. */
const PLAN_PARAM_VALUES: Readonly<Record<JoinChoice, string>> = { listing_only: "free", managed: "managed" };

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export interface EntryRequest {
  readonly view: "sign-in" | "create";
  /** The choice the link makes for the visitor, which they can still change; null asks the question. */
  readonly choice: JoinChoice | null;
  /** The plan the question opens with already ticked, for a brand that has a default (Brandbasket: Managed Website); null ticks none. */
  readonly preselected: JoinChoice | null;
  /**
   * The services the website's basket chose, catalogue ids only, never empty: the whole subscription the plan's page opens
   * on after sign-up. The website alone when the link names none.
   */
  readonly services: readonly MonthlyAddOnId[];
}

/**
 * What the entry page's address asks for. It opens on Create account when the address says so or when it names a plan:
 * both come from a button that means "I'm new".
 *
 * Under a brand that does not sell the free listing (Brandbasket) the address cannot choose it: `plan=free`, or a plan that
 * is not sold, opens the plans with the brand's default ticked.
 */
export function readEntryRequest(params: SearchParams, brand: Brand): EntryRequest {
  const asked = single(params[PLAN_PARAM]);
  const named = readPlanParam(asked);
  const choice = named !== null && offersChoice(brand, named) ? named : null;
  const sellsFree = offersChoice(brand, "listing_only");
  // Whatever plan a Brandbasket address names, even one it does not sell, is someone who wants to sign up.
  const namesAPlan = sellsFree ? named !== null : asked !== "";
  const asksToCreate = single(params[NEW_PARAM]) === "1" || namesAPlan;
  return {
    view: asksToCreate ? "create" : "sign-in",
    choice,
    preselected: sellsFree ? null : BRANDBASKET_DEFAULT_CHOICE,
    services: readLinkServices(params),
  };
}

/** The services a plan parameter names in the website's words (`website,growth`), or none. Spaces and capitals around a word are ignored. */
function namedServices(plan: string): readonly MonthlyAddOnId[] {
  return readBundleSelection(plan.split(",").flatMap((id) => WEBSITE_SERVICE_IDS.get(id.trim().toLowerCase()) ?? []));
}

/**
 * The basket a sign-up link carries: the services its plan names, or for an older link the website plus the add-ons
 * `addons=` lists. A link that names nothing known sells the website alone.
 */
function readLinkServices(params: SearchParams): readonly MonthlyAddOnId[] {
  const named = namedServices(single(params[PLAN_PARAM]));
  if (named.length > 0) return named;
  const extras = [params[ADDONS_PARAM] ?? ""].flat().join(",").split(",");
  return readBundleSelection([...WEBSITE_ALONE, ...extras]);
}

/**
 * The plan an address names (`free` or `managed`; the database's `listing_only` is read too), or null for anything else.
 * A list of the website's services is Managed Website: every service is bought on it.
 */
export function readPlanParam(value: string): JoinChoice | null {
  const named = (Object.keys(PLAN_PARAM_VALUES) as JoinChoice[]).find((choice) => PLAN_PARAM_VALUES[choice] === value);
  if (named !== undefined) return named;
  return namedServices(value).length > 0 ? "managed" : readJoinChoice(value);
}

/**
 * The entry page's address once the owner has continued with a plan: Create account plus the plan. With no plan (they went back to the plans) it is the Create account address again.
 * A plan that names the website's services is kept for Managed Website, so a reload still carries the basket.
 */
export function entryHrefForPlan(search: string, choice: JoinChoice | null): string {
  const query = new URLSearchParams(search);
  query.set(NEW_PARAM, "1");
  if (choice === null) query.delete(PLAN_PARAM);
  else if (choice !== "managed" || namedServices(query.get(PLAN_PARAM) ?? "").length === 0) query.set(PLAN_PARAM, PLAN_PARAM_VALUES[choice]);
  return `${ENTRY_PATH}?${query.toString()}`;
}

/** The entry page's Create account view, for a plain link to it. */
export const CREATE_ACCOUNT_HREF = `${ENTRY_PATH}?${NEW_PARAM}=1`;

/**
 * The entry page's address for what an old /join address asked for: Create account, with its plan carried over and
 * nothing else. Only the parameters this page reads are copied, so nothing else typed into the address
 * travels on.
 */
export function entryHrefForJoin(params: SearchParams): string {
  const query = new URLSearchParams({ [NEW_PARAM]: "1" });
  const plan = single(params[PLAN_PARAM]);
  if (plan !== "") query.set(PLAN_PARAM, plan);
  return `${ENTRY_PATH}?${query.toString()}`;
}
