import type { ChangeView, SupportMessage, SupportTicket } from "@brandbasket/db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/requests/move-actions", () => ({ approveChangeAction: vi.fn(), declineQuoteAction: vi.fn(), reopenRequestAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/requests/pay-actions", () => ({ acceptQuoteAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/billing/actions", () => ({ payChargeAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/requests/calls/actions", () => ({ bookCallAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/setup-call-actions", () => ({ loadCallSlots: vi.fn() }));
vi.mock("@/app/app-host/(support)/support/actions", () => ({ replyToSupportRequest: vi.fn(), acknowledgeSupportReplies: vi.fn() }));

import { RequestDetail } from "@/components/requests/request-detail";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { RequestDetail as RequestDetailData } from "@/lib/server/requests";

const QUOTE = { what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR" as const, workingDays: 5, quotedAt: new Date("2026-11-28T04:50:00.000Z") };
const NOW = new Date("2026-11-26T05:00:00.000Z");

const ticket = (overrides: Partial<SupportTicket> = {}) =>
  ({ id: "ticket-1", subject: "Add an Implants page", status: "triaged", createdAt: new Date("2026-11-27T12:30:00.000Z"), ...overrides }) as SupportTicket;

const message = { id: "m1", ticketId: "ticket-1", authorRole: "customer", visibility: "public", body: "Can we add a page for dental implants?", createdAt: new Date("2026-11-27T12:32:00.000Z"), details: null } as unknown as SupportMessage;

function change(overrides: Partial<ChangeView> = {}): ChangeView {
  return {
    id: "request-1",
    ticketId: "ticket-1",
    businessId: "business-1",
    kind: "website",
    page: "Home",
    state: "quoted",
    coverage: "paid",
    quote: QUOTE,
    acceptedAt: null,
    chargeId: null,
    chargeStatus: null,
    closedReason: null,
    createdAt: new Date("2026-11-27T12:30:00.000Z"),
    updatedAt: new Date("2026-11-28T04:50:00.000Z"),
    ...overrides,
  };
}

const CALLS = { options: [{ value: "website", label: "Website" }, { value: "other", label: "Something else" }] as const, bookingUrl: "https://cal.com/brandbasket/call", canBook: true };

function render(detail: Partial<RequestDetailData>, notice: { ok: boolean; text: string } | null = null, calls: typeof CALLS | null = null): string {
  const full: RequestDetailData = { ticket: ticket(), messages: [message], attachments: [], change: null, events: [], ...detail };
  return renderToStaticMarkup(createElement(RequestDetail, { detail: full, now: NOW, submissionKey: "reply-key-12345678", notice, calls })).replaceAll("<!-- -->", "");
}

const dark = (html: string): number => html.split(DARK_BUTTON).length - 1;
const plain = (html: string): string => html.replace(/<[^>]+>/g, "");

it("draws a quoted request: title, 'Website, Home', the stepper, the box with the one dark button, the thread and a Send button", () => {
  const html = render({ change: change(), events: [{ state: "requested", at: new Date("2026-11-27T12:30:00.000Z") }, { state: "quoted", at: new Date("2026-11-28T04:50:00.000Z") }] });
  expect(html).toContain("Add an Implants page");
  expect(plain(html)).toContain("Website, Home · you asked on 27 Nov");
  expect(html).toContain('aria-label="Where this request is"');
  expect(html).toContain("Accept and pay ₹1,500");
  expect(dark(html)).toBe(1);
  expect(html).toContain("Can we add a page for dental implants?");
  expect(html).toContain(">Send</button>");
  expect(html).toContain('name="submissionKey" value="reply-key-12345678"');
});

it("calls the reply button 'Ask for a fix' while a change waits to be checked", () => {
  const html = render({ change: change({ state: "preview", coverage: "free", quote: null }) });
  expect(html).toContain(">Ask for a fix</button>");
  expect(html).toContain("Looks good");
});

it("shows a question with its status word and no stepper or next-step box", () => {
  const html = render({ ticket: ticket({ status: "resolved" }) });
  expect(plain(html)).toContain("Question · you asked on 27 Nov");
  expect(html).toContain(">Done</span>");
  expect(html).not.toContain("Where this request is");
  expect(html).not.toContain("next-step-title");
  expect(dark(html)).toBe(0);
});

it("says a closed conversation is closed and offers a new request instead of a reply box", () => {
  const html = render({ ticket: ticket({ status: "closed" }) });
  expect(html).toContain("This conversation is closed.");
  expect(html).toContain('href="/requests/new"');
  expect(html).not.toContain("Write a reply");
});

it("announces what just happened, as an alert when it is a problem", () => {
  expect(render({ change: change() }, { ok: false, text: "That did not work. Please try again." })).toContain('role="alert"');
  expect(render({ change: change() }, { ok: true, text: "Payment received. We have started on your change." })).toContain('role="status"');
});

it("offers 'Talk about it on a call' in the header when calls are open, and not on a closed conversation or when they are not", () => {
  expect(render({ change: change() }, null, CALLS)).toContain(">Talk about it on a call</button>");
  expect(render({ change: change() }, null, null)).not.toContain("Talk about it on a call");
  expect(render({ ticket: ticket({ status: "closed" }) }, null, CALLS)).not.toContain("Talk about it on a call");
});
