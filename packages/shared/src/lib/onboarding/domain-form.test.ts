import { describe, expect, it } from "vitest";
import {
  isTemporarySubdomain,
  isValidHostname,
  normalizeHostname,
  parseDomainForm,
  reservedHostnamesFrom,
  temporarySubdomainFor,
  clientSiteBaseDomain,
  FIRSTFOLD_SUBDOMAIN_ROOT,
} from "./domain-form";

const RESERVED = ["firstfold.com", "localhost"];

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

  it("refuses Firstfold's own hosts and anything under them", () => {
    for (const domain of ["firstfold.com", "app.firstfold.com", "www.firstfold.com", "localhost", "app.localhost"]) {
      expect(parseDomainForm(form({ domain, ownerConfirmed: "on" }), RESERVED), domain).toMatchObject({
        success: false,
        field: "domain",
      });
    }
  });

  it("does not mistake a lookalike for a reserved host", () => {
    expect(parseDomainForm(form({ domain: "notfirstfold.com", ownerConfirmed: "on" }), RESERVED)).toMatchObject({
      success: true,
    });
  });
});

const FIRSTFOLD_ENV = {};
const FYNIX_ENV = { PLATFORM_BRAND: "fynix", CLIENT_SITE_BASE_DOMAIN: "sites.fynix.digital" };

describe("clientSiteBaseDomain", () => {
  it("is firstfold.io on a Firstfold server with nothing set, as before", () => {
    expect(clientSiteBaseDomain(FIRSTFOLD_ENV)).toBe(FIRSTFOLD_SUBDOMAIN_ROOT);
  });

  it("is nothing on a Fynix server until CLIENT_SITE_BASE_DOMAIN is set: no Firstfold default", () => {
    expect(clientSiteBaseDomain({ PLATFORM_BRAND: "fynix" })).toBeNull();
    expect(clientSiteBaseDomain({ PLATFORM_BRAND: "fynix", CLIENT_SITE_BASE_DOMAIN: "  " })).toBeNull();
  });

  it("is the configured domain, lowercased and without dots at the ends, on either", () => {
    expect(clientSiteBaseDomain({ PLATFORM_BRAND: "fynix", CLIENT_SITE_BASE_DOMAIN: " .Sites.Fynix.Digital. " })).toBe("sites.fynix.digital");
    expect(clientSiteBaseDomain({ CLIENT_SITE_BASE_DOMAIN: "example.in" })).toBe("example.in");
  });

  it("refuses a value that is not a domain, rather than minting addresses on it", () => {
    expect(() => clientSiteBaseDomain({ CLIENT_SITE_BASE_DOMAIN: "https://sites.fynix.digital/x" })).toThrow(/CLIENT_SITE_BASE_DOMAIN/);
  });
});

describe("temporarySubdomainFor", () => {
  it("builds an address on the configured base domain from the business slug", () => {
    expect(temporarySubdomainFor("harbour-bakery", undefined, FYNIX_ENV)).toBe("harbour-bakery.sites.fynix.digital");
    expect(temporarySubdomainFor("harbour-bakery", undefined, FIRSTFOLD_ENV)).toBe(`harbour-bakery.${FIRSTFOLD_SUBDOMAIN_ROOT}`);
  });

  it("appends a disambiguator when the plain slug is already taken", () => {
    expect(temporarySubdomainFor("harbour-bakery", "a1b2c3", FYNIX_ENV)).toBe("harbour-bakery-a1b2c3.sites.fynix.digital");
  });

  it("keeps every label within the 63-character DNS limit even with a long slug and a disambiguator", () => {
    const hostname = temporarySubdomainFor("a".repeat(60), "a1b2c3", FYNIX_ENV);
    const label = hostname.split(".")[0] ?? "";
    expect(label.length).toBeLessThanOrEqual(63);
    expect(isValidHostname(hostname)).toBe(true);
  });

  it("never leaves a trailing hyphen when the slug is truncated", () => {
    const hostname = temporarySubdomainFor(`${"a".repeat(54)}-bcdefgh`, "a1b2c3", FYNIX_ENV);
    expect(isValidHostname(hostname)).toBe(true);
  });

  it("refuses to make an address when no base domain is configured, and never falls back to Firstfold's", () => {
    expect(() => temporarySubdomainFor("harbour-bakery", undefined, { PLATFORM_BRAND: "fynix" })).toThrow(/CLIENT_SITE_BASE_DOMAIN/);
  });
});

describe("isTemporarySubdomain", () => {
  it("recognises an address on the base domain", () => {
    expect(isTemporarySubdomain("harbour-bakery.sites.fynix.digital", FYNIX_ENV)).toBe(true);
    expect(isTemporarySubdomain("sites.fynix.digital", FYNIX_ENV)).toBe(true);
    expect(isTemporarySubdomain(`harbour-bakery.${FIRSTFOLD_SUBDOMAIN_ROOT}`, FIRSTFOLD_ENV)).toBe(true);
  });

  it("does not mistake a lookalike domain, or any domain when none is configured", () => {
    expect(isTemporarySubdomain("notfirstfold.in", FIRSTFOLD_ENV)).toBe(false);
    expect(isTemporarySubdomain("yourbusiness.com", FYNIX_ENV)).toBe(false);
    expect(isTemporarySubdomain("harbour-bakery.firstfold.io", { PLATFORM_BRAND: "fynix" })).toBe(false);
  });
});

describe("reservedHostnamesFrom", () => {
  it("takes the bare hostname of each origin, without www, and always includes localhost", () => {
    expect(
      reservedHostnamesFrom(["https://www.firstfold.com", "https://app.firstfold.com/", "http://admin.localhost:3000"]),
    ).toEqual(["localhost", "firstfold.com", "app.firstfold.com", "admin.localhost"]);
  });

  it("guards the marketing apex when the site lives on www", () => {
    const reserved = reservedHostnamesFrom(["https://www.firstfold.com"]);
    expect(parseDomainForm(form({ domain: "firstfold.com", ownerConfirmed: "on" }), reserved)).toMatchObject({
      success: false,
      field: "domain",
    });
  });

  it("throws on an origin that is not a URL", () => {
    expect(() => reservedHostnamesFrom(["not a url"])).toThrow();
  });
});
