import type { ClientProject, DomainStatus, SetupCallBooking } from "@brandbasket/db";
import type { ClientTabSlug } from "@/lib/client-tabs";
import { NEXT_STEP_HEADLINES } from "@/lib/delivery-tab";
import { requestClock } from "@/lib/deadline-clock";
import { previewLateReason } from "@/lib/client-next-step";
import { shortDate } from "@/lib/team-time";

/** One read the Overview made: its value, or the fact that it failed. A failed read is never treated as "nothing found". */
export type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/** Days of silence after a sent preview before the strip says the customer may need a nudge (ruling 15). */
export const PREVIEW_SILENT_DAYS = 5;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type ExceptionKey =
  | "renewal"
  | "kickoff"
  | "late-preview"
  | "silent-preview"
  | "address"
  | "domain-move"
  | "unapplied"
  | "lapsed"
  | "closing"
  | "privacy";

export interface ClientException {
  readonly key: ExceptionKey;
  /** The line in the strip. */
  readonly text: string;
  /** A short figure beside the line ("1d late", "17d 08h remaining"), or null. */
  readonly clock: string | null;
  /** Red: something is late or failed. */
  readonly late: boolean;
  /** The Next step card's headline when this is the first exception. */
  readonly title: string;
  readonly detail: string;
  readonly tab: ClientTabSlug;
  /** The section on that tab to open at. */
  readonly anchor: string | null;
}

export interface ExceptionFacts {
  readonly now: Date;
  readonly businessName: string;
  readonly project: ClientProject | null;
  readonly movingTo: { readonly hostname: string } | null;
  readonly domainStatus: DomainStatus | null;
  /** `billing.subscription.status`, or null when there is no subscription. */
  readonly subscriptionStatus: string | null;
  /** The paid period ran out. */
  readonly lapsed: boolean;
  readonly booking: Read<SetupCallBooking | null>;
  /** Flagged payments on this client; `null` where the role does not see money, so nothing is read or claimed. */
  readonly flaggedPayments: Read<number> | null;
  readonly closure: Read<{ readonly eraseAfter: Date } | null>;
  readonly privacy: Read<{ readonly dueAt: Date } | null>;
}

export interface ExceptionResult {
  /** In priority order: the first one is the Next step card. */
  readonly exceptions: readonly ClientException[];
  /** The checks whose read failed, in words. Empty when every read succeeded. */
  readonly unreadable: readonly string[];
}

function span(ms: number): string {
  return ms >= DAY_MS ? `${Math.floor(ms / DAY_MS)}d` : `${Math.max(1, Math.floor(ms / HOUR_MS))}h`;
}

/**
 * Everything wrong for one client, in priority order (rulings 11 and 15): a failed renewal first, then a kickoff call that
 * ended with nobody confirming it, a first preview we owe past its date, a preview the customer has not answered, an address
 * that fails its check, a domain move, a flagged payment, a lapse, a closing account and an open privacy request.
 * A read that failed adds to `unreadable` and never to the list, so the caller can refuse to say "nothing is waiting".
 */
export function clientExceptions(facts: ExceptionFacts): ExceptionResult {
  const { now, project } = facts;
  const list: ClientException[] = [];
  const unreadable: string[] = [];

  if (facts.subscriptionStatus === "past_due") {
    list.push({
      key: "renewal",
      text: "The monthly renewal failed",
      clock: null,
      late: true,
      title: "Check the failed renewal",
      detail: "The provider is still retrying the renewal. Look at it on the Money tab before doing more work.",
      tab: "billing",
      anchor: null,
    });
  }

  if (!facts.booking.ok) unreadable.push("the kickoff call");
  else {
    const booking = facts.booking.value;
    if (
      booking !== null &&
      booking.heldAt === null &&
      booking.endsAt !== null &&
      booking.endsAt.getTime() <= now.getTime() &&
      (project === null || project.status === "onboarding")
    ) {
      const ago = span(now.getTime() - booking.endsAt.getTime());
      list.push({
        key: "kickoff",
        text: `The kickoff call ended ${ago} ago and nobody confirmed it`,
        clock: `${ago} late`,
        late: true,
        title: `Did the kickoff call with ${facts.businessName} happen?`,
        detail: "The 48 hour first preview clock starts when you confirm. After 24 hours the build starts on its own, labelled Started without call confirmation.",
        tab: "website",
        anchor: null,
      });
    }
  }

  const late = previewLateReason(project, now);
  if (project !== null && late !== null) {
    list.push({
      key: "late-preview",
      text: late,
      clock: null,
      late: true,
      title: NEXT_STEP_HEADLINES[project.status],
      detail: project.slaDueAt === null ? "The customer is waiting." : `It was promised for ${shortDate(project.slaDueAt)}. The customer is waiting.`,
      tab: "website",
      anchor: null,
    });
  }

  if (project !== null && project.status === "preview" && project.previewSentAt !== null) {
    const silent = now.getTime() - project.previewSentAt.getTime();
    if (silent >= PREVIEW_SILENT_DAYS * DAY_MS) {
      const days = Math.floor(silent / DAY_MS);
      list.push({
        key: "silent-preview",
        text: `Preview sent ${days} days ago, no reply`,
        clock: `${days}d`,
        late: false,
        title: "The customer has not replied to the preview",
        detail: "Nothing is waiting on us, but they may need a nudge.",
        tab: "website",
        anchor: null,
      });
    }
  }

  if (facts.domainStatus === "misconfigured" || facts.domainStatus === "degraded") {
    list.push({
      key: "address",
      text: "The website address does not pass its check",
      clock: null,
      late: true,
      title: "Check the website address",
      detail: "Its DNS or HTTPS check reports a problem. The Website tab has the detail.",
      tab: "website",
      anchor: "domain",
    });
  }

  if (facts.movingTo !== null) {
    list.push({
      key: "domain-move",
      text: "They asked to move to their own domain",
      clock: null,
      late: false,
      title: "Move them to their own domain",
      detail: `They want ${facts.movingTo.hostname}. Add it to the site and check DNS.`,
      tab: "website",
      anchor: "domain",
    });
  }

  if (facts.flaggedPayments !== null) {
    if (!facts.flaggedPayments.ok) unreadable.push("payments");
    else if (facts.flaggedPayments.value > 0) {
      const count = facts.flaggedPayments.value;
      list.push({
        key: "unapplied",
        text: count === 1 ? "A payment needs a look" : `${count} payments need a look`,
        clock: null,
        late: true,
        title: count === 1 ? "Check the payment that needs a look" : "Check the payments that need a look",
        detail: "They are flagged on the Money tab, with what to check.",
        tab: "billing",
        anchor: null,
      });
    }
  }

  if (facts.lapsed) {
    list.push({
      key: "lapsed",
      text: "The plan has lapsed",
      clock: null,
      late: true,
      title: "Their plan has lapsed",
      detail: "The paid period ran out and was not renewed.",
      tab: "billing",
      anchor: null,
    });
  }

  if (!facts.closure.ok) unreadable.push("the closing state");
  else if (facts.closure.value !== null) {
    const days = Math.max(0, Math.ceil((facts.closure.value.eraseAfter.getTime() - now.getTime()) / DAY_MS));
    list.push({
      key: "closing",
      text: `The account is closing and will be erased on ${shortDate(facts.closure.value.eraseAfter)}`,
      clock: `${days}d`,
      late: false,
      title: "This account is closing",
      detail: `Erased on ${shortDate(facts.closure.value.eraseAfter)} unless restored.`,
      tab: "people",
      anchor: null,
    });
  }

  if (!facts.privacy.ok) unreadable.push("privacy requests");
  else if (facts.privacy.value !== null) {
    const clock = requestClock(facts.privacy.value.dueAt, now);
    list.push({
      key: "privacy",
      text: "A privacy request is open",
      clock: clock.text,
      late: clock.late,
      title: "Answer the privacy request",
      detail: `It is due ${shortDate(facts.privacy.value.dueAt)}. It is logged under Compliance.`,
      tab: "people",
      anchor: null,
    });
  }

  return { exceptions: list, unreadable };
}
