import { describe, expect, it } from "vitest";
import { feedbackSubject, parsePreviewFeedback, supportSubmissionsEnabled, titleFromText } from "./feedback";

const KEY = "feedback-key-12345678";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
  return data;
}

describe("parsePreviewFeedback", () => {
  it("reads a good form", () => {
    expect(parsePreviewFeedback(form({ body: " Make the logo bigger on every page. ", submissionKey: KEY }))).toEqual({
      success: true,
      data: { body: "Make the logo bigger on every page.", attachmentIds: [], submissionKey: KEY },
    });
  });

  it("asks for more words, in a message the customer can read", () => {
    const tooShort = { success: false, field: "body", message: "Tell us what to change, in at least 10 characters." };
    expect(parsePreviewFeedback(form({ body: "Short", submissionKey: KEY }))).toEqual(tooShort);
    expect(parsePreviewFeedback(form({ body: "??????????", submissionKey: KEY }))).toEqual(tooShort);
    expect(parsePreviewFeedback(form({ submissionKey: KEY }))).toMatchObject({ success: false, field: "body" });
  });

  it("allows up to three distinct screenshots", () => {
    const ids = ["0192f3c4-0000-7000-8000-000000000001", "0192f3c4-0000-7000-8000-000000000002", "0192f3c4-0000-7000-8000-000000000003"];
    expect(parsePreviewFeedback(form({ body: "Please look at these three pictures.", attachmentIds: ids, submissionKey: KEY }))).toMatchObject({ success: true });
    expect(parsePreviewFeedback(form({ body: "Please look at these pictures.", attachmentIds: [...ids, "0192f3c4-0000-7000-8000-000000000004"], submissionKey: KEY }))).toMatchObject({
      success: false,
      message: "Attach up to 3 screenshots.",
    });
    expect(parsePreviewFeedback(form({ body: "Please look at this picture.", attachmentIds: [ids[0] ?? "", ids[0] ?? ""], submissionKey: KEY }))).toMatchObject({ success: false, message: "Choose each screenshot once." });
  });

  it("refuses a missing or odd form key without showing a schema message", () => {
    expect(parsePreviewFeedback(form({ body: "Please change the photo on the home page." }))).toEqual({
      success: false,
      field: "submissionKey",
      message: "Your changes could not be sent. Refresh the page and try again.",
    });
    expect(parsePreviewFeedback(form({ body: "Please change the photo on the home page.", submissionKey: "a b" }))).toMatchObject({ success: false, field: "submissionKey" });
  });
});

describe("feedbackSubject", () => {
  it("marks the ticket as preview feedback and names it by the first sentence", () => {
    expect(feedbackSubject("Make the logo bigger. And the phone number too.", 1)).toBe("Preview feedback, round 1: Make the logo bigger");
  });

  it("stays short for a long first sentence", () => {
    expect(feedbackSubject("please change the main photo on the home page to the new one we took last week at the clinic opening", 2).length).toBeLessThanOrEqual(90);
  });
});

describe("titleFromText", () => {
  it("takes the first sentence", () => {
    expect(titleFromText("Add an Implants page. Same style as the root canal page, prices from 25,000.")).toBe("Add an Implants page");
  });

  it("cuts a long first sentence at a word and adds three dots, within 60 characters", () => {
    const title = titleFromText("please change the main photo on the home page to the new one we took last week at the clinic opening");
    expect(title).toBe("Please change the main photo on the home page to the new...");
  });

  it("drops punctuation before the dots and hard-cuts a long unbroken word", () => {
    expect(titleFromText("Change the opening hours on the Sunday page, then the Saturday page, then all the rest")).toBe("Change the opening hours on the Sunday page, then the...");
    expect(titleFromText("a".repeat(100))).toBe(`A${"a".repeat(56)}...`);
  });
});

describe("supportSubmissionsEnabled", () => {
  it("is on unless the mode switches it off or to internal accounts only", () => {
    expect(supportSubmissionsEnabled(undefined, undefined, "u1")).toBe(true);
    expect(supportSubmissionsEnabled("on", undefined, "u1")).toBe(true);
    expect(supportSubmissionsEnabled("off", undefined, "u1")).toBe(false);
    expect(supportSubmissionsEnabled("internal", " u2 , u1", "u1")).toBe(true);
    expect(supportSubmissionsEnabled("internal", "u2", "u1")).toBe(false);
    expect(supportSubmissionsEnabled("internal", "u1", null)).toBe(false);
  });
});
