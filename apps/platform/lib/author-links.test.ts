import { describe, expect, it } from "vitest";
import { parseAuthorLink } from "./author-links";

describe("parseAuthorLink", () => {
  it("treats blank as no link", () => {
    expect(parseAuthorLink("  ")).toEqual({ ok: true, value: null });
  });

  it("adds https:// when it is missing", () => {
    expect(parseAuthorLink("instagram.com/asha")).toEqual({ ok: true, value: "https://instagram.com/asha" });
    expect(parseAuthorLink("www.x.com/asha")).toEqual({ ok: true, value: "https://www.x.com/asha" });
  });

  it("keeps a full http(s) address", () => {
    expect(parseAuthorLink("https://asterphysio.com/")).toEqual({ ok: true, value: "https://asterphysio.com/" });
  });

  it("refuses anything that is not a web address", () => {
    expect(parseAuthorLink("javascript:alert(1)").ok).toBe(false);
    expect(parseAuthorLink("mailto:a@b.com").ok).toBe(false);
    expect(parseAuthorLink("asha").ok).toBe(false);
    expect(parseAuthorLink("my site.com").ok).toBe(false);
  });
});
