import "server-only";
import {
  countActiveErrorIssues,
  countSupportTicketsByStatus,
  listAddOnsToContact,
  listClients,
  listErrorIssues,
  listLeads,
  listPaymentsNeedingAttention,
  listSetupCallsBetween,
  listSupportTicketsForStaff,
  sumCapturedPaymentsBetween,
  type AddOnToContact,
  type BookedCall,
  type ClientSummary,
  type ErrorIssue,
  type Lead,
  type PaymentNeedingAttention,
  type SupportStatus,
  type SupportTicket,
} from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { FigureItem } from "@/components/console/figures";
import { businessFigures, figuresInput } from "@/lib/business-figures";
import { attentionItems } from "@/lib/pipeline";
import { monthRange, todayRange } from "@/lib/team-time";
import { todayQueue, type TodayItem } from "@/lib/today-queue";
import { clientsWaitingOnUs } from "@/lib/waiting-clients";
import { getStaffDb } from "./db";
import { readSystemHealth, type SystemLine } from "./system-health";

/** Far more flagged payments and add-ons than are ever open at once, so none is left out. */
const ATTENTION_READ_LIMIT = 100;
/** The support query's page size cap. */
const NEW_TICKETS_READ_LIMIT = 25;

/** One read that may fail without taking the page down: a failure logs and gives `fallback`. */
async function guarded<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error(`[today] could not read ${label}`, errorLogInfo(error));
    return fallback;
  }
}

interface QueueSources {
  readonly clients: readonly ClientSummary[];
  readonly leads: readonly Lead[];
  readonly flagged: readonly PaymentNeedingAttention[];
  readonly addOns: readonly AddOnToContact[];
  readonly newTickets: readonly SupportTicket[];
  readonly newErrors: readonly ErrorIssue[];
}

async function readQueueSources(): Promise<QueueSources> {
  const db = getStaffDb();
  const [clients, leads, flagged, addOns, newTickets, newErrors] = await Promise.all([
    guarded("clients", () => listClients(db), []),
    guarded("leads", () => listLeads(db, {}), []),
    guarded("flagged payments", () => listPaymentsNeedingAttention(db, { limit: ATTENTION_READ_LIMIT }), []),
    guarded("add-ons to contact", () => listAddOnsToContact(db, ATTENTION_READ_LIMIT), []),
    guarded("new requests", async () => (await listSupportTicketsForStaff(db, { status: "new", limit: NEW_TICKETS_READ_LIMIT })).items, []),
    guarded("new errors", async () => (await listErrorIssues(db, { status: "new" })).issues, []),
  ]);
  return { clients, leads, flagged, addOns, newTickets, newErrors };
}

function queueFrom(sources: QueueSources, now: Date): readonly TodayItem[] {
  return todayQueue({
    attention: attentionItems({
      flagged: sources.flagged,
      addOns: sources.addOns,
      waiting: clientsWaitingOnUs(sources.clients, now),
      newLeads: sources.leads.filter((lead) => lead.status === "new"),
      now,
    }),
    newTickets: sources.newTickets,
    unpaidSignups: sources.leads.filter((lead) => lead.status === "account_created"),
    newErrors: sources.newErrors,
    endOfToday: todayRange(now).end,
  });
}

/** Everything that needs a person right now, late first. */
export async function loadTodayItems(now: Date): Promise<readonly TodayItem[]> {
  return queueFrom(await readQueueSources(), now);
}

/** The rail's Today count: the length of the queue. */
export async function countTodayItems(): Promise<number> {
  return (await loadTodayItems(new Date())).length;
}

export interface TodayPage {
  readonly items: readonly TodayItem[];
  readonly figures: readonly FigureItem[];
  readonly calls: readonly BookedCall[];
  readonly systems: readonly SystemLine[];
}

/** Everything the Today page draws, each source read once. */
export async function loadTodayPage(now: Date): Promise<TodayPage> {
  const db = getStaffDb();
  const month = monthRange(now);
  const today = todayRange(now);
  const [sources, collected, ticketCounts, activeErrors, calls, systems] = await Promise.all([
    readQueueSources(),
    guarded("money collected", () => sumCapturedPaymentsBetween(db, month.start, month.end), []),
    guarded<Readonly<Record<SupportStatus, number>> | null>("request counts", () => countSupportTicketsByStatus(db), null),
    guarded("open errors", () => countActiveErrorIssues(db), 0),
    guarded("calls today", () => listSetupCallsBetween(db, today.start, today.end), []),
    readSystemHealth(now),
  ]);
  return {
    items: queueFrom(sources, now),
    figures: businessFigures(figuresInput({ leads: sources.leads, clients: sources.clients, collected, ticketCounts, activeErrors }, now)),
    calls,
    systems,
  };
}
