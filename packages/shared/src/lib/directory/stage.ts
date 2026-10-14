import type { CustomerBillingStatus } from "../billing/status";

export type ListingStage = "building" | "live" | "hidden" | "paused";

export const LISTING_STAGE_LABELS: Readonly<Record<ListingStage, string>> = {
  building: "Goes live with your website",
  live: "Live on the local directory",
  hidden: "Hidden",
  paused: "Paused",
};

/**
 * Where a listing is in its life, in the order the checks matter: nothing shows before the website launches; a
 * lapsed payment pauses it whatever the switch says; then the client's own Show in directory switch.
 */
export function listingStage(input: {
  readonly hasLiveProject: boolean;
  readonly billingStatus: CustomerBillingStatus;
  readonly visible: boolean;
}): ListingStage {
  if (!input.hasLiveProject) return "building";
  if (input.billingStatus !== "paid") return "paused";
  return input.visible ? "live" : "hidden";
}
