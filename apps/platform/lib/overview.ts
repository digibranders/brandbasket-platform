import { formatMoney } from "@brandbasket/shared/lib/money";
import { BRAND_TIME_ZONE } from "@/lib/call-dates";
import type { ServiceKey } from "@/lib/first-look";
import { websiteEnquiriesLine, type WebsiteEnquiries } from "@/lib/site-events";

/** The first day of the month `now` falls in, in India, as `YYYY-MM-01` (monthly_snapshots.month). */
export function monthKey(now: Date): string {
  return `${new Intl.DateTimeFormat("en-CA", { timeZone: BRAND_TIME_ZONE, year: "numeric", month: "2-digit" }).format(now)}-01`;
}

/** The moment that month began in India, to count things "this month". */
export function monthStart(now: Date): Date {
  return new Date(`${monthKey(now)}T00:00:00+05:30`);
}

/** "November". */
export function monthName(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: BRAND_TIME_ZONE, month: "long" }).format(now);
}

/** Good morning, afternoon or evening by the hour in India. */
export function greetingFor(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: BRAND_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** A month's figures as the page reads them (monthly_snapshots without the bookkeeping). Null means not measured. */
export interface SnapshotView {
  readonly adSpendCents: number | null;
  readonly adBudgetCents: number | null;
  readonly adEnquiries: number | null;
  readonly postsPublished: number | null;
  readonly postsPlanned: number | null;
  readonly keywordsPageOne: number | null;
  readonly keywordsPageOnePrev: number | null;
}

/** One result sentence: a big figure, what it counts, and a quieter line under it. */
export interface ResultLine {
  readonly service: ServiceKey;
  readonly figure: string;
  readonly headline: string;
  readonly detail: string | null;
}

/**
 * The lines for "this month", only for the services the customer bought and only where a figure was measured. A line with
 * no data is left out; the page never shows a zero that means "we do not know".
 */
export function resultLines(input: {
  readonly services: readonly ServiceKey[];
  readonly chatbotLeads: number;
  readonly enquiries?: WebsiteEnquiries | null;
  readonly social: SnapshotView | null;
  readonly search: SnapshotView | null;
}): ResultLine[] {
  const lines: ResultLine[] = [];
  const enquiries = input.services.includes("website") && input.enquiries ? websiteEnquiriesLine(input.enquiries) : null;
  if (enquiries !== null) {
    lines.push({ service: "website", ...enquiries });
  } else if (input.services.includes("website") && input.chatbotLeads > 0) {
    lines.push({
      service: "website",
      figure: String(input.chatbotLeads),
      headline: input.chatbotLeads === 1 ? "person left their details with your chatbot" : "people left their details with your chatbot",
      detail: null,
    });
  }
  const social = input.services.includes("social") ? input.social : null;
  if (social !== null) {
    if (social.adEnquiries !== null) {
      const parts: string[] = [];
      if (social.adSpendCents !== null) {
        parts.push(
          social.adBudgetCents === null
            ? `${formatMoney(social.adSpendCents, "INR")} spent`
            : `${formatMoney(social.adSpendCents, "INR")} spent of ${formatMoney(social.adBudgetCents, "INR")}`,
        );
      }
      if (social.postsPublished !== null) parts.push(social.postsPublished === 1 ? "1 post published" : `${social.postsPublished} posts published`);
      lines.push({
        service: "social",
        figure: String(social.adEnquiries),
        headline: social.adEnquiries === 1 ? "enquiry came from your ads" : "enquiries came from your ads",
        detail: parts.length === 0 ? null : parts.join(", "),
      });
    } else if (social.postsPublished !== null) {
      lines.push({
        service: "social",
        figure: String(social.postsPublished),
        headline: social.postsPublished === 1 ? "post published" : "posts published",
        detail: null,
      });
    }
  }
  const search = input.services.includes("search") ? input.search : null;
  if (search !== null && search.keywordsPageOne !== null) {
    const now = search.keywordsPageOne;
    const before = search.keywordsPageOnePrev;
    lines.push({
      service: "search",
      figure: String(now),
      headline: "searches show you on Google's first page",
      detail: before === null ? null : now > before ? `Up from ${before}` : now < before ? `Down from ${before}` : "Same as last month",
    });
  }
  return lines;
}

/** One line of "What we did". */
export interface ActivityRow {
  readonly key: string;
  readonly at: Date;
  readonly label: string;
  readonly service: ServiceKey | null;
}

/** Staff updates plus the two dated facts we already store, newest first. */
export function activityRows(input: {
  readonly events: readonly { readonly id: string; readonly occurredAt: Date; readonly title: string; readonly service: ServiceKey | null }[];
  readonly previewSentAt: Date | null;
  readonly launchedAt: Date | null;
  readonly hostname: string | null;
  readonly limit: number;
}): ActivityRow[] {
  const rows: ActivityRow[] = input.events.map((event) => ({ key: event.id, at: event.occurredAt, label: event.title, service: event.service }));
  if (input.previewSentAt !== null) rows.push({ key: "preview", at: input.previewSentAt, label: "Your website preview was sent to you", service: "website" });
  if (input.launchedAt !== null) {
    rows.push({ key: "launched", at: input.launchedAt, label: input.hostname === null ? "Your website went live" : `Your website went live on ${input.hostname}`, service: "website" });
  }
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime() || b.key.localeCompare(a.key)).slice(0, input.limit);
}
