import { LEAD_STATUSES_TO_CONTACT, type Lead, type LeadInvite, type LeadSource, type LeadStatus } from "@brandbasket/db";
import { LEAD_SOURCE_ORDER } from "@brandbasket/shared/lib/lead-source";

/** The stages the Enquiries inbox groups leads into (mock screen 2). */
export type EnquiryBucket = "to_contact" | "talking" | "link_sent" | "won" | "lost" | "all";
type StageBucket = Exclude<EnquiryBucket, "all">;

export const ENQUIRY_BUCKETS: readonly EnquiryBucket[] = ["to_contact", "talking", "link_sent", "won", "lost", "all"];

export const ENQUIRY_BUCKET_LABELS: Readonly<Record<EnquiryBucket, string>> = {
  to_contact: "To contact",
  talking: "Talking",
  link_sent: "Setup link sent",
  won: "Won",
  lost: "Lost",
  all: "All",
};

const BUCKET_STATUSES: Readonly<Record<StageBucket, readonly LeadStatus[]>> = {
  to_contact: LEAD_STATUSES_TO_CONTACT,
  talking: ["call_booked", "call_done", "agreed"],
  link_sent: ["invite_sent"],
  won: ["paid"],
  lost: ["lost"],
};

const STAGE_BUCKETS: readonly StageBucket[] = ["to_contact", "talking", "link_sent", "won", "lost"];

export function bucketOf(status: LeadStatus): StageBucket {
  const bucket = STAGE_BUCKETS.find((candidate) => BUCKET_STATUSES[candidate].includes(status));
  if (bucket === undefined) throw new Error(`No enquiry stage for lead status ${status}`);
  return bucket;
}

export function inBucket(status: LeadStatus, bucket: EnquiryBucket): boolean {
  return bucket === "all" || bucketOf(status) === bucket;
}

export type OwnerFilter = "anyone" | "me" | "nobody";
export const OWNER_FILTERS: readonly OwnerFilter[] = ["anyone", "me", "nobody"];
export const OWNER_FILTER_LABELS: Readonly<Record<OwnerFilter, string>> = { anyone: "Anyone", me: "Mine", nobody: "Nobody" };

export type SourceFilter = LeadSource | "any";

/** What the Enquiries list shows, read from the address. */
export interface EnquiryQuery {
  readonly bucket: EnquiryBucket;
  readonly source: SourceFilter;
  readonly owner: OwnerFilter;
  readonly search: string;
}

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function oneOf<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Opens on To contact; a search with no view looks everywhere, because it is looking for one person. */
export function readEnquiryQuery(params: SearchParams): EnquiryQuery {
  const search = first(params.q).trim();
  return {
    bucket: oneOf(first(params.view), ENQUIRY_BUCKETS, search === "" ? "to_contact" : "all"),
    source: oneOf<SourceFilter>(first(params.source), LEAD_SOURCE_ORDER, "any"),
    owner: oneOf(first(params.owner), OWNER_FILTERS, "anyone"),
    search,
  };
}

/** The address of the list, or of one enquiry with `path`, for `query` with `change` applied. */
export function enquiryHref(query: EnquiryQuery, change: Partial<EnquiryQuery> = {}, path = "/leads"): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams({ view: next.bucket });
  if (next.source !== "any") params.set("source", next.source);
  if (next.owner !== "anyone") params.set("owner", next.owner);
  if (next.search !== "") params.set("q", next.search);
  return `${path}?${params.toString()}`;
}

/** The leads `query` shows, in the order given. `searchText` is what the search box matches for a lead. */
export function filterEnquiries(leads: readonly Lead[], query: EnquiryQuery, staffUserId: string, searchText: (lead: Lead) => string): readonly Lead[] {
  const term = query.search.toLowerCase();
  return leads.filter(
    (lead) =>
      inBucket(lead.status, query.bucket) &&
      (query.source === "any" || lead.source === query.source) &&
      (query.owner === "anyone" || (query.owner === "me" ? lead.assignedStaffId === staffUserId : lead.assignedStaffId === null)) &&
      (term === "" || searchText(lead).toLowerCase().includes(term)),
  );
}

export interface Waiting {
  readonly label: string;
  readonly tone: "late" | "soon" | "plain";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long an enquiry has waited: soon after an hour and late after a day while nobody has got in touch, plain after. */
export function waitingOf(createdAt: Date, now: Date, status: LeadStatus): Waiting {
  const elapsed = Math.max(0, now.getTime() - createdAt.getTime());
  const label = elapsed < HOUR ? `${Math.floor(elapsed / MINUTE)}m` : elapsed < DAY ? `${Math.floor(elapsed / HOUR)}h` : `${Math.floor(elapsed / DAY)}d`;
  if (bucketOf(status) !== "to_contact") return { label, tone: "plain" };
  return { label, tone: elapsed >= DAY ? "late" : elapsed >= HOUR ? "soon" : "plain" };
}

export type InviteState = "used" | "withdrawn" | "expired" | "open";

export const INVITE_STATE_LABELS: Readonly<Record<InviteState, string>> = {
  used: "Used",
  withdrawn: "Replaced by a newer link",
  expired: "Expired",
  open: "Open",
};

export function inviteStateOf(invite: LeadInvite, now: Date): InviteState {
  if (invite.redeemedAt !== null) return "used";
  if (invite.revokedAt !== null) return "withdrawn";
  return invite.expiresAt.getTime() <= now.getTime() ? "expired" : "open";
}

export interface HistoryLine {
  readonly at: Date;
  readonly text: string;
}

/** What happened to a lead, from what is recorded on it and its setup links, newest first. */
export function leadHistory(lead: Lead, invites: readonly LeadInvite[], sourceLabel: string): readonly HistoryLine[] {
  const lines: HistoryLine[] = [{ at: lead.createdAt, text: `Arrived: ${sourceLabel}` }];
  for (const invite of invites) {
    lines.push({ at: invite.createdAt, text: "Setup link sent" });
    if (invite.redeemedAt !== null) lines.push({ at: invite.redeemedAt, text: "Setup link used, account created" });
  }
  if (lead.attachedAt !== null) lines.push({ at: lead.attachedAt, text: "Account attached by hand" });
  return lines.sort((a, b) => b.at.getTime() - a.at.getTime());
}
