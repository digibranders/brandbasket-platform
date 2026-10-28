import { describe, expect, it } from "vitest";
import { countryFrom, hostAllowed, istDay, optedOut, originHost } from "./request";

const headers = (entries: Record<string, string>): Pick<Headers, "get"> => new Headers(entries);

describe("optedOut", () => {
  it("is true for Do Not Track and for Global Privacy Control", () => {
    expect(optedOut(headers({ dnt: "1" }))).toBe(true);
    expect(optedOut(headers({ "sec-gpc": "1" }))).toBe(true);
  });

  it("is false otherwise, including DNT 0", () => {
    expect(optedOut(headers({}))).toBe(false);
    expect(optedOut(headers({ dnt: "0" }))).toBe(false);
  });
});

describe("countryFrom", () => {
  it("reads the edge's country, from Cloudflare first and then Vercel", () => {
    expect(countryFrom(headers({ "cf-ipcountry": "IN" }))).toBe("IN");
    expect(countryFrom(headers({ "x-vercel-ip-country": "us" }))).toBe("US");
    expect(countryFrom(headers({ "cf-ipcountry": "GB", "x-vercel-ip-country": "US" }))).toBe("GB");
  });

  it("gives null for no country, an unknown one or a Tor exit", () => {
    expect(countryFrom(headers({}))).toBeNull();
    expect(countryFrom(headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(countryFrom(headers({ "cf-ipcountry": "T1" }))).toBeNull();
    expect(countryFrom(headers({ "cf-ipcountry": "India" }))).toBeNull();
  });
});

describe("originHost", () => {
  it("reads the host of the page that sent the hit, from Origin and then Referer, without www", () => {
    expect(originHost(headers({ origin: "https://www.SaiDental.in" }))).toBe("saidental.in");
    expect(originHost(headers({ referer: "https://saidental.in/about?x=1" }))).toBe("saidental.in");
    expect(originHost(headers({ origin: "https://a.example", referer: "https://b.example/x" }))).toBe("a.example");
  });

  it("gives null when there is none or it cannot be read", () => {
    expect(originHost(headers({}))).toBeNull();
    expect(originHost(headers({ origin: "null" }))).toBeNull();
  });
});

describe("hostAllowed", () => {
  const allowed = ["www.saidental.in", "smile.example"];

  it("accepts a registered host with or without www, and its subdomains", () => {
    expect(hostAllowed("saidental.in", allowed)).toBe(true);
    expect(hostAllowed("www.saidental.in", allowed)).toBe(true);
    expect(hostAllowed("blog.saidental.in", allowed)).toBe(true);
  });

  it("refuses another host, including one that merely ends the same way", () => {
    expect(hostAllowed("evil.example", allowed)).toBe(false);
    expect(hostAllowed("notsaidental.in", allowed)).toBe(false);
  });

  it("lets a request with no origin through: the check is a filter, not a lock", () => {
    expect(hostAllowed(null, allowed)).toBe(true);
  });

  it("refuses everything when the business has no host yet, except a request with no origin", () => {
    expect(hostAllowed("saidental.in", [])).toBe(false);
    expect(hostAllowed(null, [])).toBe(true);
  });
});

describe("istDay", () => {
  it("is the Indian calendar day, so a visitor keeps one hash through an Indian day", () => {
    expect(istDay(new Date("2026-10-05T18:29:59.000Z"))).toBe("2026-10-05");
    expect(istDay(new Date("2026-10-05T18:30:00.000Z"))).toBe("2026-10-06");
    expect(istDay(new Date("2026-12-31T20:00:00.000Z"))).toBe("2027-01-01");
  });
});
