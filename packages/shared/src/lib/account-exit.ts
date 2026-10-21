import type { AccountExitReason } from "@brandbasket/db";

/*
 * The delete-account flow's words. Pure and free of the database, so the page's client steps and the server action
 * both read the same reasons. Only types come from the db package: a runtime import would pull the database into the
 * browser.
 */

/** Keyed by reason so that adding one to the database enum fails to compile until it has a label. */
const REASONS: Readonly<Record<AccountExitReason, { readonly label: string }>> = {
  too_expensive: { label: "It costs more than I can justify" },
  not_enough_enquiries: { label: "I’m not getting enough enquiries" },
  not_using: { label: "I’m not using it enough" },
  missing_feature: { label: "It’s missing something I need" },
  found_alternative: { label: "I’m moving to something else" },
  closing_business: { label: "I’m closing the business" },
  other: { label: "Something else" },
};

/** Order matters: it is the order of the radio buttons. */
export const EXIT_REASON_ORDER = [
  "too_expensive",
  "not_enough_enquiries",
  "not_using",
  "missing_feature",
  "found_alternative",
  "closing_business",
  "other",
] as const satisfies readonly AccountExitReason[];

export const EXIT_REASON_OPTIONS: readonly { readonly value: AccountExitReason; readonly label: string }[] =
  EXIT_REASON_ORDER.map((value) => ({ value, label: REASONS[value].label }));

export function isExitReason(value: unknown): value is AccountExitReason {
  return typeof value === "string" && Object.hasOwn(REASONS, value);
}

/** The longest comment taken. The database enforces the same figure. */
export const EXIT_COMMENT_MAX_LENGTH = 1000;

/** The word that must be typed to confirm. A deliberate act, not a click that slips. */
export const DELETE_CONFIRMATION_WORD = "DELETE";
