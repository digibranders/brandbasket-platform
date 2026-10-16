import { describe, expect, it } from "vitest";
import {
  buildLeadRows,
  chatbotStatusLine,
  conversationsAvailable,
  CONVERSATION_NOTICES,
  leadContactLines,
  leadInitial,
  MESSAGE_AUTHOR_LABELS,
  messageCountLabel,
  OYECHATS_INCLUDED_LABEL,
  pageRangeLabel,
  paginationItems,
  parseChatbotName,
  readPageParam,
  websiteLabel,
  type LeadRowSource,
} from "./chatbots-view";

describe("chatbotStatusLine", () => {
  it("says in plain words where each bot is", () => {
    expect(chatbotStatusLine("setting_up")).toEqual({ label: "Setting up", detail: "The team is building and training it. You do not need to do anything." });
    expect(chatbotStatusLine("live")).toEqual({ label: "Live", detail: "It is answering visitors on your site." });
    expect(chatbotStatusLine("paused")).toEqual({ label: "Paused", detail: "It is switched off for now. Ask the team to turn it back on." });
  });

  it("uses no em or en dashes and no exclamation marks", () => {
    for (const status of ["setting_up", "live", "paused"] as const) {
      expect(JSON.stringify(chatbotStatusLine(status))).not.toMatch(/[–—!]/);
    }
  });
});

describe("what the page says about price", () => {
  it("presents OyeChats as part of the plan at no extra cost, never as something to buy", () => {
    expect(OYECHATS_INCLUDED_LABEL).toBe("Included in your Care plan");
    expect(OYECHATS_INCLUDED_LABEL).not.toMatch(/₹|\$|buy|upgrade|add-on|[\u2013\u2014!]/i);
  });
});

describe("leadContactLines", () => {
  it("lists what the visitor left, name first, and skips what they did not", () => {
    expect(leadContactLines({ name: "Meera Shah", email: "meera@example.com", phone: "+919820011223", company: "Shah Dental" })).toEqual({
      title: "Meera Shah",
      lines: ["meera@example.com", "+919820011223", "Shah Dental"],
    });
    expect(leadContactLines({ name: null, email: "meera@example.com", phone: null, company: null })).toEqual({ title: "meera@example.com", lines: [] });
    expect(leadContactLines({ name: null, email: null, phone: "+919820011223", company: "Shah Dental" })).toEqual({ title: "+919820011223", lines: ["Shah Dental"] });
    expect(leadContactLines({ name: null, email: null, phone: null, company: "Shah Dental" })).toEqual({ title: "Shah Dental", lines: [] });
  });
});

describe("websiteLabel", () => {
  it("shows an address without its scheme and a trailing slash, and nothing for none", () => {
    expect(websiteLabel("https://cafe.example.com/")).toBe("cafe.example.com");
    expect(websiteLabel("http://cafe.example.com/menu")).toBe("cafe.example.com/menu");
    expect(websiteLabel(null)).toBeNull();
  });
});

describe("leadInitial and messageCountLabel", () => {
  it("takes the first letter or digit, upper case, and a question mark when there is none", () => {
    expect(leadInitial("meera shah")).toBe("M");
    expect(leadInitial("  +91 98200")).toBe("9");
    expect(leadInitial("Élodie")).toBe("É");
    expect(leadInitial("---")).toBe("?");
  });

  it("counts messages", () => {
    expect(messageCountLabel(1)).toBe("1 message");
    expect(messageCountLabel(0)).toBe("0 messages");
    expect(messageCountLabel(6)).toBe("6 messages");
  });
});

describe("buildLeadRows", () => {
  const lead = (over: Partial<LeadRowSource>): LeadRowSource => ({
    id: "l1",
    chatbotId: "bot-1",
    sessionId: "s1",
    name: "Meera Shah",
    email: "meera@example.com",
    phone: null,
    company: "Shah Dental",
    capturedAt: new Date("2026-10-10T09:00:00Z"),
    ...over,
  });
  const names = new Map([["bot-1", "Website assistant"]]);

  it("joins a lead to its conversation's message count, and does not repeat the company among the contact lines", () => {
    const activity = new Map([["bot-1", new Map([["s1", { messages: 6, lastActiveAt: new Date("2026-10-16T11:00:00Z") }]])]]);

    expect(buildLeadRows([lead({})], activity, names)).toEqual([
      { id: "l1", title: "Meera Shah", lines: ["meera@example.com"], initial: "M", company: "Shah Dental", botName: "Website assistant", messages: 6 },
    ]);
  });

  it("keeps a lead whose conversation could not be read, with no count", () => {
    const [row] = buildLeadRows([lead({})], new Map([["bot-1", null]]), names);
    expect(row).toMatchObject({ title: "Meera Shah", messages: null });
  });

  it("keeps a lead OyeChats has no session for, and keeps the order the leads were given in", () => {
    const activity = new Map([["bot-1", new Map([["s2", { messages: 2, lastActiveAt: new Date("2026-10-16T10:00:00Z") }]])]]);
    const rows = buildLeadRows(
      [lead({ id: "first", sessionId: "s1", capturedAt: new Date("2026-10-12T09:00:00Z") }), lead({ id: "second", sessionId: "s2", capturedAt: new Date("2026-10-01T09:00:00Z") })],
      activity,
      names,
    );
    expect(rows.map((row) => row.id)).toEqual(["first", "second"]);
    expect(rows[0]?.messages).toBeNull();
    expect(rows[1]?.messages).toBe(2);
  });
});

describe("conversation words", () => {
  it("use no em or en dashes and no exclamation marks", () => {
    expect(JSON.stringify([CONVERSATION_NOTICES, MESSAGE_AUTHOR_LABELS])).not.toMatch(/[–—!]/);
  });
});

describe("parseChatbotName", () => {
  it("trims the name and tidies the spaces inside it", () => {
    expect(parseChatbotName("  Booking   helper ")).toEqual({ ok: true, name: "Booking helper" });
    expect(parseChatbotName("x".repeat(80))).toEqual({ ok: true, name: "x".repeat(80) });
  });

  it("refuses a blank name, one that is too long, and anything that is not text", () => {
    expect(parseChatbotName("   ")).toEqual({ ok: false, message: "Type a name for your assistant." });
    expect(parseChatbotName(undefined)).toEqual({ ok: false, message: "Type a name for your assistant." });
    expect(parseChatbotName(42)).toEqual({ ok: false, message: "Type a name for your assistant." });
    expect(parseChatbotName("x".repeat(81))).toEqual({ ok: false, message: "Keep the name to 80 characters or fewer." });
  });

  it("says it with no em or en dashes and no exclamation marks", () => {
    const words = [parseChatbotName(""), parseChatbotName("x".repeat(81))].map((result) => (result.ok ? "" : result.message));
    expect(JSON.stringify(words)).not.toMatch(/[–—!]/);
  });
});

describe("readPageParam", () => {
  it("reads a whole page number from 1, and falls back to the first page for anything else", () => {
    expect(readPageParam("3")).toBe(3);
    expect(readPageParam("120")).toBe(120);
    for (const value of [undefined, "", "0", "-2", "2.5", "abc", "1e3", " 4", "0007", "9999999", ["2", "3"]]) {
      expect(readPageParam(value)).toBe(1);
    }
  });
});

describe("paginationItems", () => {
  const shape = (page: number, pageCount: number): string =>
    paginationItems(page, pageCount)
      .map((item) => (item.kind === "page" ? String(item.page) : "..."))
      .join(" ");

  it("shows every page of a short list", () => {
    expect(shape(1, 1)).toBe("1");
    expect(shape(2, 3)).toBe("1 2 3");
    expect(shape(3, 5)).toBe("1 2 3 4 5");
  });

  it("keeps the first, the last, and the current page with its neighbours, and shows a gap where pages are left out", () => {
    expect(shape(1, 10)).toBe("1 2 ... 10");
    expect(shape(5, 10)).toBe("1 ... 4 5 6 ... 10");
    expect(shape(10, 10)).toBe("1 ... 9 10");
    expect(shape(4, 10)).toBe("1 2 3 4 5 ... 10");
  });

  it("never stands a gap in for a single page, and names the page a gap follows", () => {
    expect(shape(4, 6)).toBe("1 2 3 4 5 6");
    expect(paginationItems(5, 10).filter((item) => item.kind === "gap")).toEqual([
      { kind: "gap", after: 1 },
      { kind: "gap", after: 6 },
    ]);
  });
});

describe("pageRangeLabel", () => {
  it("says which leads a page shows out of how many", () => {
    expect(pageRangeLabel(1, 10, 23)).toBe("Showing 1 to 10 of 23 leads");
    expect(pageRangeLabel(3, 10, 23)).toBe("Showing 21 to 23 of 23 leads");
    expect(pageRangeLabel(1, 10, 1)).toBe("Showing 1 to 1 of 1 lead");
    expect(pageRangeLabel(1, 10, 0)).toBe("No leads");
  });
});

describe("conversationsAvailable", () => {
  it("is true when at least one lead's conversation could be read, even a conversation with no messages yet", () => {
    expect(conversationsAvailable([{ messages: null }, { messages: 4 }])).toBe(true);
    expect(conversationsAvailable([{ messages: 0 }])).toBe(true);
  });

  it("is false when none could be read, or there are no leads", () => {
    expect(conversationsAvailable([{ messages: null }, { messages: null }])).toBe(false);
    expect(conversationsAvailable([])).toBe(false);
  });
});
