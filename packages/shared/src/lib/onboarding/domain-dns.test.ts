import { describe, expect, it } from "vitest";
import { dnsRecordsFor, dnsRecordStatus, overallDnsStatus, registrableDomain, VERCEL_APEX_IP, VERCEL_CNAME_TARGET } from "./domain-dns";

describe("registrableDomain", () => {
  it.each([
    ["example.com", "example.com"],
    ["www.example.com", "example.com"],
    ["shop.example.com", "example.com"],
    ["example.co.in", "example.co.in"],
    ["www.example.co.in", "example.co.in"],
    ["blog.example.com.au", "example.com.au"],
  ])("%s is under %s", (hostname, expected) => {
    expect(registrableDomain(hostname)).toBe(expected);
  });
});

describe("dnsRecordsFor", () => {
  it("asks for the bare domain and www when the customer entered a bare domain", () => {
    expect(dnsRecordsFor("example.com")).toEqual([
      { type: "A", host: "@", value: VERCEL_APEX_IP, fullName: "example.com" },
      { type: "CNAME", host: "www", value: VERCEL_CNAME_TARGET, fullName: "www.example.com" },
    ]);
  });

  it("gives the same two records for the www form", () => {
    expect(dnsRecordsFor("www.example.com").map((record) => record.host)).toEqual(["@", "www"]);
  });

  it("handles a three-label bare domain such as example.co.in", () => {
    expect(dnsRecordsFor("example.co.in").map((record) => record.fullName)).toEqual(["example.co.in", "www.example.co.in"]);
  });

  it("asks for a single CNAME for another subdomain", () => {
    expect(dnsRecordsFor("shop.example.com")).toEqual([{ type: "CNAME", host: "shop", value: VERCEL_CNAME_TARGET, fullName: "shop.example.com" }]);
  });

  it("is case-insensitive", () => {
    expect(dnsRecordsFor("Example.COM")[0]?.fullName).toBe("example.com");
  });
});

describe("dnsRecordStatus", () => {
  const apex = dnsRecordsFor("example.com")[0]!;
  const www = dnsRecordsFor("example.com")[1]!;

  it("is pending when nothing is found", () => {
    expect(dnsRecordStatus(apex, { aRecords: [], cnames: [] })).toBe("pending");
  });

  it("is connected when the A record is ours", () => {
    expect(dnsRecordStatus(apex, { aRecords: [VERCEL_APEX_IP], cnames: [] })).toBe("connected");
  });

  it("is elsewhere when the address is someone else's", () => {
    expect(dnsRecordStatus(apex, { aRecords: ["203.0.113.9"], cnames: [] })).toBe("elsewhere");
  });

  it("is connected when www is a CNAME to ours, with or without the trailing dot", () => {
    expect(dnsRecordStatus(www, { aRecords: [], cnames: [`${VERCEL_CNAME_TARGET}.`] })).toBe("connected");
  });

  it("is elsewhere when www is a CNAME to another host", () => {
    expect(dnsRecordStatus(www, { aRecords: [], cnames: ["old-host.example.net"] })).toBe("elsewhere");
  });
});

describe("overallDnsStatus", () => {
  it("is connected only when every record is", () => {
    expect(overallDnsStatus(["connected", "connected"])).toBe("connected");
    expect(overallDnsStatus(["connected", "pending"])).toBe("pending");
  });

  it("reports a record pointing elsewhere over one that is pending", () => {
    expect(overallDnsStatus(["pending", "elsewhere"])).toBe("elsewhere");
  });

  it("is pending for no records at all", () => {
    expect(overallDnsStatus([])).toBe("pending");
  });
});
