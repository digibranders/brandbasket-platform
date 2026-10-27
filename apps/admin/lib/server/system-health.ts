import "server-only";
import { countActiveErrorIssues, deliveryHealth, type DeliveryHealth, type DeliverySource } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { DELIVERY_LABELS, DELIVERY_ORDER, deliveryLine } from "@/lib/system-health-lines";
import { getStaffDb } from "./db";

export type SystemState = "ok" | "warn" | "bad";

/** One line of the systems block: a source, whether it is working, and a few words of detail. */
export interface SystemLine {
  readonly key: string;
  readonly label: string;
  readonly state: SystemState;
  readonly detail: string;
}

/** Something whose health Today shows. `read` may throw; the block then says it could not check. */
export interface SystemSource {
  readonly key: string;
  readonly label: string;
  readonly read: (now: Date) => Promise<Pick<SystemLine, "state" | "detail">>;
}

const errors: SystemSource = {
  key: "errors",
  label: "Website errors",
  read: async () => {
    const open = await countActiveErrorIssues(getStaffDb());
    return open === 0 ? { state: "ok", detail: "0 new" } : { state: "bad", detail: `${open} open` };
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** One delivery read per Today render, shared by the five delivery sources that ask for the same moment. */
let lastHealth: { readonly atMs: number; readonly health: Promise<DeliveryHealth> } | null = null;

function healthAt(now: Date): Promise<DeliveryHealth> {
  if (lastHealth?.atMs !== now.getTime()) {
    lastHealth = { atMs: now.getTime(), health: deliveryHealth(getStaffDb(), new Date(now.getTime() - DAY_MS)) };
  }
  return lastHealth.health;
}

function deliverySource(source: DeliverySource): SystemSource {
  return { key: source, label: DELIVERY_LABELS[source], read: async (now) => deliveryLine(source, (await healthAt(now))[source], now) };
}

/** Every delivery source over the last 24 hours, then the open website errors; the page draws whatever this holds. */
export const SYSTEM_SOURCES: readonly SystemSource[] = [...DELIVERY_ORDER.map(deliverySource), errors];

/** Every source's line, in list order. One source failing never hides the others. */
export async function readSystemHealth(now: Date = new Date(), sources: readonly SystemSource[] = SYSTEM_SOURCES): Promise<readonly SystemLine[]> {
  return Promise.all(
    sources.map(async (source): Promise<SystemLine> => {
      try {
        return { key: source.key, label: source.label, ...(await source.read(now)) };
      } catch (error) {
        console.error(`[system-health] could not check ${source.key}`, errorLogInfo(error));
        return { key: source.key, label: source.label, state: "warn", detail: "could not check" };
      }
    }),
  );
}
