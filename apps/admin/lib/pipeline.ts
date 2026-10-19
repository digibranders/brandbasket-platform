import type { AddOnToContact, ClientSummary, Lead, LeadStatus, PaymentNeedingAttention, ProjectStatus } from "@brandbasket/db";
import { addOnById, isAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { LEAD_STATUS_LABELS } from "@brandbasket/shared/lib/lead-status";
import { PROJECT_STATUS_LABELS } from "@brandbasket/shared/lib/project-status";
import type { WaitingClient } from "./waiting-clients";

/** The five places a business can be on its way from first enquiry to a live website. */
export type JourneyStage = "lead" | "setup" | "building" | "preview" | "live";

export const JOURNEY_STAGES: readonly JourneyStage[] = ["lead", "setup", "building", "preview", "live"];

export const JOURNEY_STAGE_LABELS: Readonly<Record<JourneyStage, string>> = {
  lead: "Leads",
  setup: "Setting up",
  building: "Building",
  preview: "Preview",
  live: "Live",
};

const STAGE_BY_PROJECT_STATUS: Readonly<Record<ProjectStatus, JourneyStage | "paused">> = {
  onboarding: "setup",
  submitted: "building",
  building: "building",
  preview: "preview",
  revisions: "preview",
  approved: "preview",
  live: "live",
  on_hold: "paused",
  cancelled: "paused",
};

/**
 * Lead statuses still on the way in. `account_created` is a sign-up on the dashboard that has not paid: it has a business,
 * but a business is a client only once its first plan payment is captured (listClients), so until then it is a lead and
 * must be drawn as one. A `paid` lead is a client by then and appears as one.
 */
const PIPELINE_LEAD_STATUSES: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
  "new",
  "call_booked",
  "call_done",
  "agreed",
  "invite_sent",
  "account_created",
]);

/** Where a business is. One with no project yet has just signed up, so it is setting up. */
export function clientStage(client: Pick<ClientSummary, "project">): JourneyStage | "paused" {
  return client.project === null ? "setup" : STAGE_BY_PROJECT_STATUS[client.project.status];
}

export function isLeadInPipeline(lead: Pick<Lead, "status">): boolean {
  return PIPELINE_LEAD_STATUSES.has(lead.status);
}

/** Why someone needs us, most urgent kind first. */
export type AttentionKind = "payment" | "add-on" | "overdue" | "due" | "new-lead";

export interface AttentionItem {
  /** Unique across the list; a business can appear once per kind. */
  readonly key: string;
  readonly kind: AttentionKind;
  /** The business id, or the lead id for a new lead. */
  readonly subjectId: string;
  readonly href: string;
  readonly name: string;
  /** A few words, shown under the avatar and in the focus strip. */
  readonly reason: string;
  /** The deadline for previews; when it happened for payments and leads. */
  readonly at: Date | null;
}

export interface AttentionInput {
  readonly flagged: readonly Pick<PaymentNeedingAttention, "paymentId" | "businessId" | "businessName" | "reason" | "raisedAt">[];
  /** Paid add-on purchases the team has not yet got in touch about (listAddOnsToContact). */
  readonly addOns: readonly AddOnToContact[];
  readonly waiting: readonly (Pick<WaitingClient, "dueAt" | "overdue"> & {
    readonly client: Pick<ClientSummary, "businessId" | "businessName">;
  })[];
  readonly newLeads: readonly Pick<Lead, "id" | "businessName" | "createdAt">[];
  readonly now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How late a promised preview is, in the words used everywhere a late preview is shown. */
export function lateReason(dueAt: Date, now: Date): string {
  const days = Math.floor((now.getTime() - dueAt.getTime()) / DAY_MS);
  if (days < 1) return "Preview overdue";
  return `Preview ${days} ${days === 1 ? "day" : "days"} late`;
}

/** What to tell staff about one add-on purchase: a press release to start, or a new monthly add-on to set up. */
function addOnReason(purchase: AddOnToContact): string {
  if (purchase.kind === "press-release") return "Press release to start";
  if (!isAddOnId(purchase.addOn)) throw new Error(`Unknown add-on ${purchase.addOn} on purchase ${purchase.id}`);
  return `New add-on to set up: ${addOnById(purchase.addOn).title}`;
}

/**
 * Everything waiting on the team, in the order to deal with it: money that couldn't be applied, new add-on purchases
 * (oldest first, since a paying customer is waiting), previews past their promise (latest first), previews coming due
 * (soonest first), then new enquiries (newest first). Builds without a deadline are left out; they are visible on the
 * map but have no clock running.
 */
export function attentionItems({ flagged, addOns, waiting, newLeads, now }: AttentionInput): AttentionItem[] {
  const payments = flagged.map(
    (payment): AttentionItem => ({
      key: `payment:${payment.paymentId}`,
      kind: "payment",
      subjectId: payment.businessId,
      href: `/clients/${payment.businessId}`,
      name: payment.businessName,
      reason: "Payment to sort",
      at: payment.raisedAt,
    }),
  );

  const purchases = [...addOns]
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id))
    .map(
      (purchase): AttentionItem => ({
        key: `add-on:${purchase.kind}:${purchase.id}`,
        kind: "add-on",
        subjectId: purchase.businessId,
        href: `/clients/${purchase.businessId}#add-ons`,
        name: purchase.businessName,
        reason: addOnReason(purchase),
        at: purchase.at,
      }),
    );

  const withDeadline = waiting.flatMap((entry) => (entry.dueAt === null ? [] : [{ ...entry, dueAt: entry.dueAt }]));
  const byDeadline = (a: { dueAt: Date }, b: { dueAt: Date }): number => a.dueAt.getTime() - b.dueAt.getTime();

  const overdue = withDeadline
    .filter((entry) => entry.overdue)
    .sort(byDeadline)
    .map(
      (entry): AttentionItem => ({
        key: `overdue:${entry.client.businessId}`,
        kind: "overdue",
        subjectId: entry.client.businessId,
        href: `/clients/${entry.client.businessId}`,
        name: entry.client.businessName,
        reason: lateReason(entry.dueAt, now),
        at: entry.dueAt,
      }),
    );

  const due = withDeadline
    .filter((entry) => !entry.overdue)
    .sort(byDeadline)
    .map(
      (entry): AttentionItem => ({
        key: `due:${entry.client.businessId}`,
        kind: "due",
        subjectId: entry.client.businessId,
        href: `/clients/${entry.client.businessId}`,
        name: entry.client.businessName,
        reason: "Preview due",
        at: entry.dueAt,
      }),
    );

  const leads = [...newLeads]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(
      (lead): AttentionItem => ({
        key: `lead:${lead.id}`,
        kind: "new-lead",
        subjectId: lead.id,
        href: `/leads/${lead.id}`,
        name: lead.businessName,
        reason: LEAD_STATUS_LABELS.new,
        at: lead.createdAt,
      }),
    );

  return [...payments, ...purchases, ...overdue, ...due, ...leads];
}

/** The most urgent item for each business or lead, for marking avatars. Assumes `items` is already in order. */
export function attentionBySubject(items: readonly AttentionItem[]): ReadonlyMap<string, AttentionItem> {
  const bySubject = new Map<string, AttentionItem>();
  for (const item of items) {
    if (!bySubject.has(item.subjectId)) bySubject.set(item.subjectId, item);
  }
  return bySubject;
}

/** One avatar on the map. */
export interface JourneySubject {
  readonly id: string;
  readonly kind: "client" | "lead";
  readonly name: string;
  readonly href: string;
  /** The finer status inside the stage, e.g. "Changes requested" within Preview. */
  readonly statusLabel: string;
  readonly createdAt: Date;
  readonly attention: AttentionItem | null;
}

export interface Journey {
  readonly byStage: Readonly<Record<JourneyStage, readonly JourneySubject[]>>;
  /** On hold or cancelled: not on the way anywhere, so counted rather than drawn. */
  readonly paused: number;
}

function newestFirst(a: JourneySubject, b: JourneySubject): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}

const KIND_RANK: Readonly<Record<AttentionKind, number>> = { payment: 0, "add-on": 1, overdue: 2, due: 3, "new-lead": 4 };

/**
 * Anyone needing attention first, most urgent kind first, so the ringed ones always get a place on the map even when
 * a band overflows; then everyone else, newest first.
 */
function bandOrder(a: JourneySubject, b: JourneySubject): number {
  if (a.attention !== null && b.attention !== null) {
    const byKind = KIND_RANK[a.attention.kind] - KIND_RANK[b.attention.kind];
    if (byKind !== 0) return byKind;
    return newestFirst(a, b);
  }
  if (a.attention !== null) return -1;
  if (b.attention !== null) return 1;
  return newestFirst(a, b);
}

export function journeySubjects(
  clients: readonly ClientSummary[],
  leads: readonly Lead[],
  attention: ReadonlyMap<string, AttentionItem>,
): Journey {
  const byStage: Record<JourneyStage, JourneySubject[]> = { lead: [], setup: [], building: [], preview: [], live: [] };
  let paused = 0;

  for (const client of clients) {
    const stage = clientStage(client);
    if (stage === "paused") {
      paused += 1;
      continue;
    }
    byStage[stage].push({
      id: client.businessId,
      kind: "client",
      name: client.businessName,
      href: `/clients/${client.businessId}`,
      statusLabel: client.project === null ? PROJECT_STATUS_LABELS.onboarding : PROJECT_STATUS_LABELS[client.project.status],
      createdAt: client.createdAt,
      attention: attention.get(client.businessId) ?? null,
    });
  }

  for (const lead of leads) {
    if (!isLeadInPipeline(lead)) continue;
    byStage.lead.push({
      id: lead.id,
      kind: "lead",
      name: lead.businessName,
      href: `/leads/${lead.id}`,
      statusLabel: LEAD_STATUS_LABELS[lead.status],
      createdAt: lead.createdAt,
      attention: attention.get(lead.id) ?? null,
    });
  }

  for (const stage of JOURNEY_STAGES) byStage[stage].sort(bandOrder);
  return { byStage, paused };
}
