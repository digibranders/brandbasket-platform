import type { RequestNeed } from "@brandbasket/db";
import { expect, it } from "vitest";
import { needsYouFrom, noticeInputsFrom, waitingOnYouFrom } from "./needs";

const need = (overrides: Partial<RequestNeed>): RequestNeed => ({
  ticketId: "t1",
  subject: "Add an Implants page",
  kind: "website",
  state: "quoted",
  quote: null,
  acceptedAt: null,
  updatedAt: new Date("2026-11-28T04:50:00.000Z"),
  ...overrides,
});

it("tells a quote to answer from a payment to make and a change to check", () => {
  expect(
    noticeInputsFrom(
      [need({}), need({ ticketId: "t2", acceptedAt: new Date("2026-11-28T05:00:00.000Z") }), need({ ticketId: "t3", state: "preview" })],
      [],
    ).map((input) => [input.ticketId, input.kind]),
  ).toEqual([
    ["t1", "quote"],
    ["t2", "payment"],
    ["t3", "check"],
  ]);
});

it("adds replies not yet read, once, and not for a conversation that already has something to do", () => {
  const inputs = noticeInputsFrom([need({})], [{ ticketId: "t1", subject: "Add an Implants page" }, { ticketId: "t9", subject: "A question" }]);
  expect(inputs.map((input) => [input.ticketId, input.kind])).toEqual([
    ["t1", "quote"],
    ["t9", "reply"],
  ]);
});

it("is empty when there is nothing", () => {
  expect(noticeInputsFrom([], [])).toEqual([]);
});

const QUOTE = { what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR" as const, workingDays: 5, quotedAt: new Date("2026-11-28T04:50:00.000Z") };

it("lists a quote to accept with its hours and price, and opens the request", () => {
  expect(needsYouFrom([need({ quote: QUOTE })])).toEqual([
    { key: "request-t1", label: "Accept a quote: Add an Implants page", hint: "3 hours, ₹1,500", service: "website", href: "/requests?open=t1" },
  ]);
});

it("lists a payment to make and a change to check, and gives Billing and Something else no service", () => {
  const rows = needsYouFrom([
    need({ ticketId: "t2", quote: QUOTE, acceptedAt: new Date("2026-11-28T05:00:00.000Z"), kind: "social" }),
    need({ ticketId: "t3", state: "preview", kind: "billing", subject: "GST number on my invoice" }),
  ]);
  expect(rows.map((row) => [row.label, row.hint, row.service])).toEqual([
    ["Pay for: Add an Implants page", "3 hours, ₹1,500", "social"],
    ["Check this change: GST number on my invoice", "Ready to check", null],
  ]);
});

it("still lists a quote whose figures are missing", () => {
  expect(needsYouFrom([need({ quote: null })])[0]?.hint).toBe("Waiting for your OK");
});

it("lists a question from the team as something to reply to, once, and not when it is already a quote or a check", () => {
  const rows = waitingOnYouFrom([{ ticketId: "t1", subject: "Add an Implants page" }, { ticketId: "t7", subject: "Which logo should we use?" }], [need({})]);
  expect(rows).toEqual([{ key: "request-t7", label: "Reply to: Which logo should we use?", hint: "Waiting for you", service: null, href: "/requests?open=t7" }]);
  expect(waitingOnYouFrom([], [])).toEqual([]);
});
