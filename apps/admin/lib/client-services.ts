import type { ClientProject, LiveServiceLine } from "@brandbasket/db";
import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { STAFF_STAGE_LABELS, staffStageOf } from "@brandbasket/shared/lib/project-stage";

/** How a service reads on a card or a chip: a word and a tone, never colour alone. */
export type ServiceState = "active" | "setup" | "late" | "waiting";

export interface ServiceStatus {
  readonly id: MonthlyAddOnId;
  /** The short name for a chip: Website, Social, Paid Ads, Monitoring. */
  readonly short: string;
  readonly title: string;
  readonly state: ServiceState;
  /** The state in words. */
  readonly text: string;
}

const SHORT_NAMES: Readonly<Record<MonthlyAddOnId, string>> = {
  "managed-website": "Website",
  "social-media": "Social",
  "paid-ads": "Paid Ads",
  "expert-monitoring": "Monitoring",
};

/**
 * The services a business has, in catalogue order, with where each stands. The website's state is its build stage; every
 * other service is "To set up" while it is paid and nobody has marked the customer as contacted, "Waiting for payment" while
 * its line is still pending, else "Active". `toSetUp` holds the ids still to follow up.
 */
export function serviceStatuses(input: {
  readonly lines: readonly Pick<LiveServiceLine, "addOn" | "status">[];
  readonly project: Pick<ClientProject, "status"> | null;
  readonly websiteLate: boolean;
  readonly toSetUp: ReadonlySet<string>;
}): ServiceStatus[] {
  const byId = new Map(input.lines.map((line) => [line.addOn, line]));
  return MONTHLY_ADD_ON_IDS.flatMap((id): ServiceStatus[] => {
    const line = byId.get(id);
    if (line === undefined) return [];
    const base = { id, short: SHORT_NAMES[id], title: addOnById(id).title };
    if (id === "managed-website") {
      if (input.project === null) return [{ ...base, state: "waiting", text: "Setting up" }];
      const stage = staffStageOf(input.project.status);
      const state: ServiceState = input.websiteLate ? "late" : stage === "live" ? "active" : "waiting";
      return [{ ...base, state, text: STAFF_STAGE_LABELS[stage] }];
    }
    if (line.status === "pending") return [{ ...base, state: "waiting", text: "Waiting for payment" }];
    return input.toSetUp.has(id) ? [{ ...base, state: "setup", text: "To set up" }] : [{ ...base, state: "active", text: "Active" }];
  });
}
