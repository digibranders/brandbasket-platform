import { describe, expect, it } from "vitest";
import { parseSocialLink } from "./social-link";

describe("parseSocialLink", () => {
  it("clears the link when the box is empty", () => {
    expect(parseSocialLink("instagram", "  ")).toEqual({ ok: true, url: null });
  });

  it("takes a profile with or without a scheme and stores it as https", () => {
    expect(parseSocialLink("instagram", "instagram.com/sunrise")).toEqual({ ok: true, url: "https://instagram.com/sunrise" });
    expect(parseSocialLink("facebook", "http://m.facebook.com/sunrise.bakery")).toEqual({ ok: true, url: "https://m.facebook.com/sunrise.bakery" });
    expect(parseSocialLink("linkedin", "https://www.linkedin.com/company/sunrise/")).toEqual({
      ok: true,
      url: "https://www.linkedin.com/company/sunrise/",
    });
  });

  it("refuses another site, the bare network, a pasted sign-in and a link with spaces", () => {
    for (const typed of ["facebook.com/sunrise", "instagram.com", "https://instagram.com@evil.example/x", "instagram.com/a b", "javascript:alert(1)"]) {
      expect(parseSocialLink("instagram", typed).ok).toBe(false);
    }
  });
});
