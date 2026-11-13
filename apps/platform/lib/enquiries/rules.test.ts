import { describe, expect, it } from "vitest";
import {
  buildRows,
  chatLeadId,
  csvCell,
  enquiriesCsv,
  exportFileName,
  filterRows,
  filtersHref,
  internationalDigits,
  isCounted,
  mailHref,
  readFilters,
  saveEnquirySchema,
  statusCounts,
  summarise,
  telHref,
  toRow,
  whatsappHref,
  type EnquiryRecord,
} from "./rules";

const LEAD = "0192f3c4-0000-7000-8000-000000000001";
const NOW = new Date("2026-11-13T06:00:00.000Z");

function record(overrides: Partial<EnquiryRecord> = {}): EnquiryRecord {
  return {
    id: "0192f3c4-0000-7000-8000-0000000000aa",
    kind: "chat",
    source: "Cafe bot",
    name: "Asha Rao",
    phone: "98765 43210",
    email: null,
    message: null,
    status: "new",
    note: null,
    receivedAt: new Date("2026-11-12T06:00:00.000Z"),
    sourceRef: `chatbot_lead:${LEAD}`,
    ...overrides,
  };
}

describe("isCounted and toRow", () => {
  it("counts taps and Google calls, and a form with no details", () => {
    expect(isCounted(record({ kind: "call_tap", name: null, phone: null }))).toBe(true);
    expect(isCounted(record({ kind: "google_call", name: null, phone: null }))).toBe(true);
    expect(isCounted(record({ kind: "form", name: null, phone: null, email: null, message: null }))).toBe(true);
    expect(isCounted(record({ kind: "form", name: "Ravi" }))).toBe(false);
    expect(isCounted(record())).toBe(false);
  });

  it("titles a person by name, then email, then phone, else Unnamed visitor", () => {
    expect(toRow(record()).title).toBe("Asha Rao");
    expect(toRow(record({ name: null, email: "a@example.com" })).title).toBe("a@example.com");
    expect(toRow(record({ name: " ", email: null })).title).toBe("98765 43210");
    expect(toRow(record({ name: null, phone: null })).title).toBe("Unnamed visitor");
  });

  it("gives a counted row no identity and the counted status", () => {
    const row = toRow(record({ kind: "whatsapp_tap", name: null, phone: null, status: "new" }));
    expect(row).toMatchObject({ counted: true, status: "counted", phone: null, title: "WhatsApp button tap", sourceGroup: "website" });
  });

  it("labels an ad lead by its source and puts it under Ads", () => {
    expect(toRow(record({ kind: "ad_lead", source: "Meta lead form", sourceRef: "meta_lead:1" }))).toMatchObject({ source: "Meta lead form", sourceGroup: "ads", chatLeadId: null });
  });
});

describe("chatLeadId", () => {
  it("reads the lead from a chat's source_ref only", () => {
    expect(chatLeadId({ kind: "chat", sourceRef: `chatbot_lead:${LEAD}` })).toBe(LEAD);
    expect(chatLeadId({ kind: "chat", sourceRef: "chatbot_lead:not-a-uuid" })).toBeNull();
    expect(chatLeadId({ kind: "form", sourceRef: `chatbot_lead:${LEAD}` })).toBeNull();
  });
});

describe("buildRows", () => {
  it("shows Google calls as one row per India day with the number of calls, newest first", () => {
    const rows = buildRows([
      record({ id: "b", kind: "google_call", name: null, phone: null, sourceRef: "g:2", receivedAt: new Date("2026-11-12T08:00:00.000Z") }),
      record({ id: "a", kind: "google_call", name: null, phone: null, sourceRef: "g:1", receivedAt: new Date("2026-11-12T05:00:00.000Z") }),
      record({ id: "c", receivedAt: new Date("2026-11-13T01:00:00.000Z") }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["c", "b"]);
    expect(rows[1]).toMatchObject({ count: 2, message: "2 calls from your Google profile. Google does not share who called." });
  });
});

describe("filters", () => {
  const rows = buildRows([
    record({ id: "1", status: "new" }),
    record({ id: "2", status: "won", receivedAt: new Date("2026-11-11T06:00:00.000Z") }),
    record({ id: "3", kind: "ad_lead", status: "new", sourceRef: "m:1", receivedAt: new Date("2026-11-10T06:00:00.000Z") }),
    record({ id: "4", kind: "call_tap", name: null, phone: null, sourceRef: "s:1", receivedAt: new Date("2026-11-09T06:00:00.000Z") }),
  ]);

  it("reads known values and ignores anything else", () => {
    expect(readFilters({ status: "won", source: "ads" })).toEqual({ status: "won", source: "ads" });
    expect(readFilters({ status: "bogus", source: ["ads"] })).toEqual({ status: "all", source: "all" });
  });

  it("filters by status and source, counted rows only under All", () => {
    expect(filterRows(rows, { status: "new", source: "all" }).map((row) => row.id)).toEqual(["1", "3"]);
    expect(filterRows(rows, { status: "all", source: "ads" }).map((row) => row.id)).toEqual(["3"]);
    expect(filterRows(rows, { status: "won", source: "all" }).map((row) => row.id)).toEqual(["2"]);
    expect(statusCounts(rows, "all")).toEqual({ all: 4, new: 2, contacted: 0, won: 1, lost: 0 });
  });

  it("writes only non-default filters into the address", () => {
    expect(filtersHref({ status: "all", source: "all" })).toBe("/website/enquiries");
    expect(filtersHref({ status: "new", source: "ads" })).toBe("/website/enquiries?status=new&source=ads");
  });

  it("sums the figures over the last 30 days and counts everyone waiting whatever their age", () => {
    const old = toRow(record({ id: "9", status: "new", receivedAt: new Date("2026-08-01T00:00:00.000Z"), sourceRef: "o" }));
    expect(summarise([...rows, old], NOW)).toEqual({ waiting: 3, received: 4, won: 1 });
  });
});

describe("links", () => {
  it("builds international digits", () => {
    expect(internationalDigits("98765 43210")).toBe("919876543210");
    expect(internationalDigits("09876543210")).toBe("919876543210");
    expect(internationalDigits("+44 20 7946 0958")).toBe("442079460958");
    expect(internationalDigits("0044 20 7946 0958")).toBe("442079460958");
    expect(internationalDigits("12")).toBeNull();
    expect(internationalDigits(null)).toBeNull();
  });

  it("makes tel, wa.me and mailto links, and refuses a bad email", () => {
    expect(telHref("98765 43210")).toBe("tel:+919876543210");
    expect(whatsappHref("98765 43210")).toBe("https://wa.me/919876543210");
    expect(mailHref("a@example.com")).toBe("mailto:a@example.com");
    expect(mailHref("not an email")).toBeNull();
  });
});

describe("csvCell", () => {
  it("quotes and doubles quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("neutralises formula starts", () => {
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvCell("+1+1")).toBe(`"'+1+1"`);
    expect(csvCell("-2+3")).toBe(`"'-2+3"`);
    expect(csvCell("\t=1")).toBe(`"'\t=1"`);
    expect(csvCell("\r=1")).toBe(`"'\r=1"`);
  });

  it("leaves a phone number alone", () => {
    expect(csvCell("+91 98765 43210")).toBe('"+91 98765 43210"');
    expect(csvCell("(022) 555-0100")).toBe('"(022) 555-0100"');
  });
});

describe("enquiriesCsv", () => {
  it("starts with a byte order mark and the header, in India time, and neutralises a hostile note", () => {
    const csv = enquiriesCsv([record({ message: "=HYPERLINK(\"x\")", note: "-call back" })]);
    const [head, line] = csv.split("\r\n");
    expect(head).toBe('﻿"Received (India time)","Name","Phone","Email","Source","Message","Status","Note"');
    expect(line).toBe(`"2026-11-12 11:30","Asha Rao","98765 43210","","Website chat","'=HYPERLINK(""x"")","New","'-call back"`);
  });

  it("leaves identity and message empty for a counted row", () => {
    const line = enquiriesCsv([record({ kind: "call_tap", name: null, phone: null, sourceRef: "s:1" })]).split("\r\n")[1];
    expect(line).toBe('"2026-11-12 11:30","","","","Website tap","","Counted",""');
  });

  it("names the file by the India day", () => {
    expect(exportFileName(new Date("2026-11-13T20:00:00.000Z"))).toBe("enquiries-2026-11-14.csv");
  });
});

describe("saveEnquirySchema", () => {
  const id = "0192f3c4-0000-7000-8000-0000000000aa";

  it("trims the note and accepts the four statuses", () => {
    expect(saveEnquirySchema.parse({ id, status: "won", note: "  rang back  " })).toEqual({ id, status: "won", note: "rang back" });
  });

  it("refuses counted as a status, a long note and a bad id", () => {
    expect(saveEnquirySchema.safeParse({ id, status: "counted", note: "" }).success).toBe(false);
    expect(saveEnquirySchema.safeParse({ id, status: "new", note: "x".repeat(1001) }).success).toBe(false);
    expect(saveEnquirySchema.safeParse({ id: "nope", status: "new", note: "" }).success).toBe(false);
  });
});
