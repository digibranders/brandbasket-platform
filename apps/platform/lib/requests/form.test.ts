import { describe, expect, it } from "vitest";
import { aboutLine, kindOptions, parseAskForm, pickKind, titleFromText } from "./form";

const KEY = "ask-key-12345678";
const ALL = ["website", "social", "search", "billing", "other"] as const;

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

describe("pickKind", () => {
  const options = kindOptions(["website", "social"]);

  it("takes the requested kind when it is offered", () => {
    expect(pickKind("social", options)).toBe("social");
  });

  it("falls back to the first choice for a kind that is not offered, is unknown or is missing", () => {
    expect(pickKind("search", options)).toBe("website");
    expect(pickKind("nonsense", options)).toBe("website");
    expect(pickKind(undefined, options)).toBe("website");
    expect(pickKind("social", [])).toBeUndefined();
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
    const parsed = parseAskForm(form({ kind: "website", page: " Home ", body: " Add an Implants page, like the root canal page. ", submissionKey: KEY }), ALL);
    expect(parsed).toEqual({ success: true, data: { kind: "website", page: "Home", body: "Add an Implants page, like the root canal page.", attachmentIds: [], submissionKey: KEY } });
  });

  it("keeps a page only for a website change", () => {
    const parsed = parseAskForm(form({ kind: "billing", page: "Home", body: "Put my GST number on the invoice.", submissionKey: KEY }), ALL);
    expect(parsed.success && parsed.data.page).toBe(null);
  });

  it("refuses a kind the customer may not pick, in a message they can read", () => {
    expect(parseAskForm(form({ kind: "social", body: "Change my ad wording please.", submissionKey: KEY }), ["website", "billing", "other"])).toEqual({
      success: false,
      field: "kind",
      message: "Choose what this is about.",
    });
    expect(parseAskForm(form({ body: "Change my ad wording please.", submissionKey: KEY }), ALL)).toMatchObject({ success: false, field: "kind" });
  });

  it("asks for more words, and caps them", () => {
    expect(parseAskForm(form({ kind: "other", body: "Short", submissionKey: KEY }), ALL)).toEqual({ success: false, field: "body", message: "Say what you want changed, in at least 10 characters." });
    expect(parseAskForm(form({ kind: "other", body: "x".repeat(5001), submissionKey: KEY }), ALL)).toMatchObject({ success: false, field: "body" });
  });

  it("asks for more words when the text has no letter or digit", () => {
    const tooShort = { success: false, field: "body", message: "Say what you want changed, in at least 10 characters." };
    expect(parseAskForm(form({ kind: "other", body: "??????????", submissionKey: KEY }), ALL)).toEqual(tooShort);
    expect(parseAskForm(form({ kind: "other", body: " . . . . . . . . . . . ", submissionKey: KEY }), ALL)).toEqual(tooShort);
    expect(parseAskForm(form({ kind: "other", body: "1234567890", submissionKey: KEY }), ALL)).toMatchObject({ success: true });
    expect(parseAskForm(form({ kind: "other", body: "नमस्ते कृपया बदलें", submissionKey: KEY }), ALL)).toMatchObject({ success: true });
  });

  it("allows up to three distinct screenshots", () => {
    const ids = ["0192f3c4-0000-7000-8000-000000000001", "0192f3c4-0000-7000-8000-000000000002", "0192f3c4-0000-7000-8000-000000000003"];
    expect(parseAskForm(form({ kind: "other", body: "Please look at these three pictures.", attachmentIds: ids, submissionKey: KEY }), ALL)).toMatchObject({ success: true });
    expect(parseAskForm(form({ kind: "other", body: "Please look at these pictures.", attachmentIds: [...ids, "0192f3c4-0000-7000-8000-000000000004"], submissionKey: KEY }), ALL)).toEqual({
      success: false,
      field: "attachmentIds",
      message: "Attach up to 3 screenshots.",
    });
    expect(parseAskForm(form({ kind: "other", body: "Please look at these pictures.", attachmentIds: [ids[0] ?? "", ids[0] ?? ""], submissionKey: KEY }), ALL)).toMatchObject({ success: false, message: "Choose each screenshot once." });
    expect(parseAskForm(form({ kind: "other", body: "Please look at this picture.", attachmentIds: ["not-an-id"], submissionKey: KEY }), ALL)).toMatchObject({ success: false });
  });

  it("refuses a missing or odd submission key without showing the customer a schema message", () => {
    expect(parseAskForm(form({ kind: "other", body: "Please look at this for me." }), ALL)).toEqual({ success: false, field: "submissionKey", message: "Your request could not be sent. Refresh the page and try again." });
    expect(parseAskForm(form({ kind: "other", body: "Please look at this for me.", submissionKey: "a b" }), ALL)).toMatchObject({ success: false, field: "submissionKey" });
  });
});
