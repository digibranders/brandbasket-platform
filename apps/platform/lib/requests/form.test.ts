import { describe, expect, it } from "vitest";
import { aboutLine, intentOptions, intentRule, kindOptions, parseAskForm, REQUEST_INTENTS, titleFromText } from "./form";

const KEY = "ask-key-12345678";
const ALL = REQUEST_INTENTS;

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
  return data;
}

describe("kindOptions", () => {
  it("offers the services the customer bought, then Billing and Something else", () => {
    expect(kindOptions(["website", "social"]).map((option) => option.label)).toEqual(["Website", "Social & Ads", "Billing", "Something else"]);
    expect(kindOptions([]).map((option) => option.value)).toEqual(["billing", "other"]);
    expect(kindOptions(["search", "website", "social"]).map((option) => option.value)).toEqual(["website", "social", "search", "billing", "other"]);
  });
});

describe("intentOptions", () => {
  it("offers an intent about a service only when the customer bought it, then the rest", () => {
    expect(intentOptions(["website", "social"]).map((option) => option.value)).toEqual(["website_update", "social_request", "question", "send_info", "not_working", "billing"]);
    expect(intentOptions([]).map((option) => option.value)).toEqual(["question", "send_info", "not_working", "billing"]);
    expect(intentOptions(["search", "website", "social"]).map((option) => option.value)).toEqual(REQUEST_INTENTS);
  });

  it("gives every choice a label and a hint", () => {
    for (const option of intentOptions(["website", "social", "search"])) {
      expect(option.label).not.toBe("");
      expect(option.hint).not.toBe("");
    }
  });
});

describe("intentRule", () => {
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
    expect(aboutLine("Year-end check-up", "2026-12-01")).toBe('About the post "Year-end check-up" (Tue 1 Dec): ');
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
    expect(title.endsWith(" ...")).toBe(false);
  });

  it("adds no dots when nothing was cut", () => {
    expect(titleFromText("Please change the main photo on the home page")).toBe("Please change the main photo on the home page");
    expect(titleFromText("Add an Implants page. Same style as the root canal page, prices from 25,000.")).not.toContain("...");
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
    expect(titleFromText("..........")).toBe("..........");
    expect(titleFromText("a!!!!!!!!!!")).toBe("A!!!!!!!!!!");
    expect(titleFromText("")).toBe("Request");
    expect(titleFromText("   ")).toBe("Request");
  });

  it("falls back to the whole text when the first sentence is tiny", () => {
    expect(titleFromText("Hi. Please change the opening hours on my site")).toBe("Hi. Please change the opening hours on my site");
  });
});

describe("parseAskForm", () => {
  it("reads a good form", () => {
    const parsed = parseAskForm(form({ intent: "website_update", page: " Home ", body: " Add an Implants page, like the root canal page. ", submissionKey: KEY }), ALL);
    expect(parsed).toEqual({ success: true, data: { intent: "website_update", page: "Home", body: "Add an Implants page, like the root canal page.", attachmentIds: [], submissionKey: KEY } });
  });

  it("keeps a page only for a website change", () => {
    const parsed = parseAskForm(form({ intent: "billing", page: "Home", body: "Put my GST number on the invoice.", submissionKey: KEY }), ALL);
    expect(parsed.success && parsed.data.page).toBe(null);
  });

  it("refuses an intent the customer may not pick, in a message they can read", () => {
    expect(parseAskForm(form({ intent: "social_request", body: "Change my ad wording please.", submissionKey: KEY }), ["website_update", "billing", "question"])).toEqual({
      success: false,
      field: "intent",
      message: "Choose what this is about.",
    });
    expect(parseAskForm(form({ body: "Change my ad wording please.", submissionKey: KEY }), ALL)).toMatchObject({ success: false, field: "intent" });
  });

  it("asks for more words, and caps them", () => {
    expect(parseAskForm(form({ intent: "question", body: "Short", submissionKey: KEY }), ALL)).toEqual({ success: false, field: "body", message: "Tell us a little more, in at least 10 characters." });
    expect(parseAskForm(form({ intent: "question", body: "x".repeat(5001), submissionKey: KEY }), ALL)).toMatchObject({ success: false, field: "body" });
  });

  it("asks for more words when the text has no letter or digit", () => {
    const tooShort = { success: false, field: "body", message: "Tell us a little more, in at least 10 characters." };
    expect(parseAskForm(form({ intent: "question", body: "??????????", submissionKey: KEY }), ALL)).toEqual(tooShort);
    expect(parseAskForm(form({ intent: "question", body: " . . . . . . . . . . . ", submissionKey: KEY }), ALL)).toEqual(tooShort);
    expect(parseAskForm(form({ intent: "question", body: "1234567890", submissionKey: KEY }), ALL)).toMatchObject({ success: true });
    expect(parseAskForm(form({ intent: "question", body: "नमस्ते कृपया बदलें", submissionKey: KEY }), ALL)).toMatchObject({ success: true });
  });

  it("allows up to three distinct screenshots", () => {
    const ids = ["0192f3c4-0000-7000-8000-000000000001", "0192f3c4-0000-7000-8000-000000000002", "0192f3c4-0000-7000-8000-000000000003"];
    expect(parseAskForm(form({ intent: "question", body: "Please look at these three pictures.", attachmentIds: ids, submissionKey: KEY }), ALL)).toMatchObject({ success: true });
    expect(parseAskForm(form({ intent: "question", body: "Please look at these pictures.", attachmentIds: [...ids, "0192f3c4-0000-7000-8000-000000000004"], submissionKey: KEY }), ALL)).toEqual({
      success: false,
      field: "attachmentIds",
      message: "Attach up to 3 screenshots.",
    });
    expect(parseAskForm(form({ intent: "question", body: "Please look at these pictures.", attachmentIds: [ids[0] ?? "", ids[0] ?? ""], submissionKey: KEY }), ALL)).toMatchObject({ success: false, message: "Choose each screenshot once." });
    expect(parseAskForm(form({ intent: "question", body: "Please look at this picture.", attachmentIds: ["not-an-id"], submissionKey: KEY }), ALL)).toMatchObject({ success: false });
  });

  it("refuses a missing or odd submission key without showing the customer a schema message", () => {
    expect(parseAskForm(form({ intent: "question", body: "Please look at this for me." }), ALL)).toEqual({ success: false, field: "submissionKey", message: "Your request could not be sent. Refresh the page and try again." });
    expect(parseAskForm(form({ intent: "question", body: "Please look at this for me.", submissionKey: "a b" }), ALL)).toMatchObject({ success: false, field: "submissionKey" });
  });
});
