import type { RequestNeed, UnreadReply } from "@brandbasket/db";
import type { RequestNoticeInput } from "@brandbasket/shared/lib/account-panel";
import { hoursLabel } from "@brandbasket/shared/lib/change-requests";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { ServiceKey } from "@/lib/first-look";
import { requestHref } from "./links";

/**
 * What the bell says about requests: a quote to answer, a payment to make (a quote already accepted), a change to check,
 * and replies not yet read. A conversation that already has something for the customer to do is not listed again as a reply.
 */
export function noticeInputsFrom(needs: readonly RequestNeed[], unread: readonly UnreadReply[]): readonly RequestNoticeInput[] {
  const asked = new Set(needs.map((need) => need.ticketId));
  return [
    ...needs.map((need): RequestNoticeInput => ({ ticketId: need.ticketId, subject: need.subject, kind: need.state === "preview" ? "check" : need.acceptedAt === null ? "quote" : "payment" })),
    ...unread.filter((reply) => !asked.has(reply.ticketId)).map((reply): RequestNoticeInput => ({ ticketId: reply.ticketId, subject: reply.subject, kind: "reply" })),
  ];
}

/** One line of Overview's "Needs you": what to do, which service it belongs to (none for Billing or Something else), and where it opens. */
export interface NeedsYouRow {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly service: ServiceKey | null;
  readonly href: string;
}

const SERVICE_OF_KIND: Readonly<Record<RequestNeed["kind"], ServiceKey | null>> = { website: "website", social: "social", search: "search", billing: null, other: null };

/** The requests that wait on the customer, as Overview lists them: accept a quote, pay for one, check a change. */
export function needsYouFrom(needs: readonly RequestNeed[]): readonly NeedsYouRow[] {
  return needs.map((need): NeedsYouRow => {
    const price = need.quote === null ? null : `${hoursLabel(need.quote.hours)}, ${formatMoney(need.quote.amountCents, need.quote.currency)}`;
    const base = { key: `request-${need.ticketId}`, service: SERVICE_OF_KIND[need.kind], href: requestHref(need.ticketId) };
    if (need.state === "preview") return { ...base, label: `Check this change: ${need.subject}`, hint: "Ready to check" };
    if (need.acceptedAt !== null) return { ...base, label: `Pay for: ${need.subject}`, hint: price ?? "Waiting for your payment" };
    return { ...base, label: `Accept a quote: ${need.subject}`, hint: price ?? "Waiting for your OK" };
  });
}
