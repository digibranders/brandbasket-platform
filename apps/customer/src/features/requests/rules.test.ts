import type { ChangeEventView, ChangeView, RequestListItem, RequestNeed } from "@brandbasket/db";
import type { ChangeState } from "@brandbasket/db/change-states";
import { describe, expect, it } from "vitest";
import {
  aboutLine,
  canReopen,
  canWrite,
  checkAttachments,
  cleanPage,
  filterRows,
  includedEditLine,
  includedHeaderLine,
  intentOptions,
  intentRule,
  kindsPresent,
  needsYouFrom,
  newRequestHref,
  nextStep,
  parseAsk,
  parseReadReceipt,
  parseReply,
  parseRequestId,
  paymentNoticeLine,
  readAskDefaults,
  readServiceFilter,
  readStatusFilter,
  readyByDay,
  refusalMessage,
  refusalOf,
  REQUEST_INTENTS,
  requestRows,
  statusCounts,
  stepperRows,
  supportSubmissionsEnabled,
  teamIsWaiting,
  titleFromText,
  waitingOnYouFrom,
} from "./rules";

const KEY = "ask-key-12345678";
const ALL = REQUEST_INTENTS;

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
  return data;
}

const QUOTE = { what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR" as const, workingDays: 5, quotedAt: new Date("2026-11-28T04:50:00.000Z") };

function change(overrides: Partial<ChangeView> = {}): ChangeView {
  return {
    id: "request-1",
    ticketId: "ticket-1",
    businessId: "business-1",
    kind: "website",
    page: "Home",
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

function item(overrides: Partial<RequestListItem>): RequestListItem {
  return {
    ticketId: "ticket-1",
    displayRef: "FY-1",
    subject: "Add an Implants page",
    ticketStatus: "new",
    category: "support",
    createdAt: new Date("2026-11-27T12:30:00.000Z"),
    lastActivityAt: new Date("2026-11-27T12:30:00.000Z"),
    unread: false,
    change: null,
    ...overrides,
  };
}

const at = (state: ChangeState, iso: string): ChangeEventView => ({ state, at: new Date(iso) });
const NOW = new Date("2026-11-26T05:00:00.000Z");
// Thursday 26 November 2026 in India.
const TODAY = "2026-11-26";

describe("intents", () => {
  it("offers an intent about a service only when the customer bought it, then the rest", () => {
    expect(intentOptions(["website", "social"]).map((option) => option.value)).toEqual(["website_update", "social_request", "question", "send_info", "not_working", "billing"]);
    expect(intentOptions([]).map((option) => option.value)).toEqual(["question", "send_info", "not_working", "billing"]);
    expect(intentOptions(["search", "website", "social"]).map((option) => option.value)).toEqual(REQUEST_INTENTS);
  });

  it("opens a change request only for a change to a service the customer has", () => {
    expect(REQUEST_INTENTS.filter((intent) => intentRule(intent).change !== null)).toEqual(["website_update", "social_request", "search_request"]);
    expect(intentRule("website_update").change).toBe("website");
    expect(intentRule("search_request").change).toBe("search");
  });

  it("keeps a question, a note, a fault and a billing query as plain conversations in their own category", () => {
    expect(intentRule("question")).toMatchObject({ change: null, category: "support" });
    expect(intentRule("send_info")).toMatchObject({ change: null, category: "general" });
    expect(intentRule("not_working")).toMatchObject({ change: null, category: "bug" });
    expect(intentRule("billing")).toMatchObject({ change: null, category: "billing" });
  });
});

describe("aboutLine", () => {
  it("names the post and its day, and leaves the customer room to write", () => {
    expect(aboutLine("Year-end check-up", "2026-12-01", NOW)).toBe('About the post "Year-end check-up" (Tue 1 Dec): ');
  });
});

describe("titleFromText", () => {
  it("takes the first sentence", () => {
    expect(titleFromText("Add an Implants page. Same style as the root canal page, prices from 25,000.")).toBe("Add an Implants page");
  });

  it("cuts a long first sentence at a word and adds three dots, within 60 characters", () => {
    const title = titleFromText("please change the main photo on the home page to the new one we took last week at the clinic opening");
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toBe("Please change the main photo on the home page to the new...");
  });

  it("adds no dots when nothing was cut", () => {
    expect(titleFromText("Please change the main photo on the home page")).toBe("Please change the main photo on the home page");
  });

  it("drops punctuation before the dots and hard-cuts a long unbroken word", () => {
    expect(titleFromText("Change the opening hours on the Sunday page, then the Saturday page, then all the rest")).toBe("Change the opening hours on the Sunday page, then the...");
    const title = titleFromText("a".repeat(100));
    expect(title).toBe(`A${"a".repeat(56)}...`);
    expect(title.length).toBe(60);
  });

  it("starts with a capital, collapses spaces and lines, and drops trailing punctuation", () => {
    expect(titleFromText("  new   sunday hours,\n  open from 10 to 2 ")).toBe("New sunday hours, open from 10 to 2");
    expect(titleFromText("Can you change my GST number?")).toBe("Can you change my GST number");
  });

  it("never returns an empty or too-short title, even for text that is only punctuation", () => {
    expect(titleFromText("??????????")).toBe("??????????");
    expect(titleFromText("a!!!!!!!!!!")).toBe("A!!!!!!!!!!");
    expect(titleFromText("")).toBe("Request");
    expect(titleFromText("   ")).toBe("Request");
  });

  it("falls back to the whole text when the first sentence is tiny", () => {
    expect(titleFromText("Hi. Please change the opening hours on my site")).toBe("Hi. Please change the opening hours on my site");
  });
});

describe("parseAsk", () => {
  it("reads a good form", () => {
    const parsed = parseAsk(form({ intent: "website_update", page: " Home ", body: " Add an Implants page, like the root canal page. ", submissionKey: KEY }), ALL);
    expect(parsed).toEqual({ ok: true, data: { intent: "website_update", page: "Home", body: "Add an Implants page, like the root canal page.", attachmentIds: [], submissionKey: KEY } });
  });

  it("cleans the page the same way the address does, and drops it when nothing printable is left", () => {
    const body = "Add an Implants page, like the root canal page.";
    const cleaned = parseAsk(form({ intent: "website_update", page: "Home\u0000\n  page", body, submissionKey: KEY }), ALL);
    expect(cleaned.ok && cleaned.data.page).toBe("Home page");
    const empty = parseAsk(form({ intent: "website_update", page: "\u0001\u0002", body, submissionKey: KEY }), ALL);
    expect(empty.ok && empty.data.page).toBe(null);
  });

  it("keeps a page only for a website change", () => {
    const parsed = parseAsk(form({ intent: "billing", page: "Home", body: "Put my GST number on the invoice.", submissionKey: KEY }), ALL);
    expect(parsed.ok && parsed.data.page).toBe(null);
  });

  it("refuses an intent the customer may not pick, in a message they can read", () => {
    expect(parseAsk(form({ intent: "social_request", body: "Change my ad wording please.", submissionKey: KEY }), ["website_update", "billing", "question"])).toEqual({
      ok: false,
      message: "Choose what this is about.",
      fieldErrors: { intent: "Choose what this is about." },
    });
    expect(parseAsk(form({ body: "Change my ad wording please.", submissionKey: KEY }), ALL)).toMatchObject({ ok: false, fieldErrors: { intent: "Choose what this is about." } });
  });

  it("asks for more words, and caps them", () => {
    expect(parseAsk(form({ intent: "question", body: "Short", submissionKey: KEY }), ALL)).toMatchObject({ ok: false, message: "Tell us a little more, in at least 10 characters." });
    expect(parseAsk(form({ intent: "question", body: "x".repeat(5001), submissionKey: KEY }), ALL)).toMatchObject({ ok: false, message: "Keep it to 5,000 characters or fewer." });
  });

  it("asks for more words when the text has no letter or digit", () => {
    expect(parseAsk(form({ intent: "question", body: "??????????", submissionKey: KEY }), ALL)).toMatchObject({ ok: false, fieldErrors: { body: "Tell us a little more, in at least 10 characters." } });
    expect(parseAsk(form({ intent: "question", body: " . . . . . . . . . . . ", submissionKey: KEY }), ALL)).toMatchObject({ ok: false });
    expect(parseAsk(form({ intent: "question", body: "1234567890", submissionKey: KEY }), ALL)).toMatchObject({ ok: true });
    expect(parseAsk(form({ intent: "question", body: "नमस्ते कृपया बदलें", submissionKey: KEY }), ALL)).toMatchObject({ ok: true });
  });

  it("allows up to three distinct screenshots", () => {
    const ids = ["0192f3c4-0000-7000-8000-000000000001", "0192f3c4-0000-7000-8000-000000000002", "0192f3c4-0000-7000-8000-000000000003"];
    expect(parseAsk(form({ intent: "question", body: "Please look at these three pictures.", attachmentIds: ids, submissionKey: KEY }), ALL)).toMatchObject({ ok: true });
    // One screenshot arrives as a single value, not a list.
    expect(parseAsk(form({ intent: "question", body: "Please look at this picture.", attachmentIds: ids[0] ?? "", submissionKey: KEY }), ALL)).toMatchObject({ ok: true, data: { attachmentIds: [ids[0]] } });
    expect(parseAsk(form({ intent: "question", body: "Please look at these pictures.", attachmentIds: [...ids, "0192f3c4-0000-7000-8000-000000000004"], submissionKey: KEY }), ALL)).toMatchObject({
      ok: false,
      message: "Attach up to 3 screenshots.",
    });
    expect(parseAsk(form({ intent: "question", body: "Please look at these pictures.", attachmentIds: [ids[0] ?? "", ids[0] ?? ""], submissionKey: KEY }), ALL)).toMatchObject({ ok: false, message: "Choose each screenshot once." });
    expect(parseAsk(form({ intent: "question", body: "Please look at this picture.", attachmentIds: ["not-an-id"], submissionKey: KEY }), ALL)).toMatchObject({ ok: false });
  });

  it("refuses a missing or odd submission key without showing the customer a schema message", () => {
    expect(parseAsk(form({ intent: "question", body: "Please look at this for me." }), ALL)).toMatchObject({ ok: false, message: "Your request could not be sent. Refresh the page and try again." });
    expect(parseAsk(form({ intent: "question", body: "Please look at this for me.", submissionKey: "a b" }), ALL)).toMatchObject({ ok: false, fieldErrors: { submissionKey: expect.any(String) } });
  });
});

describe("parseReply", () => {
  const TICKET = "0192f3c4-0000-7000-8000-0000000000aa";

  it("reads a reply with its ticket and key", () => {
    expect(parseReply(form({ ticketId: TICKET, body: " Thank you ", submissionKey: KEY }))).toEqual({ ok: true, data: { ticketId: TICKET, body: "Thank you", attachmentIds: [], submissionKey: KEY } });
  });

  it("refuses an empty or over-long reply, a bad ticket and a bad key", () => {
    expect(parseReply(form({ ticketId: TICKET, body: "   ", submissionKey: KEY }))).toMatchObject({ ok: false, message: "Write a reply." });
    expect(parseReply(form({ ticketId: TICKET, body: "x".repeat(5001), submissionKey: KEY }))).toMatchObject({ ok: false, message: "Keep the reply to 5,000 characters or fewer." });
    expect(parseReply(form({ ticketId: "nope", body: "Hello", submissionKey: KEY }))).toMatchObject({ ok: false, message: "This request could not be found." });
    expect(parseReply(form({ ticketId: TICKET, body: "Hello" }))).toMatchObject({ ok: false, message: "Your request could not be sent. Refresh the page and try again." });
  });
});

describe("parseRequestId and parseReadReceipt", () => {
  it("accepts only ids", () => {
    expect(parseRequestId(form({ requestId: "0192f3c4-0000-7000-8000-0000000000aa" }))).toEqual({ ok: true, requestId: "0192f3c4-0000-7000-8000-0000000000aa" });
    expect(parseRequestId(form({ requestId: "1 or 1" }))).toMatchObject({ ok: false });
    expect(parseRequestId(form({}))).toMatchObject({ ok: false });
    expect(parseReadReceipt("0192f3c4-0000-7000-8000-0000000000aa", "0192f3c4-0000-7000-8000-0000000000ab")).toBe(true);
    expect(parseReadReceipt("x", "0192f3c4-0000-7000-8000-0000000000ab")).toBe(false);
  });
});

describe("readAskDefaults", () => {
  const OFFERED = [{ value: "website_update" }, { value: "question" }, { value: "billing" }] as const;

  it("starts on the intent the link names when this customer may pick it, or the older kind", () => {
    expect(readAskDefaults({ intent: "billing" }, OFFERED).intent).toBe("billing");
    expect(readAskDefaults({ kind: "website" }, OFFERED).intent).toBe("website_update");
    expect(readAskDefaults({ kind: "other" }, OFFERED).intent).toBe("question");
  });

  it("ignores an intent the customer cannot pick, an unknown one, or a repeated one", () => {
    expect(readAskDefaults({ kind: "social" }, OFFERED).intent).toBeNull();
    expect(readAskDefaults({ intent: "social_request" }, OFFERED).intent).toBeNull();
    expect(readAskDefaults({ kind: "nonsense" }, OFFERED).intent).toBeNull();
    expect(readAskDefaults({ kind: ["website", "billing"] }, OFFERED).intent).toBeNull();
  });

  it("cleans the page and cuts it to 200 characters", () => {
    expect(readAskDefaults({ page: "a".repeat(250) }, OFFERED).page).toBe("a".repeat(200));
    expect(readAskDefaults({ page: "  Home\u0000\n\tpage \u0007 two  " }, OFFERED).page).toBe("Home page two");
    expect(readAskDefaults({ page: ["Home", "About"] }, OFFERED).page).toBe("");
    expect(cleanPage("<b>Home</b>")).toBe("<b>Home</b>");
  });

  it("shows the preview line only when the customer came from the preview", () => {
    expect(readAskDefaults({ from: "preview" }, OFFERED).fromPreview).toBe(true);
    expect(readAskDefaults({ from: "elsewhere" }, OFFERED).fromPreview).toBe(false);
  });
});

describe("newRequestHref", () => {
  it("turns the old New request page into the dialog, keeping the parameters it read", () => {
    expect(newRequestHref({})).toBe("/requests?new=1");
    expect(newRequestHref({ kind: "social", about: "0192f3c4" })).toBe("/requests?new=1&kind=social&about=0192f3c4");
    expect(newRequestHref({ intent: "send_info", page: "Home", from: "preview", other: "x" })).toBe("/requests?new=1&intent=send_info&page=Home&from=preview");
  });

  it("drops a repeated parameter", () => {
    expect(newRequestHref({ page: ["a", "b"] })).toBe("/requests?new=1");
  });
});

describe("support rollout", () => {
  it("lets everyone in when unset or on, and only listed accounts when internal", () => {
    expect(supportSubmissionsEnabled(undefined, undefined, "u1")).toBe(true);
    expect(supportSubmissionsEnabled("on", undefined, null)).toBe(true);
    expect(supportSubmissionsEnabled("internal", "u1, u2", "u2")).toBe(true);
    expect(supportSubmissionsEnabled("internal", "u1", "u9")).toBe(false);
    expect(supportSubmissionsEnabled("internal", "u1", null)).toBe(false);
    expect(supportSubmissionsEnabled("off", "u1", "u1")).toBe(false);
  });
});

describe("checkAttachments", () => {
  const png = { size: 1000, type: "image/png" };

  it("lets up to three PNG, JPEG or WebP files of 4 MB or less through", () => {
    expect(checkAttachments(0, [png, { size: 4 * 1024 * 1024, type: "image/jpeg" }, { size: 5, type: "image/webp" }])).toBeNull();
  });

  it("refuses a fourth file, a big file and another type, in one sentence", () => {
    const sentence = "Choose up to 3 PNG, JPEG or WebP screenshots, each at most 4 MB.";
    expect(checkAttachments(2, [png, png])).toBe(sentence);
    expect(checkAttachments(0, [{ size: 4 * 1024 * 1024 + 1, type: "image/png" }])).toBe(sentence);
    expect(checkAttachments(0, [{ size: 10, type: "application/pdf" }])).toBe(sentence);
  });
});

describe("roles", () => {
  it("lets owners and editors write and shows viewers no write action", () => {
    expect(canWrite("owner")).toBe(true);
    expect(canWrite("editor")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
  });
});

describe("stepperRows", () => {
  it("shows the quote as where the request is, with the dates behind it and nothing ahead", () => {
    const rows = stepperRows(change({ state: "quoted", coverage: "paid", quote: QUOTE }), [at("requested", "2026-11-27T12:30:00.000Z"), at("quoted", "2026-11-28T04:50:00.000Z")], NOW);
    expect(rows).toEqual([
      { label: "Sent", mark: "done", note: "Fri 27 Nov" },
      { label: "Quoted", mark: "now", note: "Sat 28 Nov" },
      { label: "In progress", mark: "todo", note: null },
      { label: "Ready to check", mark: "todo", note: null },
      { label: "Done", mark: "todo", note: null },
    ]);
  });

  it("says Included where an included edit has no quote", () => {
    const rows = stepperRows(change({ state: "in_progress", coverage: "included" }), [at("requested", "2026-11-27T12:30:00.000Z"), at("in_progress", "2026-11-28T04:50:00.000Z")], NOW);
    expect(rows?.map((row) => [row.label, row.mark, row.note])).toEqual([
      ["Sent", "done", "Fri 27 Nov"],
      ["Quoted", "done", "Included"],
      ["In progress", "now", "Sat 28 Nov"],
      ["Ready to check", "todo", null],
      ["Done", "todo", null],
    ]);
  });

  it("marks every step done when the change is done, with the first date each was reached", () => {
    const rows = stepperRows(
      change({ state: "shipped", coverage: "paid", quote: QUOTE }),
      [
        at("requested", "2026-11-27T12:30:00.000Z"),
        at("quoted", "2026-11-28T04:50:00.000Z"),
        at("in_progress", "2026-11-30T04:50:00.000Z"),
        at("preview", "2026-12-02T04:50:00.000Z"),
        at("revisions", "2026-12-02T08:50:00.000Z"),
        at("preview", "2026-12-03T04:50:00.000Z"),
        at("approved", "2026-12-03T06:50:00.000Z"),
        at("shipped", "2026-12-04T06:50:00.000Z"),
      ],
      NOW,
    );
    expect(rows?.map((row) => [row.mark, row.note])).toEqual([
      ["done", "Fri 27 Nov"],
      ["done", "Sat 28 Nov"],
      ["done", "Mon 30 Nov"],
      ["done", "Wed 2 Dec"],
      ["done", "Thu 3 Dec"],
    ]);
  });

  it("goes back a step when a fix is asked for", () => {
    const rows = stepperRows(
      change({ state: "revisions", coverage: "free" }),
      [at("requested", "2026-11-27T12:30:00.000Z"), at("in_progress", "2026-11-28T04:50:00.000Z"), at("preview", "2026-11-30T04:50:00.000Z"), at("revisions", "2026-11-30T08:50:00.000Z")],
      NOW,
    );
    expect(rows?.map((row) => [row.label, row.mark])).toEqual([
      ["Sent", "done"],
      ["Quoted", "done"],
      ["In progress", "now"],
      ["Ready to check", "todo"],
      ["Done", "todo"],
    ]);
  });

  it("has no steps for a request that ended without the change", () => {
    expect(stepperRows(change({ state: "declined" }), [])).toBeNull();
    expect(stepperRows(change({ state: "withdrawn", coverage: "paid", quote: QUOTE }), [])).toBeNull();
  });
});

describe("readyByDay", () => {
  it("promises a quote's working days from today", () => {
    expect(readyByDay(change({ state: "quoted", coverage: "paid", quote: QUOTE }), TODAY)).toBe("2026-12-03");
  });

  it("promises paid work from the day the customer said yes, counted in India", () => {
    // 23:00 UTC on Mon 30 Nov is 04:30 on Tue 1 Dec in India; three working days on is Fri 4 Dec.
    expect(readyByDay(change({ state: "in_progress", coverage: "paid", quote: { ...QUOTE, workingDays: 3 }, acceptedAt: new Date("2026-11-30T23:00:00.000Z") }), TODAY)).toBe("2026-12-04");
  });

  it("promises an included edit two working days from the day it was sent, skipping the weekend", () => {
    expect(readyByDay(change({ state: "in_progress", coverage: "included", createdAt: new Date("2026-11-27T12:30:00.000Z") }), TODAY)).toBe("2026-12-01");
  });

  it("promises nothing at any other point", () => {
    for (const state of ["requested", "revisions", "preview", "approved", "shipped", "declined", "withdrawn"] as const) {
      expect(readyByDay(change({ state }), TODAY)).toBeNull();
    }
  });
});

describe("canReopen", () => {
  const shippedAt = (iso: string) => [at("shipped", iso)];

  it("lets a finished change be reopened for 14 days, and not after", () => {
    const now = new Date("2026-12-18T05:00:00.000Z");
    expect(canReopen(change({ state: "shipped" }), shippedAt("2026-12-04T05:00:00.000Z"), now)).toBe(true);
    expect(canReopen(change({ state: "shipped" }), shippedAt("2026-12-04T04:59:59.000Z"), now)).toBe(false);
  });

  it("reopens an approved change and a quote that was turned down, but not one that was never quoted", () => {
    const now = new Date("2026-12-05T05:00:00.000Z");
    expect(canReopen(change({ state: "approved" }), [at("approved", "2026-12-04T05:00:00.000Z")], now)).toBe(true);
    expect(canReopen(change({ state: "withdrawn", coverage: "paid", quote: QUOTE }), [at("withdrawn", "2026-12-04T05:00:00.000Z")], now)).toBe(true);
    expect(canReopen(change({ state: "withdrawn", coverage: "undecided" }), [at("withdrawn", "2026-12-04T05:00:00.000Z")], now)).toBe(false);
  });

  it("does not reopen a change that is still going, or one the team declined", () => {
    const now = new Date("2026-12-05T05:00:00.000Z");
    expect(canReopen(change({ state: "in_progress" }), [at("in_progress", "2026-12-04T05:00:00.000Z")], now)).toBe(false);
    expect(canReopen(change({ state: "declined" }), [at("declined", "2026-12-04T05:00:00.000Z")], now)).toBe(false);
  });

  it("counts from the last time it reached the state it is in", () => {
    const now = new Date("2026-12-20T05:00:00.000Z");
    const events = [at("shipped", "2026-12-01T05:00:00.000Z"), at("revisions", "2026-12-02T05:00:00.000Z"), at("shipped", "2026-12-10T05:00:00.000Z")];
    expect(canReopen(change({ state: "shipped" }), events, now)).toBe(true);
  });
});

describe("nextStep", () => {
  const events: ChangeEventView[] = [];

  it("asks for the customer's OK on a quote, with the price, the date it unlocks, GST and the primary button", () => {
    const step = nextStep(change({ state: "quoted", coverage: "paid", quote: QUOTE }), events, TODAY, NOW, 1800);
    expect(step).toEqual({
      title: "Waiting for you",
      text: "This is more than an included 15 minute edit, so it needs your OK first. Accept today and it is ready to check by Thu 3 Dec.",
      quote: { line: "New page, 3 hours at ₹500 an hour, GST included", total: "₹1,500" },
      action: { kind: "accept", label: "Accept and pay ₹1,500" },
      secondary: { kind: "decline", label: "Not now" },
      note: "₹1,500 includes 18% GST",
    });
  });

  it("says no GST for a dollar quote", () => {
    const usd = { ...QUOTE, currency: "USD" as const, unitCents: 2_000, amountCents: 6_000 };
    const step = nextStep(change({ state: "quoted", coverage: "paid", quote: usd }), events, TODAY, NOW, null);
    expect(step.note).toBeNull();
    expect(step.quote?.line).not.toMatch(/GST/);
  });

  it("asks for the payment once the quote is accepted and the charge is open, and offers no way back", () => {
    const step = nextStep(change({ state: "quoted", coverage: "paid", quote: QUOTE, acceptedAt: NOW, chargeId: "charge-1", chargeStatus: "open" }), events, TODAY, NOW);
    expect(step.title).toBe("Waiting for your payment");
    expect(step.action).toEqual({ kind: "pay", label: "Pay ₹1,500", chargeId: "charge-1" });
    expect(step.secondary).toBeNull();
  });

  it("asks to accept again when the charge it opened was waived", () => {
    const step = nextStep(change({ state: "quoted", coverage: "paid", quote: QUOTE, acceptedAt: NOW, chargeId: "charge-1", chargeStatus: "waived" }), events, TODAY, NOW);
    expect(step.action?.kind).toBe("accept");
  });

  it("promises a date while the work goes on, and asks for the customer's look when it is ready", () => {
    const working = nextStep(change({ state: "in_progress", coverage: "included", createdAt: new Date("2026-11-27T12:30:00.000Z") }), events, TODAY, NOW);
    expect(working.text).toBe("It will be ready to check by Tue 1 Dec.");
    expect(working.action).toBeNull();
    expect(nextStep(change({ state: "preview" }), events, TODAY, NOW).action).toEqual({ kind: "approve", label: "Looks good" });
  });

  it("says plainly what happened to a finished, declined or turned-down request", () => {
    const done = nextStep(change({ state: "shipped" }), [at("shipped", "2026-11-25T05:00:00.000Z")], TODAY, NOW);
    expect(done).toMatchObject({ title: "Done", text: "This change is live.", secondary: { kind: "reopen", label: "Reopen this change" } });
    const declined = nextStep(change({ state: "declined", closedReason: "We do not build online shops." }), events, TODAY, NOW);
    expect(declined).toMatchObject({ title: "We could not take this on", text: "We do not build online shops.", action: null, secondary: null });
    const withdrawn = nextStep(change({ state: "withdrawn", coverage: "paid", quote: QUOTE }), [at("withdrawn", "2026-11-25T05:00:00.000Z")], TODAY, NOW);
    expect(withdrawn).toMatchObject({ title: "You chose not to go ahead", secondary: { kind: "reopen", label: "Reopen the quote" } });
  });

  it("never uses a dash in what it says", () => {
    const states: ChangeState[] = ["requested", "quoted", "in_progress", "preview", "revisions", "approved", "shipped", "declined", "withdrawn"];
    for (const state of states) {
      const step = nextStep(change({ state, coverage: "paid", quote: QUOTE, closedReason: "Not for us." }), [at(state, "2026-11-25T05:00:00.000Z")], TODAY, NOW, 1800);
      expect(JSON.stringify(step)).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe("details lines", () => {
  it("says how a request is covered, who looks after it and how many included edits are used", () => {
    expect(includedEditLine("paid")).toBe("Not an included edit");
    expect(includedEditLine("included")).toBe("One of your included edits");
    expect(includedEditLine("free")).toBe("No charge");
    expect(includedEditLine("undecided")).toBe("We will tell you");
    expect(includedHeaderLine(1, 2)).toBe("This month: 1 of 2 included edits used.");
    expect(includedHeaderLine(0, 0)).toBeNull();
  });

  it("knows when the team waits on the customer, but never for a request that is over", () => {
    expect(teamIsWaiting("waiting_on_you", null)).toBe(true);
    expect(teamIsWaiting("waiting_on_you", change({ state: "in_progress" }))).toBe(true);
    expect(teamIsWaiting("waiting_on_you", change({ state: "shipped" }))).toBe(false);
    expect(teamIsWaiting("waiting_on_you", change({ state: "declined" }))).toBe(false);
    expect(teamIsWaiting("in_progress", null)).toBe(false);
  });
});

describe("refusals and payment notices", () => {
  it("maps the database's codes to what the customer reads", () => {
    expect(refusalOf("wrong_state")).toBe("changed");
    expect(refusalOf("not_found")).toBe("changed");
    expect(refusalOf("window_closed")).toBe("window");
    expect(refusalOf("forbidden")).toBe("failed");
    expect(refusalOf(null)).toBe("failed");
    expect(refusalMessage("window")).toBe("The 14 days to reopen this are over. Write to us below and we will help.");
    expect(refusalMessage("failed")).toBe("That did not work. Please try again.");
  });

  it("says the change has started when the payment is in, or on its way", () => {
    expect(paymentNoticeLine("paid")).toEqual({ ok: true, text: "Payment received. We have started on your change." });
    expect(paymentNoticeLine("processing")?.text).toContain("Your change starts within a minute or two.");
  });

  it("uses words that do not point at Billing for a payment that did not go through, and ignores anything unknown", () => {
    for (const word of ["failed", "duplicate", "review", "not-open", "stale"]) {
      const line = paymentNoticeLine(word);
      expect(line?.ok).toBe(false);
      expect(line?.text).not.toMatch(/Billing|below/);
    }
    expect(paymentNoticeLine("toString")).toBeNull();
    expect(paymentNoticeLine(undefined)).toBeNull();
  });
});

describe("requestRows", () => {
  it("writes the title, the status in the five words and the kind", () => {
    const [row] = requestRows([item({ change: change({ state: "quoted", coverage: "paid", quote: QUOTE }) })]);
    expect(row).toMatchObject({ ticketId: "ticket-1", title: "Add an Implants page", word: "Quoted", status: "quoted", tone: "waiting", kind: "website", service: "website", kindLabel: "Website", open: true, quoteTotal: "₹1,500" });
  });

  it("puts the customer's turn (Quoted, Ready to check, Waiting for you) apart from ours", () => {
    const tone = (state: ChangeView["state"]) => requestRows([item({ change: change({ state, coverage: "free" }) })])[0]?.tone;
    expect(tone("quoted")).toBe("waiting");
    expect(tone("preview")).toBe("waiting");
    expect(tone("requested")).toBe("progress");
    expect(tone("revisions")).toBe("progress");
    expect(tone("shipped")).toBe("done");
    expect(tone("declined")).toBe("closed");
  });

  it("gives a plain conversation the same words, and tells the customer when the team is waiting on them", () => {
    const rows = requestRows([item({ ticketStatus: "new" }), item({ ticketId: "t2", ticketStatus: "waiting_on_you", unread: true }), item({ ticketId: "t3", ticketStatus: "resolved" })]);
    // Waiting for you comes first.
    expect(rows.map((row) => [row.ticketId, row.word, row.kindLabel, row.unread])).toEqual([
      ["t2", "Waiting for you", "Question", true],
      ["ticket-1", "Sent", "Question", false],
      ["t3", "Done", "Question", false],
    ]);
  });

  it("shows Waiting for you on a change the team has asked about, but never on one that has ended", () => {
    const word = (state: ChangeView["state"]) => requestRows([item({ ticketStatus: "waiting_on_you", change: change({ state, coverage: "free" }) })])[0]?.word;
    expect(word("in_progress")).toBe("Waiting for you");
    expect(word("shipped")).toBe("Done");
    expect(word("declined")).toBe("Closed");
  });

  it("names a plain conversation by what it was filed under, and files Billing and Website by their service", () => {
    const row = (category: RequestListItem["category"]) => requestRows([item({ category })])[0];
    expect([row("bug")?.kindLabel, row("general")?.kindLabel, row("billing")?.kindLabel]).toEqual(["Not working", "Information", "Billing"]);
    expect([row("billing")?.kind, row("website_change")?.kind, row("bug")?.kind]).toEqual(["billing", "website", "other"]);
  });

  it("keeps the newest activity first inside each group", () => {
    const rows = requestRows([
      item({ ticketId: "a", ticketStatus: "triaged" }),
      item({ ticketId: "b", change: change({ state: "quoted", coverage: "paid" }) }),
      item({ ticketId: "c", ticketStatus: "triaged" }),
      item({ ticketId: "d", ticketStatus: "waiting_on_you" }),
    ]);
    expect(rows.map((row) => row.ticketId)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("filters", () => {
  const rows = requestRows([
    item({ ticketId: "a", change: change({ state: "quoted", coverage: "paid" }) }),
    item({ ticketId: "b", change: change({ state: "shipped", coverage: "free", kind: "social" }) }),
    item({ ticketId: "c", ticketStatus: "triaged" }),
    item({ ticketId: "d", ticketStatus: "closed" }),
    item({ ticketId: "e", change: change({ state: "withdrawn" }) }),
  ]);

  it("files the customer's turn as Waiting for you, our work as Open, and what is over (closed too) as Done", () => {
    expect(filterRows(rows, "waiting", "all").map((row) => row.ticketId)).toEqual(["a"]);
    expect(filterRows(rows, "open", "all").map((row) => row.ticketId)).toEqual(["c"]);
    expect(filterRows(rows, "done", "all").map((row) => row.ticketId)).toEqual(["b", "d", "e"]);
    expect(filterRows(rows, "all", "all")).toHaveLength(5);
  });

  it("filters by service and counts under it", () => {
    expect(filterRows(rows, "all", "social").map((row) => row.ticketId)).toEqual(["b"]);
    expect(statusCounts(rows, "all")).toEqual({ all: 5, waiting: 1, open: 1, done: 3 });
    expect(statusCounts(rows, "website")).toEqual({ all: 2, waiting: 1, open: 0, done: 1 });
  });

  it("offers a service chip only for a kind the list holds", () => {
    expect(kindsPresent(rows)).toEqual(["website", "social", "other"]);
  });

  it("reads the filters from the address and falls back to all", () => {
    expect(readStatusFilter("waiting")).toBe("waiting");
    expect(readStatusFilter("nope")).toBe("all");
    expect(readStatusFilter(["done"])).toBe("all");
    expect(readServiceFilter("billing")).toBe("billing");
    expect(readServiceFilter(undefined)).toBe("all");
  });
});

describe("needs you", () => {
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

  it("lists a quote to accept with its hours and price, and opens the request", () => {
    expect(needsYouFrom([need({ quote: QUOTE })])).toEqual([
      { key: "request-t1", label: "Accept a quote: Add an Implants page", hint: "3 hours, ₹1,500", service: "website", href: "/requests/t1" },
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
    expect(needsYouFrom([need({ quote: null })])[0]?.hint).toBe("Waiting for your OK");
  });

  it("lists a question from the team as something to reply to, once, and not when it is already a quote or a check", () => {
    const rows = waitingOnYouFrom([{ ticketId: "t1", subject: "Add an Implants page" }, { ticketId: "t7", subject: "Which logo should we use?" }], [need({})]);
    expect(rows).toEqual([{ key: "request-t7", label: "Reply to: Which logo should we use?", hint: "Waiting for you", service: null, href: "/requests/t7" }]);
  });
});
