import { describe, expect, it } from "vitest";
import {
  isTemporarySubdomain,
  isValidHostname,
  normalizeHostname,
  parseDomainForm,
  readSubdomainName,
  RESERVED_SUBDOMAIN_NAMES,
  suggestSubdomainName,
  reservedHostnamesFrom,
  temporarySubdomainFor,
  clientSiteBaseDomain,
} from "./domain-form";

const RESERVED = ["brandbasket.in", "localhost"];

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("normalizeHostname", () => {
  it("reduces whatever people paste to the bare hostname", () => {
    expect(normalizeHostname("  https://www.YourBusiness.com/contact?x=1 ")).toBe("yourbusiness.com");
    expect(normalizeHostname("yourbusiness.com.")).toBe("yourbusiness.com");
    expect(normalizeHostname("http://shop.example.co.uk:8080")).toBe("shop.example.co.uk");
  });

  it("encodes international names", () => {
    expect(normalizeHostname("bücher.de")).toBe("xn--bcher-kva.de");
  });

  it("gives up on nothing usable", () => {
    expect(normalizeHostname("   ")).toBeNull();
    expect(normalizeHostname("https://")).toBeNull();
  });
});

describe("isValidHostname", () => {
  it("accepts ordinary and international domains", () => {
    expect(isValidHostname("yourbusiness.com")).toBe(true);
    expect(isValidHostname("my-shop.co.in")).toBe(true);
    expect(isValidHostname("xn--bcher-kva.de")).toBe(true);
  });

  it("rejects things that are not domains", () => {
    expect(isValidHostname("yourbusiness")).toBe(false);
    expect(isValidHostname("-shop.com")).toBe(false);
    expect(isValidHostname("shop-.com")).toBe(false);
    expect(isValidHostname("shop.c")).toBe(false);
    expect(isValidHostname("shop.c0m")).toBe(false);
    expect(isValidHostname("192.168.1.10")).toBe(false);
    expect(isValidHostname(`${"a".repeat(64)}.com`)).toBe(false);
  });
});

describe("parseDomainForm", () => {
  it("returns the normalised domain once ownership is confirmed", () => {
    expect(parseDomainForm(form({ domain: "https://www.Bloom.in/", ownerConfirmed: "on" }), RESERVED)).toEqual({
      success: true,
      data: { hostname: "bloom.in", ownerConfirmed: true },
    });
  });

  it("requires the ownership box", () => {
    expect(parseDomainForm(form({ domain: "bloom.in" }), RESERVED)).toMatchObject({
      success: false,
      field: "ownerConfirmed",
    });
  });

  it("refuses a blank or malformed domain", () => {
    expect(parseDomainForm(form({ domain: "", ownerConfirmed: "on" }), RESERVED)).toMatchObject({ field: "domain" });
    expect(parseDomainForm(form({ domain: "bloom", ownerConfirmed: "on" }), RESERVED)).toMatchObject({
      field: "domain",
    });
  });

  it("refuses Brandbasket's own hosts and anything under them", () => {
    for (const domain of ["brandbasket.in", "app.brandbasket.in", "www.brandbasket.in", "localhost", "app.localhost"]) {
      expect(parseDomainForm(form({ domain, ownerConfirmed: "on" }), RESERVED), domain).toMatchObject({
        success: false,
        field: "domain",
      });
    }
  });

  it("does not mistake a lookalike for a reserved host", () => {
    expect(parseDomainForm(form({ domain: "notbrandbasket.in", ownerConfirmed: "on" }), RESERVED)).toMatchObject({
      success: true,
    });
  });
});

const SITES_ENV = { CLIENT_SITE_BASE_DOMAIN: "sites.brandbasket.in" };

describe("clientSiteBaseDomain", () => {
  it("is nothing until CLIENT_SITE_BASE_DOMAIN is set: there is no default", () => {
    expect(clientSiteBaseDomain({})).toBeNull();
    expect(clientSiteBaseDomain({ CLIENT_SITE_BASE_DOMAIN: "  " })).toBeNull();
  });

  it("is the configured domain, lowercased and without dots at the ends, ", () => {
    expect(clientSiteBaseDomain({ CLIENT_SITE_BASE_DOMAIN: " .Sites.Brandbasket.In. " })).toBe("sites.brandbasket.in");
    expect(clientSiteBaseDomain({ CLIENT_SITE_BASE_DOMAIN: "example.in" })).toBe("example.in");
  });

  it("refuses a value that is not a domain, rather than minting addresses on it", () => {
    expect(() => clientSiteBaseDomain({ CLIENT_SITE_BASE_DOMAIN: "https://sites.brandbasket.in/x" })).toThrow(/CLIENT_SITE_BASE_DOMAIN/);
  });
});

describe("temporarySubdomainFor", () => {
  it("builds an address on the configured base domain from the business slug", () => {
    expect(temporarySubdomainFor("harbour-bakery", undefined, SITES_ENV)).toBe("harbour-bakery.sites.brandbasket.in");
  });

  it("appends a disambiguator when the plain slug is already taken", () => {
    expect(temporarySubdomainFor("harbour-bakery", "a1b2c3", SITES_ENV)).toBe("harbour-bakery-a1b2c3.sites.brandbasket.in");
  });

  it("keeps every label within the 63-character DNS limit even with a long slug and a disambiguator", () => {
    const hostname = temporarySubdomainFor("a".repeat(60), "a1b2c3", SITES_ENV);
    const label = hostname.split(".")[0] ?? "";
    expect(label.length).toBeLessThanOrEqual(63);
    expect(isValidHostname(hostname)).toBe(true);
  });

  it("never leaves a trailing hyphen when the slug is truncated", () => {
    const hostname = temporarySubdomainFor(`${"a".repeat(54)}-bcdefgh`, "a1b2c3", SITES_ENV);
    expect(isValidHostname(hostname)).toBe(true);
  });

  it("refuses to make an address when no base domain is configured, and never falls back to Brandbasket's", () => {
    expect(() => temporarySubdomainFor("harbour-bakery", undefined, {})).toThrow(/CLIENT_SITE_BASE_DOMAIN/);
  });
});

describe("isTemporarySubdomain", () => {
  it("recognises an address on the base domain", () => {
    expect(isTemporarySubdomain("harbour-bakery.sites.brandbasket.in", SITES_ENV)).toBe(true);
    expect(isTemporarySubdomain("sites.brandbasket.in", SITES_ENV)).toBe(true);
  });

  it("does not mistake a lookalike domain, or any domain when none is configured", () => {
    expect(isTemporarySubdomain("notbrandbasket.in", SITES_ENV)).toBe(false);
    expect(isTemporarySubdomain("yourbusiness.com", SITES_ENV)).toBe(false);
    expect(isTemporarySubdomain("harbour-bakery.brandbasket.in", {})).toBe(false);
  });
});

describe("reservedHostnamesFrom", () => {
  it("takes the bare hostname of each origin, without www, and always includes localhost", () => {
    expect(
      reservedHostnamesFrom(["https://www.brandbasket.in", "https://app.brandbasket.in/", "http://admin.localhost:3000"]),
    ).toEqual(["localhost", "brandbasket.in", "app.brandbasket.in", "admin.localhost"]);
  });

  it("guards the marketing apex when the site lives on www", () => {
    const reserved = reservedHostnamesFrom(["https://www.brandbasket.in"]);
    expect(parseDomainForm(form({ domain: "brandbasket.in", ownerConfirmed: "on" }), reserved)).toMatchObject({
      success: false,
      field: "domain",
    });
  });

  it("throws on an origin that is not a URL", () => {
    expect(() => reservedHostnamesFrom(["not a url"])).toThrow();
  });
});

describe("readSubdomainName", () => {
  it("accepts a plain name, lower-cased and trimmed", () => {
    expect(readSubdomainName("  Harbour-Bakery ")).toEqual({ ok: true, name: "harbour-bakery" });
    expect(readSubdomainName("shop24")).toEqual({ ok: true, name: "shop24" });
  });

  it("drops the base domain when the whole address was pasted", () => {
    expect(readSubdomainName("harbour.sites.brandbasket.in", "sites.brandbasket.in")).toEqual({ ok: true, name: "harbour" });
  });

  it("refuses an empty name, one that is too short or too long, and anything but letters, numbers and single hyphens", () => {
    expect(readSubdomainName("   ")).toMatchObject({ ok: false });
    expect(readSubdomainName("ab")).toEqual({ ok: false, message: "Use at least 3 letters or numbers." });
    expect(readSubdomainName("a".repeat(41))).toEqual({ ok: false, message: "Keep it to 40 characters or fewer." });
    for (const bad of ["my shop", "my_shop", "-start", "end-", "double--hyphen", "a.b.c", "xn--bcher-kva", "caf\u00e9"]) {
      expect(readSubdomainName(bad)).toMatchObject({ ok: false });
    }
  });

  it("refuses the names kept for us, however they are written", () => {
    for (const reserved of ["app", "console", "API", " www ", "brandbasket", "login", "Support", "autodiscover", "Selector1", "pavel"]) {
      expect(readSubdomainName(reserved)).toMatchObject({ ok: false });
    }
    expect(readSubdomainName("app")).toEqual({ ok: false, message: "That name is kept for us. Choose another." });
  });

  it("keeps every reserved name lower-case, and says what is wrong with no dashes or exclamation marks", () => {
    for (const name of RESERVED_SUBDOMAIN_NAMES) expect(name).toBe(name.toLowerCase());
    for (const bad of ["", "a b", "ab", "app", "a".repeat(41)]) {
      const reading = readSubdomainName(bad);
      if (!reading.ok) expect(reading.message).not.toMatch(/[!\u2014\u2013]/);
    }
  });
});

describe("suggestSubdomainName", () => {
  it("offers the business's slug when a customer could take it", () => {
    expect(suggestSubdomainName("harbour-bakery")).toBe("harbour-bakery");
  });

  it("offers nothing when the slug is too short, reserved or not a name", () => {
    expect(suggestSubdomainName("ab")).toBe("");
    expect(suggestSubdomainName("app")).toBe("");
    expect(suggestSubdomainName("business")).toBe("business");
  });

  it("cuts a long slug to the limit without a trailing hyphen", () => {
    const suggestion = suggestSubdomainName(`${"a".repeat(39)}-bcd`);
    expect(suggestion.length).toBeLessThanOrEqual(40);
    expect(suggestion.endsWith("-")).toBe(false);
  });
});
