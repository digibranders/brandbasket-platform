import { describe, expect, it } from "vitest";
import {
  OWNER_REPLY_MISSING_MESSAGE,
  OWNER_REPLY_TOO_LONG_MESSAGE,
  ownerCorsHeaders,
  parseOwnerReplyText,
  requestedReviewFilter,
  websiteOriginAllowed,
} from "./owner-replies";

describe("parseOwnerReplyText", () => {
  it("keeps what was written, trimmed, with its line breaks", () => {
    expect(parseOwnerReplyText("  Thank you!\r\nSee you soon.  ")).toEqual({ ok: true, text: "Thank you!\nSee you soon." });
  });

  it("takes control characters out", () => {
    expect(parseOwnerReplyText("Thanks\u0000\u0007!")).toEqual({ ok: true, text: "Thanks!" });
  });

  it("refuses nothing but blanks", () => {
    expect(parseOwnerReplyText("")).toEqual({ ok: false, message: OWNER_REPLY_MISSING_MESSAGE });
    expect(parseOwnerReplyText(" \n\t ")).toEqual({ ok: false, message: OWNER_REPLY_MISSING_MESSAGE });
  });

  it("allows exactly 500 characters and refuses 501, counting an emoji as one", () => {
    expect(parseOwnerReplyText("a".repeat(500)).ok).toBe(true);
    expect(parseOwnerReplyText("a".repeat(501))).toEqual({ ok: false, message: OWNER_REPLY_TOO_LONG_MESSAGE });
    expect(parseOwnerReplyText("🙏".repeat(500)).ok).toBe(true);
    expect(parseOwnerReplyText("🙏".repeat(501)).ok).toBe(false);
  });
});

describe("requestedReviewFilter", () => {
  it("is unanswered only when asked for, and every review for anything else", () => {
    expect(requestedReviewFilter("unanswered")).toBe("unanswered");
    expect(requestedReviewFilter(["unanswered", "all"])).toBe("unanswered");
    expect(requestedReviewFilter("all")).toBe("all");
    expect(requestedReviewFilter("<script>")).toBe("all");
    expect(requestedReviewFilter(undefined)).toBe("all");
  });
});

describe("ownerCorsHeaders", () => {
  const WEBSITE = "https://firstfold.io";

  it("lets the website's own origin in, with its credentials, and says the answer depends on the origin", () => {
    expect(ownerCorsHeaders(WEBSITE, WEBSITE)).toMatchObject({
      Vary: "Origin",
      "Access-Control-Allow-Origin": WEBSITE,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
    });
  });

  it("lets the www twin of the website in, answering it with its own origin", () => {
    expect(ownerCorsHeaders("https://www.firstfold.io", WEBSITE)).toMatchObject({
      "Access-Control-Allow-Origin": "https://www.firstfold.io",
      "Access-Control-Allow-Credentials": "true",
    });
    expect(websiteOriginAllowed(WEBSITE, "https://www.firstfold.io")).toBe(true);
  });

  it("does not take a look-alike for the website", () => {
    for (const origin of ["https://www.firstfold.io.evil.example", "https://wwwfirstfold.io", "http://www.firstfold.io", "https://www.firstfold.io:8443", "https://www.firstfold.io/path", "null"]) {
      expect(websiteOriginAllowed(origin, WEBSITE)).toBe(false);
    }
  });

  it("gives any other origin, or none, nothing to read the answer with", () => {
    for (const origin of ["https://evil.example", "http://firstfold.io", "https://firstfold.io.evil.example", "https://app.firstfold.io", null]) {
      expect(ownerCorsHeaders(origin, WEBSITE)).toEqual({ Vary: "Origin" });
    }
  });
});
