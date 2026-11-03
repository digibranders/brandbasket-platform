import type { JoinChoice } from "./join-form";

/*
 * The name of this dashboard and the plan it sells at sign-up. Ported from apps/platform lib/brand.ts, keeping only what the
 * entry screens read. One product, one brand. Browser-safe and pure.
 */
export const BRAND = {
  name: "Brandbasket",
  shortName: "Brandbasket",
  contactEmail: "support@brandbasket.in",
  siteUrl: "https://brandbasket.in",
  /** The plans offered at sign-up: Managed Website only, never the dormant free listing. */
  joinChoices: ["managed"] as readonly JoinChoice[],
} as const;

/** The plan a sign-up opens with: the only one Brandbasket sells. */
export const BRANDBASKET_DEFAULT_CHOICE: JoinChoice = "managed";

/** Whether a sign-up choice may be made. The server refuses any other, whatever the form sent. */
export function offersChoice(choice: JoinChoice): boolean {
  return BRAND.joinChoices.includes(choice);
}

/** The Terms and the Privacy Notice, on the website. */
export const LEGAL_LINKS = {
  terms: new URL("/terms", BRAND.siteUrl).toString(),
  privacy: new URL("/privacy", BRAND.siteUrl).toString(),
} as const;
