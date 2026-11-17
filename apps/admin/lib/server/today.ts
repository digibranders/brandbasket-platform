import "server-only";
import {
  countActiveErrorIssues,
  countSupportQueues,
  countSupportTicketsByStatus,
  listAddOnsToContact,
  listBreaches,
  listClients,
  listDomainMoves,
  listErrorIssues,
  listKickoffBoard,
  listLeads,
  listOpenClosures,
  listOpenPrivacyRequests,
  listPaymentsNeedingAttention,
  listProjectsStartedWithoutCallConfirmation,
  listReportsForReview,
  listSetupCallsBetween,
  listSetupCallsForStaff,
  listStaffRoster,
  listSupportTicketsForStaff,
  sumCapturedPaymentsBetween,
  type AddOnToContact,
  type BookedCall,
  type ClientSummary,
  type DomainMoveRow,
  type ErrorIssue,
  type Lead,
  type OpenClosure,
  type PaymentNeedingAttention,
  type ReportForReview,
  type StaffCallRow,
  type StaffRosterRow,
  type StoredBreach,
  type StoredPrivacyRequest,
  type ProjectStartedWithoutConfirmation,
  type SupportStatus,
  type SupportTicket,
} from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { clientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import type { FigureItem } from "@/components/console/figures";
import { businessFigures, figuresInput } from "@/lib/business-figures";
import { groupCalls, type CallGroups } from "@/lib/calls-view";
import { attentionItems } from "@/lib/pipeline";
import { monthRange, todayRange } from "@/lib/team-time";
import { breachReportsDue, closuresErasingSoon, privacyRequestsDue, reportsToReview, silentPreviews } from "@/lib/today-sources";
import { todayQueue, type KickoffNeedingOutcome, type TodayItem } from "@/lib/today-queue";
import { clientsWaitingOnUs } from "@/lib/waiting-clients";
import { getStaffDb } from "./db";
import { countFailedDeliveries24h } from "./deliveries";
import { readGoogleToday } from "./google-today";
import { readSystemHealth, type SystemLine } from "./system-health";

/** Far more flagged payments and add-ons than are ever open at once, so none is left out. */
const ATTENTION_READ_LIMIT = 100;
/** The support query's page size cap. */
const NEW_TICKETS_READ_LIMIT = 25;
/** How far back a kickoff call is still asked about: the Calls page's "Just finished" uses the same window. */
const KICKOFF_LOOK_BACK_DAYS = 14;
/** How far back and ahead the Calls card looks (the old Calls page's window). */
const CALLS_PAST_DAYS = 7;
const CALLS_AHEAD_DAYS = 28;
const DAY_MS = 86_400_000;

/** One read that may fail without taking the page down: a failure logs, records its label in `failed` when given, and gives `fallback`. */
async function guarded<T>(label: string, read: () => Promise<T>, fallback: T, failed?: string[]): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error(`[today] could not read ${label}`, errorLogInfo(error));
    failed?.push(label);
    return fallback;
  }
}

interface QueueSources {
  readonly clients: readonly ClientSummary[];
  readonly leads: readonly Lead[];
  readonly staff: readonly StaffRosterRow[];
  readonly flagged: readonly PaymentNeedingAttention[];
  readonly addOns: readonly AddOnToContact[];
  readonly newTickets: readonly SupportTicket[];
  readonly newErrors: readonly ErrorIssue[];
  /** Failed deliveries in the last 24 hours; null when the read failed. */
  readonly failedDeliveries: number | null;
  /** Kickoff calls that are over and not marked held; null when the read failed. */
  readonly kickoffsNeedingOutcome: readonly KickoffNeedingOutcome[] | null;
  /** Projects whose build started automatically after 24h without call confirmation. */
  readonly unconfirmedStarts: readonly ProjectStartedWithoutConfirmation[];
  /** Google problems (a site that cannot be verified, a silent source, a lost sign-in for admins). */
  readonly google: readonly TodayItem[];
  readonly canSeeMoney: boolean;
  /** Domain move requests. */
  readonly domainMoves: readonly DomainMoveRow[];
  /** Compliance reads, empty without the oversight capability. */
  readonly privacyRequests: readonly StoredPrivacyRequest[];
  readonly breaches: readonly StoredBreach[];
  readonly closures: readonly OpenClosure[];
  /** Customer reports not yet sent. */
  readonly reports: readonly ReportForReview[];
}

interface QueueRead {
  readonly sources: QueueSources;
  /** Labels of the sources that failed to read, in the order they failed. */
  readonly failed: readonly string[];
}

/**
 * `canSeeMoney` is the staff member's "money" capability: without it the flagged payments are not read at all.
 * `canSeeGoogleAccount` is their "integrations" capability: without it the lost Google sign-in is not read.
 * `canSeeOversight` is their "oversight" capability: without it the privacy requests, breaches and closing accounts are not read.
 */
async function readQueueSources(now: Date, canSeeMoney: boolean, canSeeGoogleAccount: boolean, canSeeOversight: boolean): Promise<QueueRead> {
  const db = getStaffDb();
  const failed: string[] = [];
  const [clients, leads, staff, flagged, addOns, newTickets, newErrors, failedDeliveries, kickoffsNeedingOutcome, unconfirmedStarts, google, domainMoves, privacyRequests, breaches, closures, reports] = await Promise.all([
    guarded("clients", () => listClients(db), [], failed),
    guarded("leads", () => listLeads(db, {}), [], failed),
    guarded("staff roster", () => listStaffRoster(db), [], failed),
    canSeeMoney ? guarded("flagged payments", () => listPaymentsNeedingAttention(db, { limit: ATTENTION_READ_LIMIT }), [], failed) : Promise.resolve([]),
    guarded("add-ons to contact", () => listAddOnsToContact(db, ATTENTION_READ_LIMIT), [], failed),
    guarded("requests needing a reply", async () => (await listSupportTicketsForStaff(db, { queue: "needs_reply", limit: NEW_TICKETS_READ_LIMIT })).items, [], failed),
    guarded("new errors", async () => (await listErrorIssues(db, { status: "new" })).issues, [], failed),
    guarded<number | null>("deliveries", () => countFailedDeliveries24h(now), null, failed),
    guarded<KickoffNeedingOutcome[] | null>(
      "kickoff calls",
      async () =>
        (await listKickoffBoard(db, { now, lookBackDays: KICKOFF_LOOK_BACK_DAYS })).flatMap((row) =>
          row.heldAt === null && row.endsAt !== null && row.endsAt.getTime() <= now.getTime() && (row.projectStatus === null || row.projectStatus === "onboarding")
            ? [{ businessId: row.businessId, businessName: row.businessName, endsAt: row.endsAt }]
            : [],
        ),
      null,
      failed,
    ),
    guarded<readonly ProjectStartedWithoutConfirmation[]>(
      "unconfirmed starts",
      () => listProjectsStartedWithoutCallConfirmation(db),
      [],
      failed,
    ),
    guarded<readonly TodayItem[]>("Google", () => readGoogleToday(now, canSeeGoogleAccount), [], failed),
    guarded("domain moves", () => listDomainMoves(db), [], failed),
    canSeeOversight ? guarded("privacy requests", () => listOpenPrivacyRequests(db), [], failed) : Promise.resolve([]),
    canSeeOversight ? guarded("breaches", () => listBreaches(db), [], failed) : Promise.resolve([]),
    canSeeOversight ? guarded("closing accounts", () => listOpenClosures(db), [], failed) : Promise.resolve([]),
    guarded("reports", () => listReportsForReview(db), [], failed),
  ]);
  return {
    sources: { clients, leads, staff, flagged, addOns, newTickets, newErrors, failedDeliveries, kickoffsNeedingOutcome, unconfirmedStarts, google, domainMoves, privacyRequests, breaches, closures, reports, canSeeMoney },
    failed,
  };
}

function queueFrom(sources: QueueSources, now: Date): readonly TodayItem[] {
  const staffById = new Map(sources.staff.map((s) => [s.userId, s.name]));
  const billing: TodayItem[] = [];
  if (sources.canSeeMoney) {
    for (const client of sources.clients) {
      if (client.billing?.subscription?.status === "past_due") {
        billing.push({
          key: `billing:past_due:${client.businessId}`,
          kind: "payment",
          title: `Payment past due: ${client.businessName}`,
          detail: "Renewal payment failed",
          dueAt: client.billing.subscription.paidThroughAt,
          href: `/clients/${client.businessId}/billing`,
        });
      } else if (client.billing && clientPaymentState(client.billing, now).kind === "lapsed") {
        billing.push({
          key: `billing:lapsed:${client.businessId}`,
          kind: "payment",
          title: `Plan lapsed: ${client.businessName}`,
          detail: "Plan has ended",
          dueAt: client.billing.subscription?.paidThroughAt ?? client.createdAt,
          href: `/clients/${client.businessId}/billing`,
        });
      }
    }
  }

  const approvedPreviews = sources.clients.flatMap((client) =>
    client.project?.status === "approved"
      ? [{ businessId: client.businessId, businessName: client.businessName, dueAt: client.project.slaDueAt }]
      : [],
  );
  return todayQueue({
    attention: attentionItems({
      flagged: sources.flagged,
      addOns: sources.addOns,
      waiting: clientsWaitingOnUs(sources.clients, now),
      newLeads: sources.leads.filter((lead) => lead.status === "new"),
      now,
    }),
    newTickets: sources.newTickets,
    unpaidSignups: sources.leads
      .filter((lead) => lead.status === "account_created")
      .map((lead) => ({
        id: lead.id,
        businessName: lead.businessName,
        createdAt: lead.createdAt,
        ownerName: lead.assignedStaffId ? (staffById.get(lead.assignedStaffId) ?? null) : null,
      })),
    newErrors: sources.newErrors,
    failedDeliveries: sources.failedDeliveries,
    kickoffsNeedingOutcome: sources.kickoffsNeedingOutcome,
    billing,
    approvedPreviews,
    domainMoves: sources.domainMoves,
    unconfirmedStarts: sources.unconfirmedStarts,
    google: sources.google,
    privacyRequests: privacyRequestsDue(sources.privacyRequests),
    breaches: breachReportsDue(sources.breaches),
    closures: closuresErasingSoon(sources.closures, sources.clients, now),
    reportsToReview: reportsToReview(sources.reports, now),
    silentPreviews: silentPreviews(sources.clients, now),
    endOfToday: todayRange(now).end,
  });
}

/** Everything that needs a person right now, late first. */
export async function loadTodayItems(now: Date, canSeeMoney: boolean, canSeeGoogleAccount = false, canSeeOversight = false): Promise<readonly TodayItem[]> {
  return queueFrom((await readQueueSources(now, canSeeMoney, canSeeGoogleAccount, canSeeOversight)).sources, now);
}

/** The rail's Today count: the length of the queue. */
export async function countTodayItems(canSeeMoney: boolean, canSeeGoogleAccount = false, canSeeOversight = false): Promise<number> {
  return (await loadTodayItems(new Date(), canSeeMoney, canSeeGoogleAccount, canSeeOversight)).length;
}

export interface TodayPage {
  readonly items: readonly TodayItem[];
  /** Labels of queue sources that failed to read, so the page can say the queue may be incomplete. */
  readonly failed: readonly string[];
  readonly figures: readonly FigureItem[];
  readonly calls: readonly BookedCall[];
  readonly systems: readonly SystemLine[];
  /** Kickoff calls that are over and waiting for staff confirmation. */
  readonly pendingKickoffs: readonly KickoffNeedingOutcome[];
  /** Customer requests open or waiting on the customer (the Open requests tile); null when the count could not be read. */
  readonly openRequests: number | null;
  /** Calls coming up and from the last week, for the Calls card (today's calls are `calls`). */
  readonly callGroups: Pick<CallGroups, "upcoming" | "past">;
}

/** Everything the Today page draws, each source read once. Without `canSeeMoney` the collected figure and flagged payments are neither read nor shown. */
export async function loadTodayPage(now: Date, canSeeMoney: boolean, canSeeGoogleAccount = false, canSeeOversight = false): Promise<TodayPage> {
  const db = getStaffDb();
  const month = monthRange(now);
  const today = todayRange(now);
  const extraFailed: string[] = [];
  const [queue, collected, ticketCounts, activeErrors, calls, systems, openRequests, callRows] = await Promise.all([
    readQueueSources(now, canSeeMoney, canSeeGoogleAccount, canSeeOversight),
    canSeeMoney ? guarded("money collected", () => sumCapturedPaymentsBetween(db, month.start, month.end), []) : Promise.resolve(null),
    guarded<Readonly<Record<SupportStatus, number>> | null>("request counts", () => countSupportTicketsByStatus(db), null),
    guarded("open errors", () => countActiveErrorIssues(db), 0),
    guarded("calls today", () => listSetupCallsBetween(db, today.start, today.end), []),
    readSystemHealth(now),
    guarded<number | null>("open requests", async () => {
      const counts = await countSupportQueues(db);
      return counts.needsReply + counts.waitingOnClient;
    }, null, extraFailed),
    guarded<readonly StaffCallRow[]>(
      "calls",
      () => listSetupCallsForStaff(db, new Date(today.start.getTime() - CALLS_PAST_DAYS * DAY_MS), new Date(today.start.getTime() + CALLS_AHEAD_DAYS * DAY_MS)),
      [],
      extraFailed,
    ),
  ]);
  const { sources } = queue;
  const callGroups = groupCalls(callRows, now);
  return {
    items: queueFrom(sources, now),
    failed: [...queue.failed, ...extraFailed],
    figures: businessFigures(figuresInput({ leads: sources.leads, clients: sources.clients, collected, ticketCounts, activeErrors }, now)),
    calls,
    systems,
    pendingKickoffs: sources.kickoffsNeedingOutcome ?? [],
    openRequests,
    callGroups: { upcoming: callGroups.upcoming, past: callGroups.past },
  };
}
