import "server-only";
import { withTenantScope } from "@brandbasket/db";
import { getAppDb } from "@/lib/db";
import type { Service } from "@/lib/guard-rules";
import type { CustomerContext } from "@/lib/guards";
import { checklistRows, type ChecklistRow, type SavedAnswers } from "./rules-items";
import type { OnboardingSnapshot } from "./rules-snapshot";
import { postingServiceHasAccounts, readSavedAnswers } from "./server/saved-answers";
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

const EMPTY_ANSWERS: SavedAnswers = { social: undefined, search: undefined };

/** The checklist's state for a customer. Throws on a failed read: the caller wraps it in load(), so a failure is never shown as all open or all done. */
export async function readChecklistState(customer: CustomerContext): Promise<ChecklistState> {
  const { services } = customer;
  const wantsSetup = services.includes("social") || services.includes("search");
  // Accounts the customer connected in Social media are in the posting service, not in the database: asked before the transaction, never inside it.
  const connectedInPostingService = services.includes("social") ? await postingServiceHasAccounts(customer) : false;
  const { snapshot, answers } = await withTenantScope(getAppDb(), customer.tenant, async (tx) => ({
    snapshot: services.includes("website") ? await readOnboardingSnapshot(tx) : null,
    answers: wantsSetup ? await readSavedAnswers(tx, customer.businessId, new Date(), connectedInPostingService) : EMPTY_ANSWERS,
  }));
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
