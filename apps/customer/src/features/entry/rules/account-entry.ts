import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { readBundleSelection, WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";
import { offersChoice } from "./brand";
import { readJoinChoice, type JoinChoice } from "./join-form";

/*
 * What the entry addresses ask for. Ported from apps/platform lib/account-entry.ts. The old app had one page, /login, for
 * signing in and creating an account; here they are two: /login signs in and /signup creates an account. Every old link
 * that asked to create an account (`new=1`, a `plan`, the older `addons`, an ad's `start` token) still works: /login sends it
 * on to /signup with its parameters. Browser-safe and pure.
 */

export const SIGN_IN_PATH = "/login";
export const SIGN_UP_PATH = "/signup";

/** Opens the old single page on its Create account view. */
const NEW_PARAM = "new";
/** The older links' add-ons on top of the website, comma separated: `plan=managed&addons=digital-growth,local-seo-aeo`. */
const ADDONS_PARAM = "addons";
/** The services the website's basket chose (`plan=website,growth`), or `managed` on older links. */
const PLAN_PARAM = "plan";
/** The ad landing page's sealed details (start-token.ts). */
const START_PARAM = "start";
/** What brandbasket-website calls each service in its links (its lib/pricing.ts), and the catalogue id it is here. */
const WEBSITE_SERVICE_IDS: ReadonlyMap<string, MonthlyAddOnId> = new Map([
  ["website", "managed-website"],
  ["growth", "digital-growth"],
  ["search", "local-seo-aeo"],
]);

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export interface EntryRequest {
  readonly view: "sign-in" | "create";
  /** The plan the link names, when Brandbasket sells it; null when it names none or one not sold. */
  readonly choice: JoinChoice | null;
  /**
   * The services the website's basket chose, catalogue ids only, never empty: the whole subscription the checkout opens on
   * after sign-up. The website alone when the link names none.
   */
  readonly services: readonly MonthlyAddOnId[];
}

/**
 * What an entry address asks for. It asks to create an account when it says so (`new=1`) or names any plan, even one that
 * is not sold: both come from a button that means "I'm new". A link carrying the older `addons` or an ad's `start` token
 * is a sign-up link too.
 */
export function readEntryRequest(params: SearchParams): EntryRequest {
  const asked = single(params[PLAN_PARAM]);
  const named = readPlanParam(asked);
  const asksToCreate = single(params[NEW_PARAM]) === "1" || asked !== "" || single(params[ADDONS_PARAM]) !== "" || single(params[START_PARAM]) !== "";
  return {
    view: asksToCreate ? "create" : "sign-in",
    choice: named !== null && offersChoice(named) ? named : null,
    services: readLinkServices(params),
  };
}

/** The services a plan parameter names in the website's words (`website,growth`), or none. Spaces and capitals are ignored. */
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

/** The plan an address names, or null. A list of the website's services is Managed Website: every service is bought on it. */
function readPlanParam(value: string): JoinChoice | null {
  if (value === "free") return "listing_only";
  return namedServices(value).length > 0 ? "managed" : readJoinChoice(value);
}

/** The same address with every parameter kept, on another path. Repeated parameters stay repeated. */
function withParams(path: string, params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value ?? []].flat()) query.append(key, item);
  }
  const text = query.toString();
  return text === "" ? path : `${path}?${text}`;
}

/**
 * Where /login sends a sign-up link: /signup with its parameters, minus the `new=1` that only chose the old page's view.
 * Null when the address is for signing in.
 */
export function signUpHrefFromLogin(params: SearchParams): string | null {
  if (readEntryRequest(params).view !== "create") return null;
  return withParams(SIGN_UP_PATH, Object.fromEntries(Object.entries(params).filter(([key]) => key !== NEW_PARAM)));
}

/** The old /join address: /signup, with every parameter it carried. /signup reads only the ones it knows. */
export function signUpHrefForJoin(params: SearchParams): string {
  return withParams(SIGN_UP_PATH, params);
}
