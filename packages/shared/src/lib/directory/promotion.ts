import type { DirectoryPaidTag, DirectoryPromotion } from "@fynix/db";
// The subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { chargedAmountCents, GST_BASIS_POINTS } from "@fynix/billing/tax";

/*
 * Paid listing tags on the local directory, as the customer's Listing page and the staff console show them. A week of one
 * tag is ₹299 plus 18% GST, paid once with no auto-renew; the directory always shows the tag with an "Ad" marker. The
 * ids come from the database enum (directory_paid_tag); the labels and marker match the website contract's PAID_TAGS
 * and PAID_TAG_MARKER (apps/platform/lib/directory-api.ts), which a parity test checks.
 */

export interface PromotionTagOption {
  readonly id: DirectoryPaidTag;
  readonly label: string;
  /** One line on what the tag says about the business, for choosing between them. */
  readonly hint: string;
}

/** In the order the Listing page offers them, which is also the contract's order. */
export const PROMOTION_TAGS: readonly PromotionTagOption[] = [
  { id: "hot_new", label: "Hot & New", hint: "For a business that has just opened or just launched something new." },
  { id: "most_searched", label: "Most Searched", hint: "For a business people in your area look for often." },
  { id: "popular_near_you", label: "Popular Near You", hint: "For a neighbourhood favourite." },
];

export const PROMOTION_TAG_LABELS: Readonly<Record<DirectoryPaidTag, string>> = {
  hot_new: "Hot & New",
  most_searched: "Most Searched",
  popular_near_you: "Popular Near You",
};

/** Shown after every paid tag: paid placement is always disclosed. */
export const PROMOTION_MARKER = "Ad";

/** One payment buys this many days (the database's DIRECTORY_PROMOTION_DAYS). */
export const PROMOTION_DAYS = 7;
/** The Listing page reminds the customer to renew once this many days or fewer are left. */
export const PROMOTION_REMINDER_DAYS = 2;

/** The week's net price in paise: ₹299. */
export const PROMOTION_WEEK_NET_PAISE = 29_900;
/** GST on it, in basis points. */
export const PROMOTION_TAX_BASIS_POINTS = GST_BASIS_POINTS;
/** What one week is charged, tax included: ₹352.82. Worked out by the one tax helper every charge uses. */
export const PROMOTION_WEEK_CHARGED_PAISE = chargedAmountCents(PROMOTION_WEEK_NET_PAISE, 0, PROMOTION_TAX_BASIS_POINTS);
/** The GST part of that, for the breakdown the customer sees. */
export const PROMOTION_WEEK_TAX_PAISE = PROMOTION_WEEK_CHARGED_PAISE - PROMOTION_WEEK_NET_PAISE;
/** The directory is in India, so a week is always priced in rupees. */
export const PROMOTION_CURRENCY = "INR";

const DAY_MS = 24 * 60 * 60 * 1000;
const TAG_IDS: readonly string[] = PROMOTION_TAGS.map((tag) => tag.id);

/** "Hot & New": how the directory shows the tag, and how the dashboard names it. */
export function promotionTagDisplay(tag: DirectoryPaidTag): string {
  return PROMOTION_TAG_LABELS[tag];
}

/** The charge's description on Billing and the receipt: "Hot & New listing tag, 7 days". */
export function promotionChargeDescription(tag: DirectoryPaidTag): string {
  return `${PROMOTION_TAG_LABELS[tag]} listing tag, ${PROMOTION_DAYS} days`;
}

/** The tag a form posted, or null for anything that is not one of the three. */
export function parsePromotionTag(value: FormDataEntryValue | null): DirectoryPaidTag | null {
  return typeof value === "string" && TAG_IDS.includes(value) ? (value as DirectoryPaidTag) : null;
}

type UpcomingWeek = Pick<DirectoryPromotion, "tag" | "startsAt" | "endsAt" | "visible">;

/** Where the business's paid tag stands at a moment, for the Listing page. */
export interface PromotionStatus {
  /** The tag running now, or null. */
  readonly running: UpcomingWeek | null;
  /** A week of the same tag booked to follow it, or null. */
  readonly booked: UpcomingWeek | null;
  /** When the last paid week ends: the running one, or the booked one after it. Null when nothing is running. */
  readonly endsAt: Date | null;
  /** Whole days left until `endsAt`, rounded up (a week just bought has 7). 0 when nothing is running. */
  readonly daysLeft: number;
  /** Whether the tag is shown (the customer's switch). True when nothing is running. */
  readonly visible: boolean;
  /** Time to remind them to renew: the last paid week ends within PROMOTION_REMINDER_DAYS and none follows it. */
  readonly remind: boolean;
  /** Whether they can pay for another week of the running tag now (nothing booked after it yet). */
  readonly canRenew: boolean;
}

/**
 * Works out the Promotion section from the business's upcoming weeks (listUpcomingDirectoryPromotions, ends after
 * `now`, earliest first). A week that starts in the future is only ever a renewal booked after the running one.
 */
export function promotionStatus(upcoming: readonly UpcomingWeek[], now: Date): PromotionStatus {
  const nowMs = now.getTime();
  const running = upcoming.find((week) => week.startsAt.getTime() <= nowMs && nowMs < week.endsAt.getTime()) ?? null;
  const booked = upcoming.find((week) => week.startsAt.getTime() > nowMs) ?? null;
  const last = booked ?? running;
  if (running === null || last === null) {
    return { running: null, booked, endsAt: null, daysLeft: 0, visible: true, remind: false, canRenew: false };
  }
  const leftMs = last.endsAt.getTime() - nowMs;
  const daysLeft = Math.max(0, Math.ceil(leftMs / DAY_MS));
  return {
    running,
    booked,
    endsAt: last.endsAt,
    daysLeft,
    visible: running.visible,
    remind: booked === null && leftMs <= PROMOTION_REMINDER_DAYS * DAY_MS,
    canRenew: booked === null,
  };
}

/** "6 Oct": the day a week ends, in the directory's own zone (Asia/Kolkata). */
export function formatPromotionDay(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("A promotion date must be a valid Date");
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(date);
}
