import type { ClientSummary, LiveServiceLine } from "@brandbasket/db";
import { MONTHLY_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";
import type { PillTone } from "@/components/console/status-pill";
import { clientStage, JOURNEY_STAGE_LABELS } from "@/lib/pipeline";

/** Where a business stands in the Clients table: leaving and not paid come before the build stage. */
export type ClientRowStage = "not-paid" | "leaving" | "setup" | "building" | "preview" | "live" | "paused";

export function clientRowStage(client: Pick<ClientSummary, "project" | "billing">, closing: boolean): ClientRowStage {
  if (closing) return "leaving";
  if (client.billing.firstPayment === null) return "not-paid";
  const stage = clientStage(client);
  return stage === "lead" ? "setup" : stage;
}

export const CLIENT_ROW_STAGE_LABELS: Readonly<Record<ClientRowStage, string>> = {
  "not-paid": "Not paid",
  leaving: "Leaving",
  setup: JOURNEY_STAGE_LABELS.setup,
  building: JOURNEY_STAGE_LABELS.building,
  preview: JOURNEY_STAGE_LABELS.preview,
  live: JOURNEY_STAGE_LABELS.live,
  paused: "Paused",
};

export const CLIENT_ROW_STAGE_TONES: Readonly<Record<ClientRowStage, PillTone>> = {
  "not-paid": "todo",
  leaving: "problem",
  setup: "wait",
  building: "progress",
  preview: "progress",
  live: "done",
  paused: "todo",
};

export interface ClientServices {
  /** Service ids in catalogue order (managed-website, digital-growth, local-seo-aeo). */
  readonly addOns: readonly string[];
  /** What the active lines bill each month, GST included (a line's net is what is charged). */
  readonly monthlyCents: number;
}

export function servicesByBusiness(lines: readonly LiveServiceLine[]): ReadonlyMap<string, ClientServices> {
  const seen = new Map<string, { readonly ids: Set<string>; monthlyCents: number }>();
  for (const line of lines) {
    const entry = seen.get(line.businessId) ?? { ids: new Set<string>(), monthlyCents: 0 };
    entry.ids.add(line.addOn);
    if (line.status === "active") entry.monthlyCents += line.netAmountCents;
    seen.set(line.businessId, entry);
  }
  return new Map(
    [...seen].map(([businessId, entry]) => [
      businessId,
      { addOns: MONTHLY_ADD_ON_IDS.filter((id) => entry.ids.has(id)), monthlyCents: entry.monthlyCents },
    ]),
  );
}
