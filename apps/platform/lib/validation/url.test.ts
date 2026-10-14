import { describe, expect, it } from "vitest";
import { blankOr, httpsUrl, isGoogleBusinessUrl, MAX_URL_LENGTH } from "./url";

const schema = httpsUrl({ invalid: "Paste a full https:// link.", tooLong: "That link is too long." });

describe("httpsUrl", () => {
  it("stores the normalised link", () => {
    expect(schema.parse("  https://Example.com  ")).toBe("https://example.com/");
    expect(schema.parse("https://example.com/a b")).toBe("https://example.com/a%20b");
  });

  it("refuses anything but https, and links carrying credentials", () => {
    for (const value of ["http://example.com", "javascript:alert(1)", "example.com", "", "https://user:pw@example.com"]) {
      expect(schema.safeParse(value).success, value).toBe(false);
    }
  });

  it("caps the length as typed and once normalised", () => {
    const base = "https://example.com/";
    expect(schema.safeParse(`${base}${"a".repeat(MAX_URL_LENGTH - base.length)}`).success).toBe(true);
    const typed = schema.safeParse(`${base}${"a".repeat(MAX_URL_LENGTH)}`);
    expect(typed.success ? null : typed.error.issues[0]?.message).toBe("That link is too long.");
    // 250 spaces become 750 characters of %20 once normalised.
    const grown = schema.safeParse(`${base}x${" ".repeat(240)}x`);
    expect(grown.success ? null : grown.error.issues[0]?.message).toBe("That link is too long.");
  });
});

describe("isGoogleBusinessUrl", () => {
  const accepts = (href: string): boolean => isGoogleBusinessUrl(new URL(href));

  it("accepts any link on the profile, Maps and short-link hosts", () => {
    for (const href of [
      "https://maps.google.com/?cid=123",
      "https://maps.google.com/maps/place/Riverside",
      "https://business.google.com/n/123/profile",
      "https://business.google.com/",
      "https://g.page/riverside",
      "https://g.page/r/CabcDEF/review",
      "https://maps.app.goo.gl/AbC123",
      "https://MAPS.Google.com/?cid=1",
      "https://g.page./riverside",
    ]) {
      expect(accepts(href), href).toBe(true);
    }
  });

  it("accepts www.google.com and google.com only under /maps or /business", () => {
    for (const href of [
      "https://www.google.com/maps/place/Riverside+Plumbing/@1,2,17z",
      "https://www.google.com/maps?cid=123",
      "https://www.google.com/maps",
      "https://google.com/maps/place/Riverside",
      "https://www.google.com/business/",
      "https://google.com/business",
      "https://WWW.GOOGLE.COM/maps/place/x",
      "https://www.google.com./maps/place/x",
    ]) {
      expect(accepts(href), href).toBe(true);
    }
  });

  it("refuses other paths on www.google.com and google.com, redirects included", () => {
    for (const href of [
      "https://www.google.com/url?q=https://evil.example",
      "https://www.google.com/",
      "https://www.google.com/search?q=riverside",
      "https://google.com/url?q=https://evil.example",
      "https://www.google.com/mapsevil",
      "https://www.google.com/businessman",
      "https://www.google.com/amp/s/evil.example",
      "https://www.google.com/maps/../url?q=https://evil.example",
      "https://www.google.com/maps/%2e%2e/url?q=https://evil.example",
      "https://www.google.com/url?q=/maps",
    ]) {
      expect(accepts(href), href).toBe(false);
    }
  });

  it("refuses Google app share links, which can point at any Search result", () => {
    for (const href of ["https://share.google/AbC123", "https://share.google/", "https://SHARE.google./AbC"]) {
      expect(accepts(href), href).toBe(false);
    }
  });

  it("refuses every other Google subdomain", () => {
    for (const href of [
      "https://sites.google.com/view/riverside",
      "https://docs.google.com/maps",
      "https://www.maps.google.com/?cid=1",
      "https://m.google.com/maps",
      "https://www.business.google.com/",
      "https://x.g.page/riverside",
      "https://www.share.google/AbC",
      "https://evil-maps.app.goo.gl/AbC",
      "https://app.goo.gl/AbC",
      "https://goo.gl/maps/AbC",
      "https://google.co.uk/maps",
    ]) {
      expect(accepts(href), href).toBe(false);
    }
  });

  it("compares whole hosts, so look-alikes fail", () => {
    for (const href of [
      "https://evilgoogle.com/maps",
      "https://google.com.evil.io/maps",
      "https://google.co/maps",
      "https://notg.page/x",
      "https://g.page.evil.io/x",
      "https://maps.app.goo.gl.evil.io/AbC",
      "https://share.google.evil.io/AbC",
      "https://evilshare.google/AbC",
    ]) {
      expect(accepts(href), href).toBe(false);
    }
  });

  it("refuses a link on a non-default port", () => {
    expect(accepts("https://g.page:8443/riverside")).toBe(false);
    expect(accepts("https://www.google.com:444/maps")).toBe(false);
    expect(accepts("https://g.page:443/riverside")).toBe(true);
  });
});

describe("blankOr", () => {
  const optional = blankOr(schema);

  it("reads a blank field as null", () => {
    expect(optional.parse("")).toBeNull();
    expect(optional.parse("   ")).toBeNull();
  });

  it("passes anything typed through the schema, keeping its message", () => {
    expect(optional.parse(" https://example.com ")).toBe("https://example.com/");
    const refused = optional.safeParse("http://example.com");
    expect(refused.success ? null : refused.error.issues.map((issue) => issue.message)).toEqual([
      "Paste a full https:// link.",
    ]);
  });
});
