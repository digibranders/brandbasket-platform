import { describe, expect, it } from "vitest";
import { parseHoldForm, readWebsiteMoveNotice, WEBSITE_MOVE_NOTICES, websiteMoveHref } from "./website-form";

describe("parseHoldForm", () => {
  it("trims the reason and keeps the rest exactly as typed", () => {
    expect(parseHoldForm("  Waiting for the logo file  ")).toEqual({ success: true, reason: "Waiting for the logo file" });
  });

  it("refuses a reason of 2 characters, counted after trimming", () => {
    expect(parseHoldForm("  ab  ")).toEqual({ success: false, message: "Say why in at least 3 characters." });
  });

  it("accepts a reason of exactly 3 characters", () => {
    expect(parseHoldForm("abc")).toEqual({ success: true, reason: "abc" });
  });

  it("refuses a reason of 201 characters", () => {
    expect(parseHoldForm("a".repeat(201))).toEqual({ success: false, message: "Keep the reason to 200 characters." });
  });

  it("accepts a reason of exactly 200 characters", () => {
    expect(parseHoldForm("a".repeat(200))).toEqual({ success: true, reason: "a".repeat(200) });
  });

  it("refuses a missing value and a file in place of text", () => {
    expect(parseHoldForm(null).success).toBe(false);
    expect(parseHoldForm(new File(["reason"], "reason.txt")).success).toBe(false);
  });
});

describe("website move notices", () => {
  it("has text for every notice", () => {
    for (const notice of Object.values(WEBSITE_MOVE_NOTICES)) expect(notice.text.length).toBeGreaterThan(0);
  });

  it("has plain picture notices, the first ok and the second not", () => {
    expect(WEBSITE_MOVE_NOTICES["picture-taken"]).toEqual({ text: "Picture taken.", ok: true });
    expect(WEBSITE_MOVE_NOTICES["picture-failed"]).toEqual({
      text: "The picture could not be taken. Check the preview link, or try again later.",
      ok: false,
    });
    expect(readWebsiteMoveNotice("picture-failed")).toBe("picture-failed");
  });

  it("points the console back to the client's Website section", () => {
    expect(websiteMoveHref("biz-1", "paused")).toBe("/clients/biz-1?website=paused#website");
  });

  it("reads only the known notices", () => {
    expect(readWebsiteMoveNotice("paused")).toBe("paused");
    expect(readWebsiteMoveNotice("constructor")).toBeNull();
    expect(readWebsiteMoveNotice(undefined)).toBeNull();
    expect(readWebsiteMoveNotice(["paused"])).toBeNull();
  });
});
