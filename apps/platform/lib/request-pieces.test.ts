import type { ChangeEventView, ChangeView, SupportAttachment, SupportMessage } from "@brandbasket/db";
import type { ChangeState } from "@brandbasket/db/change-states";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/app-host/(protected)/requests/move-actions", () => ({ approveChangeAction: vi.fn(), declineQuoteAction: vi.fn(), reopenRequestAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/requests/pay-actions", () => ({ acceptQuoteAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/billing/actions", () => ({ payChargeAction: vi.fn() }));

import { NextStepBox } from "@/components/requests/next-step-box";
import { Stepper } from "@/components/requests/stepper";
import { TEAM_NAME, Thread } from "@/components/requests/thread";
import { DARK_BUTTON } from "@/components/v2/classes";
import { nextStep, stepperRows } from "@/lib/requests/status";

const QUOTE = { what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR" as const, workingDays: 5, quotedAt: new Date("2026-11-28T04:50:00.000Z") };
const REQUEST = "0192f3c4-0000-7000-8000-000000000001";
const TICKET = "0192f3c4-0000-7000-8000-000000000002";
const TODAY = "2026-11-26";
const NOW = new Date("2026-11-26T05:00:00.000Z");

function change(overrides: Partial<ChangeView> = {}): ChangeView {
  return {
    id: REQUEST,
    ticketId: TICKET,
    businessId: "business-1",
    kind: "website",
    page: null,
    state: "requested",
    coverage: "undecided",
    quote: null,
    acceptedAt: null,
    chargeId: null,
    chargeStatus: null,
    closedReason: null,
    createdAt: new Date("2026-11-27T12:30:00.000Z"),
    updatedAt: new Date("2026-11-27T12:30:00.000Z"),
    ...overrides,
  };
}

const at = (state: ChangeState, iso: string): ChangeEventView => ({ state, at: new Date(iso) });

function box(view: ChangeView, events: readonly ChangeEventView[] = []): string {
  return renderToStaticMarkup(createElement(NextStepBox, { step: nextStep(view, events, TODAY, NOW), requestId: REQUEST, ticketId: TICKET })).replaceAll("<!-- -->", "");
}

const dark = (html: string): number => html.split(DARK_BUTTON).length - 1;

it("draws the five steps with their dates, marks where the request is, and says in words which are reached", () => {
  const rows = stepperRows(change({ state: "quoted", coverage: "paid", quote: QUOTE }), [at("requested", "2026-11-27T12:30:00.000Z"), at("quoted", "2026-11-28T04:50:00.000Z")]);
  const html = renderToStaticMarkup(createElement(Stepper, { rows: rows ?? [] })).replaceAll("<!-- -->", "");
  for (const word of ["Sent", "Quoted", "In progress", "Ready to check", "Done"]) expect(html).toContain(word);
  expect(html).toContain("27 Nov");
  expect(html).toContain("28 Nov");
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toContain("Sent<span class=\"sr-only\">, reached</span>");
});

it("puts the one dark button on a quote, with the price, and a soft Not now beside it", () => {
  const html = box(change({ state: "quoted", coverage: "paid", quote: QUOTE }));
  expect(dark(html)).toBe(1);
  expect(html).toContain("Accept and pay ₹1,500");
  expect(html).toContain("Not now");
  expect(html).toContain("New page, 3 hours at ₹500 an hour, GST included");
  expect(html).toContain("Accept today and it is ready to check by Thu 3 Dec.");
  expect(html).toContain(`name="requestId" value="${REQUEST}"`);
  expect(html).toContain(`name="ticketId" value="${TICKET}"`);
});

it("asks for the payment of an accepted quote through the charge, with no way to turn back", () => {
  const html = box(change({ state: "quoted", coverage: "paid", quote: QUOTE, acceptedAt: NOW, chargeId: "charge-1", chargeStatus: "open" }));
  expect(dark(html)).toBe(1);
  expect(html).toContain("Pay ₹1,500");
  expect(html).toContain('name="chargeId" value="charge-1"');
  expect(html).not.toContain("Not now");
});

it("asks the customer to look at a change that is ready, with one dark button", () => {
  const html = box(change({ state: "preview", coverage: "free" }));
  expect(dark(html)).toBe(1);
  expect(html).toContain("Looks good");
});

it("has no dark button while the team is working, and a soft Reopen on a change that is done", () => {
  expect(dark(box(change({ state: "in_progress", coverage: "free" })))).toBe(0);
  const done = box(change({ state: "shipped", coverage: "free" }), [at("shipped", "2026-11-25T05:00:00.000Z")]);
  expect(dark(done)).toBe(0);
  expect(done).toContain("Reopen this change");
});

it("shows the conversation with the customer as You and the team under its own name", () => {
  const messages = [
    { id: "m1", ticketId: TICKET, authorRole: "customer", visibility: "public", body: "Can we add a page for dental implants?", createdAt: new Date("2026-11-27T12:32:00.000Z"), details: { pageUrl: "Home" } },
    { id: "m2", ticketId: TICKET, authorRole: "staff", visibility: "public", body: "Happy to. Here is a quote.", createdAt: new Date("2026-11-28T04:50:00.000Z"), details: null },
  ] as unknown as SupportMessage[];
  const attachments = [{ id: "a1", messageId: "m1", filename: "page.png" }] as unknown as SupportAttachment[];
  const html = renderToStaticMarkup(createElement(Thread, { messages, attachments })).replaceAll("<!-- -->", "");
  expect(html).toContain("You, ");
  expect(html).toContain(`${TEAM_NAME}, `);
  expect(html).toContain("27 Nov 18:02");
  expect(html).toContain("Page: </dt>");
  expect(html).toContain('href="/support-attachments/a1"');
  expect(html).toContain("Screenshot 1");
  expect(html.indexOf("Can we add a page")).toBeLessThan(html.indexOf("Happy to"));
});

it("never uses a dash in what it says to the customer", () => {
  const states: ChangeState[] = ["requested", "quoted", "in_progress", "preview", "revisions", "approved", "shipped", "declined", "withdrawn"];
  for (const state of states) {
    const html = box(change({ state, coverage: "paid", quote: QUOTE, closedReason: "Not for us." }), [at(state, "2026-11-25T05:00:00.000Z")]);
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
  }
});
