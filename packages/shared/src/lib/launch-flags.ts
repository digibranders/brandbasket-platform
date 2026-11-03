/*
 * Switches that keep a finished feature off until a person outside the code says it may go live. Each reads one environment
 * variable and is OFF unless it is set to 1, true, on or yes.
 *
 * - CUSTOMER_VISITS_ENABLED: the customer app shows website visits (gate G1: counsel's answer and the approved privacy wording
 *   on first-party analytics, docs/site-analytics.md).
 * - CUSTOMER_SEARCH_ENABLED: the customer app shows how people find them on Google (plan 62, step 5: the approved customer words).
 * - ENQUIRY_FORM_CONTENTS_ENABLED: enquirers' details from website forms and ad leads may be stored (gate G2: the privacy review).
 */

const ON_VALUES: ReadonlySet<string> = new Set(["1", "true", "on", "yes"]);

export type FlagEnv = Readonly<Record<string, string | undefined>>;

export function flagIsOn(value: string | undefined): boolean {
  return value !== undefined && ON_VALUES.has(value.trim().toLowerCase());
}

export function isCustomerVisitsEnabled(env: FlagEnv = process.env): boolean {
  return flagIsOn(env.CUSTOMER_VISITS_ENABLED);
}

export function isCustomerSearchEnabled(env: FlagEnv = process.env): boolean {
  return flagIsOn(env.CUSTOMER_SEARCH_ENABLED);
}

export function isEnquiryFormContentsEnabled(env: FlagEnv = process.env): boolean {
  return flagIsOn(env.ENQUIRY_FORM_CONTENTS_ENABLED);
}
