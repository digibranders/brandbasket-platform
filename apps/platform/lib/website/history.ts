import type { ProjectStatus } from "@brandbasket/db";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { BRAND_TIME_ZONE, shortDay, slotLabel } from "@/lib/call-dates";
import { previewHost } from "@/lib/website/address";
import { requestHref } from "@/lib/requests/links";
import type { ProgressKind } from "@/lib/website/progress-view";

/** One preview we sent: its number, the link and when it went out. */
export interface SentVersion {
  readonly version: number;
  readonly url: string;
  readonly sentAt: Date;
}

/** One round of changes the customer sent: the request it opened, the round, what they wrote and when. */
export interface SentChanges {
  readonly ticketId: string;
  readonly round: number;
  readonly body: string | null;
  readonly sentAt: Date;
}

export const OUTCOME_CHANGES = "You asked for changes";
export const OUTCOME_APPROVED = "You approved it";

export interface VersionRow {
  readonly version: number;
  /** The preview's host, or null when the stored link is not a web link. */
  readonly host: string | null;
  /** The https link to open, or null when there is none to open. */
  readonly href: string | null;
  /** "Mon 2 Nov, 3:57 pm", in India. */
  readonly sent: string;
  readonly outcome: string | null;
  /** The version that is serving the website now. */
  readonly live: boolean;
  /** The newest version we sent: the one Approve and Ask for changes belong to. */
  readonly newest: boolean;
}

/** The row at the top while changes are being made: the version that is not sent yet. */
export interface InProgressRow {
  readonly version: number;
  /** "Wed 4 Nov", or null when no day is promised. */
  readonly readyBy: string | null;
}

const newestFirst = <T extends { readonly sentAt: Date }>(items: readonly T[]): T[] => [...items].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

/**
 * The version history, newest first. A version's outcome is what the customer did with it: the changes they sent after it was
 * sent and before the next one, or, for the newest, approving it. A version with neither has no outcome. The newest is "live"
 * once the project is live.
 */
export function versionRows(versions: readonly SentVersion[], changes: readonly SentChanges[], status: ProjectStatus | null): readonly VersionRow[] {
  const sent = newestFirst(versions);
  return sent.map((item, index): VersionRow => {
    const newest = index === 0;
    const replacedAt = newest ? Number.POSITIVE_INFINITY : (sent[index - 1]?.sentAt.getTime() ?? Number.POSITIVE_INFINITY);
    const askedChanges = changes.some((change) => change.sentAt.getTime() >= item.sentAt.getTime() && change.sentAt.getTime() < replacedAt);
    const approved = newest && (status === "approved" || status === "live");
    return {
      version: item.version,
      host: previewHost(item.url),
      href: safeExternalHref(item.url),
      sent: slotLabel(item.sentAt.toISOString()),
      // The project's own status says the newest was answered with changes even when the request could not be read.
      outcome: askedChanges || (newest && status === "revisions") ? OUTCOME_CHANGES : approved ? OUTCOME_APPROVED : null,
      live: newest && status === "live",
      newest,
    };
  });
}

/** The unsent version shown while changes are made, or null in every other state. `readyBy` is a `YYYY-MM-DD` day or null. */
export function inProgressRow(versions: readonly SentVersion[], status: ProjectStatus | null, readyBy: string | null): InProgressRow | null {
  if (status !== "revisions") return null;
  const last = versions.reduce((highest, item) => Math.max(highest, item.version), 0);
  return { version: last + 1, readyBy: readyBy === null ? null : shortDay(readyBy) };
}

export interface ChangesView {
  readonly round: number;
  /** The rounds the plan includes. */
  readonly of: number;
  /** "Mon 2 Nov, 4:05 pm", in India. */
  readonly asked: string;
  /** What the customer wrote, or null when it could not be read. */
  readonly text: string | null;
  readonly requestHref: string;
  /** The first version sent after they asked, or null while it is being made. */
  readonly doneIn: number | null;
}

/** The last round of changes the customer sent, or null when they have sent none. */
export function changesView(changes: readonly SentChanges[], versions: readonly SentVersion[], included: number): ChangesView | null {
  const last = newestFirst(changes)[0];
  if (last === undefined) return null;
  const after = versions.filter((item) => item.sentAt.getTime() > last.sentAt.getTime()).sort((a, b) => a.version - b.version)[0];
  const text = last.body?.trim() ?? "";
  return {
    round: last.round,
    of: Math.max(included, last.round),
    asked: slotLabel(last.sentAt.toISOString()),
    text: text === "" ? null : text,
    requestHref: requestHref(last.ticketId),
    doneIn: after?.version ?? null,
  };
}

export interface Detail {
  readonly label: string;
  readonly value: string;
}

export const ADDRESS_NOT_SET = "Set before launch";
const PLAN = "Managed Website";

interface DetailsInput {
  readonly live: boolean;
  /** The site's address, or null when none is set yet. */
  readonly address: string | null;
  /** The planned launch day (`YYYY-MM-DD`), only while it is still ahead. */
  readonly plannedLaunch: string | null;
  readonly launchedAt: Date | null;
  readonly roundsUsed: number;
  readonly roundsIncluded: number;
  readonly versionsSent: number;
}

/** The rows of "The details": before launch the plan, address, planned day and changes used; once live the plan, address, live day and versions sent. */
export function detailRows(input: DetailsInput): readonly Detail[] {
  const plan: Detail = { label: "Plan", value: PLAN };
  const address: Detail = { label: "Address", value: input.address ?? ADDRESS_NOT_SET };
  if (input.live) {
    const since = input.launchedAt === null ? null : shortDay(dayKey(input.launchedAt.toISOString(), BRAND_TIME_ZONE));
    return [plan, address, ...(since === null ? [] : [{ label: "Live since", value: since }]), { label: "Versions sent", value: String(input.versionsSent) }];
  }
  return [
    plan,
    address,
    ...(input.plannedLaunch === null ? [] : [{ label: "Planned launch", value: shortDay(input.plannedLaunch) }]),
    { label: "Changes used", value: `${input.roundsUsed} of ${input.roundsIncluded}` },
  ];
}

export interface StageChip {
  readonly label: string;
  readonly tone: "ok" | "warn" | "info";
}

/** The word and colour beside the stage's headline. */
export function stageChip(kind: ProgressKind): StageChip | null {
  switch (kind) {
    case "setup":
    case "kickoff":
      return { label: "Getting started", tone: "info" };
    case "building":
      return { label: "Building", tone: "info" };
    case "preview":
      return { label: "Ready to check", tone: "warn" };
    case "revising":
      return { label: "Changes in progress", tone: "info" };
    case "approved":
      return { label: "Going live", tone: "info" };
    case "live":
      return { label: "Live", tone: "ok" };
    case "paused":
      return { label: "Paused", tone: "warn" };
    case "none":
      return null;
  }
}
