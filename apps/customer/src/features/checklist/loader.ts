import "server-only";
import { listServiceSetups, withTenantScope } from "@brandbasket/db";
import { getAppDb } from "@/lib/db";
import type { Service } from "@/lib/guard-rules";
import type { CustomerContext } from "@/lib/guards";
import { checklistRows, type ChecklistRow, type SavedAnswers } from "./rules-items";
import type { OnboardingSnapshot } from "./rules-snapshot";
import { readOnboardingSnapshot } from "./server/snapshot";

export interface ChecklistItemView {
  readonly key: string;
  readonly label: string;
  readonly service: "website" | "social" | "search";
  readonly done: boolean;
  /** "/checklist?item=<key>" */
  readonly href: string;
}

export interface ChecklistSummary {
  readonly items: readonly ChecklistItemView[];
  readonly done: number;
  readonly total: number;
}

/** Everything the checklist page needs, read in one tenant-scoped transaction. */
export interface ChecklistState {
  readonly services: readonly Service[];
  readonly rows: readonly ChecklistRow[];
  /** Null when the plan has no website: nothing was read for it. */
  readonly snapshot: OnboardingSnapshot | null;
  readonly answers: SavedAnswers;
}

/** The checklist's state for a customer. Throws on a failed read: the caller wraps it in load(), so a failure is never shown as all open or all done. */
export async function readChecklistState(customer: CustomerContext): Promise<ChecklistState> {
  const { services } = customer;
  const wantsSetup = services.includes("social") || services.includes("search");
  const { snapshot, setups } = await withTenantScope(getAppDb(), customer.tenant, async (tx) => ({
    snapshot: services.includes("website") ? await readOnboardingSnapshot(tx) : null,
    setups: wantsSetup ? await listServiceSetups(tx, customer.businessId) : [],
  }));
  const answers: SavedAnswers = {
    social: setups.find((row) => row.service === "social")?.answers,
    search: setups.find((row) => row.service === "search")?.answers,
  };
  return { services, rows: checklistRows(services, snapshot, answers), snapshot, answers };
}

export function summaryOf(state: ChecklistState): ChecklistSummary {
  const items = state.rows.map(({ item, done }): ChecklistItemView => ({
    key: item.key,
    label: item.label,
    service: item.service,
    done,
    href: `/checklist?item=${item.key}`,
  }));
  return { items, done: items.filter((item) => item.done).length, total: items.length };
}

/** Throws on a failed read; the caller wraps it in load(). Open items first, stable order. */
export async function loadChecklistSummary(customer: CustomerContext): Promise<ChecklistSummary> {
  return summaryOf(await readChecklistState(customer));
}
