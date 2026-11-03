import { describe, expect, it } from "vitest";
import {
  buildRows,
  chatbotNameSchema,
  chatbotStatusLine,
  chatLeadId,
  CONVERSATION_NOTICES,
  csvCell,
  enquiriesCsv,
  enquiryTitle,
  filterRows,
  internationalDigits,
  isCounted,
  leadWarmth,
  mailHref,
  MESSAGE_AUTHOR_LABELS,
  messageCountLabel,
  measuredContacts,
  OYECHATS_INCLUDED_LABEL,
  oldestLine,
  readFilters,
  saveEnquirySchema,
  statusCounts,
  summarise,
  telHref,
  toRow,
  waitingLine,
  websiteLabel,
  whatsappHref,
  type EnquiryRecord,
} from "./rules";

const NOW = new Date("2026-11-03T06:30:00Z");
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);
const daysAgo = (days: number): Date => hoursAgo(days * 24);

let counter = 0;
function record(over: Partial<EnquiryRecord>): EnquiryRecord {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    kind: "chat",
    source: null,
    name: "Priya Nair",
    phone: "98190 55012",
    email: null,
    message: null,
    status: "new",
    note: null,
    receivedAt: hoursAgo(1),
    sourceRef: `chatbot_lead:00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    ...over,
  };
}
const tap = (kind: "call_tap" | "whatsapp_tap" | "form" | "google_call", receivedAt: Date): EnquiryRecord =>
  record({ kind, name: null, phone: null, email: null, message: null, receivedAt, sourceRef: `site_event:${counter}` });

describe("isCounted", () => {
  it("counts taps, Google profile calls and a form without any detail, and never a person", () => {
    expect(isCounted(tap("call_tap", NOW))).toBe(true);
    expect(isCounted(tap("whatsapp_tap", NOW))).toBe(true);
    expect(isCounted(tap("google_call", NOW))).toBe(true);
    expect(isCounted(tap("form", NOW))).toBe(true);
    expect(isCounted(record({ kind: "form", name: "Rohan", message: "Home collection?" }))).toBe(false);
    expect(isCounted(record({ kind: "chat" }))).toBe(false);
    expect(isCounted(record({ kind: "ad_lead" }))).toBe(false);
  });
});

describe("enquiryTitle", () => {
  it("is the first of name, email and phone, else Unnamed visitor", () => {
    expect(enquiryTitle({ name: "Meera", email: "m@x.test", phone: "1" })).toBe("Meera");
    expect(enquiryTitle({ name: null, email: "m@x.test", phone: "1" })).toBe("m@x.test");
    expect(enquiryTitle({ name: null, email: null, phone: "98190 55012" })).toBe("98190 55012");
    expect(enquiryTitle({ name: " ", email: null, phone: null })).toBe("Unnamed visitor");
  });
});

describe("toRow", () => {
  it("shows a tap as Counted with no identity and a sentence about what we can see", () => {
    const row = toRow(tap("call_tap", NOW));
    expect(row).toMatchObject({ counted: true, status: "counted", title: "Call button tap", phone: null, email: null, source: "Website tap", sourceGroup: "website" });
    expect(row.message).toContain("not who called");
  });

  it("keeps a person's details, and maps the source and group", () => {
    const row = toRow(record({ kind: "ad_lead", source: "Instagram ad", message: "Wants a morning slot", email: "k@x.test" }));
    expect(row).toMatchObject({ counted: false, title: "Priya Nair", source: "Instagram ad", sourceGroup: "ads", message: "Wants a morning slot", status: "new" });
  });

  it("marks a chat enquiry whose conversation can be opened", () => {
    expect(toRow(record({ kind: "chat" })).hasConversation).toBe(true);
    expect(toRow(record({ kind: "chat", sourceRef: "other:1" })).hasConversation).toBe(false);
    expect(toRow(record({ kind: "form", name: "A" })).hasConversation).toBe(false);
  });
});

describe("chatLeadId", () => {
  it("reads the lead id from the source reference of a chat enquiry only", () => {
    const id = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    expect(chatLeadId({ kind: "chat", sourceRef: `chatbot_lead:${id}` })).toBe(id);
    expect(chatLeadId({ kind: "chat", sourceRef: "chatbot_lead:not-a-uuid" })).toBeNull();
    expect(chatLeadId({ kind: "form", sourceRef: `chatbot_lead:${id}` })).toBeNull();
    expect(chatLeadId({ kind: "chat", sourceRef: `site_event:${id}` })).toBeNull();
  });
});

describe("buildRows", () => {
  it("shows Google profile calls as one row per India day with the number of calls, never a person per call", () => {
    const rows = buildRows([
      tap("google_call", new Date("2026-11-02T10:00:00Z")),
      tap("google_call", new Date("2026-11-02T04:00:00Z")),
      tap("google_call", new Date("2026-11-01T10:00:00Z")),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ count: 2, title: "Calls from your Google profile", message: "2 calls from your Google profile. Google does not share who called." });
    expect(rows[1]?.message).toBe("1 call from your Google profile. Google does not share who called.");
  });

  it("groups by India day, so a call just after midnight there is the next day", () => {
    const rows = buildRows([tap("google_call", new Date("2026-11-01T19:00:00Z")), tap("google_call", new Date("2026-11-01T18:00:00Z"))]);
    expect(rows.map((row) => row.count)).toEqual([1, 1]);
  });

  it("orders newest first", () => {
    const rows = buildRows([record({ receivedAt: daysAgo(3), name: "Old" }), record({ receivedAt: hoursAgo(2), name: "New" })]);
    expect(rows.map((row) => row.title)).toEqual(["New", "Old"]);
  });
});

describe("filters", () => {
  const rows = buildRows([
    record({ name: "A", status: "new" }),
    record({ name: "B", status: "won", kind: "ad_lead" }),
    record({ name: "C", status: "lost" }),
    tap("call_tap", hoursAgo(5)),
  ]);

  it("reads the address and treats anything unknown as no filter", () => {
    expect(readFilters({ status: "won", source: "ads" })).toEqual({ status: "won", source: "ads" });
    expect(readFilters({ status: "bogus", source: ["ads"] })).toEqual({ status: "all", source: "all" });
    expect(readFilters({})).toEqual({ status: "all", source: "all" });
  });

  it("keeps taps under All and under their source, never under a status", () => {
    expect(filterRows(rows, { status: "all", source: "all" })).toHaveLength(4);
    expect(filterRows(rows, { status: "new", source: "all" }).map((r) => r.title)).toEqual(["A"]);
    expect(filterRows(rows, { status: "all", source: "ads" }).map((r) => r.title)).toEqual(["B"]);
    expect(filterRows(rows, { status: "all", source: "website" })).toHaveLength(3);
  });

  it("counts each status chip over the rows the source filter leaves", () => {
    expect(statusCounts(rows, "all")).toEqual({ all: 4, new: 1, contacted: 0, won: 1, lost: 1 });
    expect(statusCounts(rows, "ads")).toEqual({ all: 1, new: 0, contacted: 0, won: 1, lost: 0 });
  });
});

describe("summarise", () => {
  const rows = buildRows([
    record({ name: "Waiting yesterday", receivedAt: hoursAgo(30) }),
    record({ name: "Waiting old", receivedAt: daysAgo(40) }),
    record({ name: "Won", status: "won", receivedAt: daysAgo(2), kind: "ad_lead" }),
    record({ name: "Previous", status: "contacted", receivedAt: daysAgo(45) }),
    tap("call_tap", daysAgo(1)),
    tap("whatsapp_tap", daysAgo(1)),
    tap("google_call", daysAgo(3)),
    tap("google_call", daysAgo(3)),
  ]);

  it("counts who is waiting of any age, and the oldest of them", () => {
    const summary = summarise(rows, NOW, true);
    expect(summary.waiting).toBe(2);
    expect(summary.oldestWaiting).toEqual(daysAgo(40));
  });

  it("counts the last 30 days with taps and Google calls inside, and the change against the 30 days before", () => {
    const summary = summarise(rows, NOW, true);
    expect(summary.received).toBe(6);
    expect(summary.receivedChange).toBe(6 - 2);
    expect(summary.won).toBe(1);
    expect(summary.googleCalls).toBe(2);
  });

  it("gives no change when the read did not reach back far enough", () => {
    expect(summarise(rows, NOW, false).receivedChange).toBeNull();
  });

  it("names the source that brought most", () => {
    expect(summarise(rows, NOW, true).bestSource).toEqual({ group: "website", count: 3 });
    expect(summarise([], NOW, true).bestSource).toBeNull();
  });

  it("does not count a tap as someone waiting for a reply", () => {
    expect(summarise(buildRows([tap("call_tap", hoursAgo(2))]), NOW, true).waiting).toBe(0);
  });

  it("shows the contact figures only while the website has reported something in 90 days", () => {
    expect(summarise(rows, NOW, true).contacts).toEqual({ call: 1, whatsapp: 1, form: 0 });
    expect(summarise(buildRows([record({})]), NOW, true).contacts).toBeNull();
  });
});

describe("measuredContacts (ported)", () => {
  const NONE = { call: 0, whatsapp: 0, form: 0 };
  it("shows nothing for a website that has reported no contact in 90 days, rather than zeros nobody measured", () => {
    expect(measuredContacts(NONE, NONE)).toBeNull();
  });
  it("shows the last 30 days when the website reported anything in them", () => {
    const recent = { call: 4, whatsapp: 2, form: 1 };
    expect(measuredContacts(recent, recent)).toEqual(recent);
  });
  it("shows a quiet month as a real zero once the website has reported before it", () => {
    expect(measuredContacts(NONE, { call: 3, whatsapp: 0, form: 2 })).toEqual(NONE);
  });
});

describe("waitingLine and oldestLine", () => {
  it("says since when a new enquiry has waited, and nothing for today or a replied one", () => {
    expect(waitingLine({ status: "new", receivedAt: hoursAgo(1) }, NOW)).toBeNull();
    expect(waitingLine({ status: "new", receivedAt: hoursAgo(30) }, NOW)).toBe("Waiting since yesterday");
    expect(waitingLine({ status: "new", receivedAt: daysAgo(5) }, NOW)).toBe("Waiting since Thu 29 Oct");
    expect(waitingLine({ status: "contacted", receivedAt: daysAgo(5) }, NOW)).toBeNull();
    expect(waitingLine({ status: "counted", receivedAt: daysAgo(5) }, NOW)).toBeNull();
  });

  it("names the oldest", () => {
    expect(oldestLine(hoursAgo(30), NOW)).toBe("Oldest from yesterday");
    expect(oldestLine(hoursAgo(1), NOW)).toBe("Oldest from today");
    expect(oldestLine(daysAgo(5), NOW)).toBe("Oldest from Thu 29 Oct");
  });
});

describe("phone links", () => {
  it("makes international digits from what was stored", () => {
    expect(internationalDigits("98201 41273")).toBe("919820141273");
    expect(internationalDigits("098201 41273")).toBe("919820141273");
    expect(internationalDigits("+91 98201-41273")).toBe("919820141273");
    expect(internationalDigits("+1 (415) 555-0132")).toBe("14155550132");
    expect(internationalDigits("0091 9820141273")).toBe("919820141273");
  });

  it("refuses what is not a number", () => {
    expect(internationalDigits(null)).toBeNull();
    expect(internationalDigits("call me")).toBeNull();
    expect(internationalDigits("12345")).toBeNull();
    expect(internationalDigits("+1234567890123456789")).toBeNull();
  });

  it("builds tel, wa.me and mailto links, and none for nothing usable", () => {
    expect(telHref("98201 41273")).toBe("tel:+919820141273");
    expect(whatsappHref("98201 41273")).toBe("https://wa.me/919820141273");
    expect(telHref(null)).toBeNull();
    expect(whatsappHref("x")).toBeNull();
    expect(mailHref("a@b.test")).toBe("mailto:a@b.test");
    expect(mailHref("not an email")).toBeNull();
    expect(mailHref(null)).toBeNull();
  });
});

describe("csv", () => {
  it("quotes cells and doubles quotes", () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
  });

  it("defuses a cell a spreadsheet would run as a formula, but leaves a phone number alone", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"');
    expect(csvCell("+cmd|' /C calc'!A0")).toBe('"\'+cmd|\' /C calc\'!A0"');
    expect(csvCell("+91 98201 41273")).toBe('"+91 98201 41273"');
    expect(csvCell("-5")).toBe('"-5"');
  });

  it("exports people with their details and taps as Counted with no name, phone, email or message", () => {
    const csv = enquiriesCsv([
      record({ name: "Rohan Mehta", phone: "98201 41273", kind: "form", message: "Home collection in Dadar?", status: "contacted", note: "Called back", receivedAt: new Date("2026-11-03T05:12:00Z") }),
      tap("call_tap", new Date("2026-11-02T04:00:00Z")),
    ]);
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe('"Received (India time)","Name","Phone","Email","Source","Message","Status","Note"');
    expect(lines[1]).toBe('"2026-11-03 10:42","Rohan Mehta","98201 41273","","Website form","Home collection in Dadar?","Contacted","Called back"');
    expect(lines[2]).toBe('"2026-11-02 09:30","","","","Website tap","","Counted",""');
  });

  it("leaves the name empty for an unnamed visitor rather than writing the placeholder", () => {
    const csv = enquiriesCsv([record({ name: null, phone: "98201 41273" })]);
    expect(csv).not.toContain("Unnamed visitor");
  });
});

describe("saveEnquirySchema", () => {
  const id = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
  it("takes a status and a trimmed note", () => {
    expect(saveEnquirySchema.parse({ id, status: "won", note: "  paid  " })).toEqual({ id, status: "won", note: "paid" });
  });
  it("refuses a status that is not the customer's to set, a bad id and a note over 1000 characters", () => {
    expect(saveEnquirySchema.safeParse({ id, status: "counted", note: "" }).success).toBe(false);
    expect(saveEnquirySchema.safeParse({ id: "x", status: "new", note: "" }).success).toBe(false);
    expect(saveEnquirySchema.safeParse({ id, status: "new", note: "x".repeat(1001) }).success).toBe(false);
    expect(saveEnquirySchema.safeParse({ id, status: "new", note: "x".repeat(1000) }).success).toBe(true);
  });
});

describe("chatbot words (ported)", () => {
  it("says in plain words where each bot is, with no dashes or exclamation marks", () => {
    expect(chatbotStatusLine("live")).toEqual({ label: "Live", detail: "It is answering visitors on your site." });
    expect(chatbotStatusLine("paused").detail).toBe("It is switched off for now. Ask the team to turn it back on.");
    for (const status of ["setting_up", "live", "paused"] as const) expect(JSON.stringify(chatbotStatusLine(status))).not.toMatch(/[\u2013\u2014!]/);
  });

  it("presents OyeChats as part of the plan, never as something to buy", () => {
    expect(OYECHATS_INCLUDED_LABEL).toBe("Included in your plan");
  });

  it("names the three ratings OyeChats sends, and nothing for an unrated or unknown one", () => {
    expect([leadWarmth("sql"), leadWarmth("SAL"), leadWarmth("mql")]).toEqual(["Hot", "Warm", "Cool"]);
    expect([leadWarmth(null), leadWarmth("vip")]).toEqual([null, null]);
  });

  it("shows a website without its scheme and a trailing slash", () => {
    expect(websiteLabel("https://cafe.example.com/")).toBe("cafe.example.com");
    expect(websiteLabel(null)).toBeNull();
  });

  it("counts messages", () => {
    expect([1, 0, 6].map(messageCountLabel)).toEqual(["1 message", "0 messages", "6 messages"]);
  });

  it("keeps the conversation notices and author labels", () => {
    expect(CONVERSATION_NOTICES["not-found"]).toBe("This conversation is no longer available.");
    expect(CONVERSATION_NOTICES.limited).toBe("You have opened a lot of conversations in a short time. Wait a minute and try again.");
    expect(MESSAGE_AUTHOR_LABELS).toEqual({ visitor: "Visitor", assistant: "OyeChats", team: "Team" });
    expect(JSON.stringify([CONVERSATION_NOTICES, MESSAGE_AUTHOR_LABELS])).not.toMatch(/[\u2013\u2014!]/);
  });

  it("tidies a chatbot name and refuses a blank or long one", () => {
    expect(chatbotNameSchema.parse("  Booking   helper ")).toBe("Booking helper");
    expect(chatbotNameSchema.safeParse("x".repeat(80)).success).toBe(true);
    const blank = chatbotNameSchema.safeParse("   ");
    expect(blank.success ? "" : blank.error.issues[0]?.message).toBe("Type a name for your assistant.");
    const long = chatbotNameSchema.safeParse("x".repeat(81));
    expect(long.success ? "" : long.error.issues[0]?.message).toBe("Keep the name to 80 characters or fewer.");
    expect(chatbotNameSchema.safeParse(42).success).toBe(false);
  });
});
