import { DIRECTORY_CLAIM_ID_PARAM, DIRECTORY_CLAIM_SIGNATURE_PARAM } from "@/lib/directory-api";
import { FYNIX_DEFAULT_CHOICE, offersChoice, type Brand } from "@/lib/brand";
import { readJoinChoice, type JoinChoice } from "@/lib/join-form";

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
/** Opens the Create account view with a plan already chosen: the website links to `care` and `premium`. */
const PLAN_PARAM = "plan";
/** What the address calls each plan: the database's `listing_only` is `free` here, so the link reads as the owner thinks of it. */
const PLAN_PARAM_VALUES: Readonly<Record<JoinChoice, string>> = { listing_only: "free", care: "care", premium: "premium" };
/** A claim link's parts (lib/directory-api.ts, "A claim link"): the business by key or by id, its name, the signature. */
const CLAIM_PARAMS = ["listing", DIRECTORY_CLAIM_ID_PARAM, "name", DIRECTORY_CLAIM_SIGNATURE_PARAM] as const;

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export interface EntryRequest {
  readonly view: "sign-in" | "create";
  /** The choice the link makes for the visitor, which they can still change; null asks the question. */
  readonly choice: JoinChoice | null;
  /** The plan the question opens with already ticked, for a brand that has a default (Fynix: Care); null ticks none. */
  readonly preselected: JoinChoice | null;
  /** A claim link's parts as they arrived, unchecked: the page verifies the signature. Empty strings when absent. */
  readonly claim: { readonly listing: string; readonly id: string; readonly name: string; readonly signature: string };
}

const NO_CLAIM = { listing: "", id: "", name: "", signature: "" } as const;

/**
 * What the entry page's address asks for. It opens on Create account when the address says so, when it names a plan,
 * or when it carries a claim: all three come from a button that means "I'm new".
 *
 * Under a brand that does not sell the free listing (Fynix) the address cannot choose it: `plan=free`, or a plan that
 * is not sold, opens the plans with the brand's default ticked, and a claim link is read as "I'm new" but its claim is
 * dropped, so no free listing account can be made from it.
 */
export function readEntryRequest(params: SearchParams, brand: Brand): EntryRequest {
  const claim = {
    listing: single(params.listing),
    id: single(params[DIRECTORY_CLAIM_ID_PARAM]),
    name: single(params.name),
    signature: single(params[DIRECTORY_CLAIM_SIGNATURE_PARAM]),
  };
  const asked = single(params[PLAN_PARAM]);
  const named = readPlanParam(asked);
  const choice = named !== null && offersChoice(brand, named) ? named : null;
  const claimAsked = claim.listing !== "" || claim.id !== "" || claim.name !== "";
  const sellsFree = offersChoice(brand, "listing_only");
  // Whatever plan a Fynix address names, even one it does not sell, is someone who wants to sign up.
  const namesAPlan = sellsFree ? named !== null : asked !== "";
  const asksToCreate = single(params[NEW_PARAM]) === "1" || namesAPlan || claimAsked;
  return {
    view: asksToCreate ? "create" : "sign-in",
    choice,
    preselected: sellsFree ? null : FYNIX_DEFAULT_CHOICE,
    claim: sellsFree ? claim : NO_CLAIM,
  };
}

/** The plan an address names (`free`, `care` or `premium`; the database's `listing_only` is read too), or null for anything else. */
export function readPlanParam(value: string): JoinChoice | null {
  const named = (Object.keys(PLAN_PARAM_VALUES) as JoinChoice[]).find((choice) => PLAN_PARAM_VALUES[choice] === value);
  return named ?? readJoinChoice(value);
}

/**
 * The entry page's address once the owner has continued with a plan: Create account plus the plan, with a claim
 * link's parts kept. With no plan (they went back to the plans) it is the Create account address again.
 */
export function entryHrefForPlan(search: string, choice: JoinChoice | null): string {
  const query = new URLSearchParams(search);
  query.set(NEW_PARAM, "1");
  if (choice === null) query.delete(PLAN_PARAM);
  else query.set(PLAN_PARAM, PLAN_PARAM_VALUES[choice]);
  return `${ENTRY_PATH}?${query.toString()}`;
}

/** The entry page's Create account view, for a plain link to it. */
export const CREATE_ACCOUNT_HREF = `${ENTRY_PATH}?${NEW_PARAM}=1`;

/**
 * The entry page's address for what an old /join address asked for: Create account, with its claim and plan carried
 * over and nothing else. Only the parameters this page reads are copied, so nothing else typed into the address
 * travels on.
 */
export function entryHrefForJoin(params: SearchParams): string {
  const query = new URLSearchParams({ [NEW_PARAM]: "1" });
  for (const key of [...CLAIM_PARAMS, PLAN_PARAM]) {
    const value = single(params[key]);
    if (value !== "") query.set(key, value);
  }
  return `${ENTRY_PATH}?${query.toString()}`;
}
