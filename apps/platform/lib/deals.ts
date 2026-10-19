import {
  DIRECTORY_DEALS_LIVE_MAX,
  DIRECTORY_DEAL_BADGE_MAX,
  DIRECTORY_DEAL_MAX_DAYS,
  DIRECTORY_DEAL_TERMS_MAX,
  DIRECTORY_DEAL_TITLE_MAX,
  type CreateDirectoryDealOutcome,
  type DirectoryDealFields,
} from "@brandbasket/db";
import { addDays, isIsoDate } from "@brandbasket/shared/lib/calendar/local-date";

/*
 * The Deals page's arithmetic (app/app-host/(protected)/deals/page.tsx): reading the form, the notices each action
 * redirects with, and which state a deal is in on a given day. The notices are codes, not messages, so nothing a
 * visitor types into the address is ever shown.
 */

/** Where an owner posts and manages deals. */
export const DEALS_PATH = "/deals";

export const DEAL_LIMITS = {
  title: DIRECTORY_DEAL_TITLE_MAX,
  badge: DIRECTORY_DEAL_BADGE_MAX,
  terms: DIRECTORY_DEAL_TERMS_MAX,
  liveMax: DIRECTORY_DEALS_LIVE_MAX,
  days: DIRECTORY_DEAL_MAX_DAYS,
} as const;

export const DEALS_NOTICES = {
  posted: { ok: true, text: "Your deal is up. It shows on your page and in your area's deals within a minute." },
  "posted-waiting": {
    ok: true,
    text: "Saved. It goes on show as soon as we've confirmed the business is yours, which we do for every listing.",
  },
  saved: { ok: true, text: "Deal updated." },
  removed: { ok: true, text: "Deal removed. It stops showing within a minute." },
  invalid: {
    ok: false,
    text: `Check the deal: a title up to ${String(DIRECTORY_DEAL_TITLE_MAX)} characters, a short badge up to ${String(DIRECTORY_DEAL_BADGE_MAX)}, the small print up to ${String(DIRECTORY_DEAL_TERMS_MAX)}, and dates up to ${String(DIRECTORY_DEAL_MAX_DAYS)} days apart.`,
  },
  "in-the-past": { ok: false, text: "A deal can't end before today." },
  limit: { ok: false, text: `You can have ${String(DIRECTORY_DEALS_LIVE_MAX)} deals running at once. End one to add another.` },
  "no-claim": { ok: false, text: "Add your business first, and then you can post deals." },
  "not-found": { ok: false, text: "That deal isn't there any more." },
} as const satisfies Readonly<Record<string, { readonly ok: boolean; readonly text: string }>>;

export type DealsNotice = keyof typeof DEALS_NOTICES;

export function readDealsNotice(value: string | string[] | undefined): DealsNotice | null {
  return typeof value === "string" && Object.hasOwn(DEALS_NOTICES, value) ? (value as DealsNotice) : null;
}

/** The notice an owner sees for a create's outcome; `approved` is whether the business's claim is confirmed. */
export function createNotice(outcome: CreateDirectoryDealOutcome, approved: boolean): DealsNotice {
  if (outcome.kind === "created") return approved ? "posted" : "posted-waiting";
  return outcome.kind;
}

export type ParsedDeal = { readonly ok: true; readonly fields: DirectoryDealFields } | { readonly ok: false; readonly notice: DealsNotice };

function textOf(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The deal a form describes, or the notice to show. The database checks the same limits again; this is for a clear
 * message. A start left empty means today; an end left empty means two weeks from the start. A deal that would end
 * before `today` is refused, but one that started earlier (editing a running deal) keeps its start.
 */
export function parseDealForm(form: FormData, today: string): ParsedDeal {
  const title = textOf(form.get("title"));
  const badge = textOf(form.get("badge"));
  const terms = textOf(form.get("terms"));
  if (title === "" || title.length > DIRECTORY_DEAL_TITLE_MAX) return { ok: false, notice: "invalid" };
  if (badge === "" || badge.length > DIRECTORY_DEAL_BADGE_MAX) return { ok: false, notice: "invalid" };
  if (terms === "" || terms.length > DIRECTORY_DEAL_TERMS_MAX) return { ok: false, notice: "invalid" };
  const startText = textOf(form.get("startsOn"));
  const startsOn = startText === "" ? today : startText;
  if (!isIsoDate(startsOn)) return { ok: false, notice: "invalid" };
  const endText = textOf(form.get("endsOn"));
  const endsOn = endText === "" ? addDays(startsOn, 13) : endText;
  if (!isIsoDate(endsOn)) return { ok: false, notice: "invalid" };
  if (endsOn < startsOn) return { ok: false, notice: "invalid" };
  if (endsOn < today) return { ok: false, notice: "in-the-past" };
  if (addDays(startsOn, DIRECTORY_DEAL_MAX_DAYS - 1) < endsOn) return { ok: false, notice: "invalid" };
  return { ok: true, fields: { title, badge, terms, startsOn, endsOn } };
}

export type DealState = "taken-down" | "upcoming" | "on" | "ended";

/** Where a deal stands on `today`, for the label on its row. */
export function dealState(deal: { readonly status: "live" | "taken_down"; readonly startsOn: string; readonly endsOn: string }, today: string): DealState {
  if (deal.status === "taken_down") return "taken-down";
  if (deal.endsOn < today) return "ended";
  if (deal.startsOn > today) return "upcoming";
  return "on";
}
