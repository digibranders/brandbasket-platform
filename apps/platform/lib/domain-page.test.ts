import { describe, expect, it } from "vitest";
import { domainPageState, type DomainPageInput } from "./domain-page";

const own = (status: DomainPageInput["domain"] extends infer D ? (D extends { status: infer S } ? S : never) : never) => ({ hostname: "riverside.com", status });

describe("domainPageState", () => {
  it("is none without a domain", () => {
    expect(domainPageState({ domain: null, isFreeAddress: false, live: false, projectStatus: "onboarding" })).toBe("none");
  });

  it("is free on a free address, even once live", () => {
    expect(domainPageState({ domain: own("pending"), isFreeAddress: true, live: true, projectStatus: "live" })).toBe("free");
  });

  it("waits for approval before showing anything to connect", () => {
    expect(domainPageState({ domain: own("pending"), isFreeAddress: false, live: false, projectStatus: "building" })).toBe("own-not-approved");
  });

  it("keeps the records hidden until staff have asked", () => {
    expect(domainPageState({ domain: own("pending"), isFreeAddress: false, live: false, projectStatus: "approved" })).toBe("own-getting-ready");
  });

  it.each(["awaiting_dns", "verifying", "misconfigured"] as const)("shows the records when the domain is %s", (status) => {
    expect(domainPageState({ domain: own(status), isFreeAddress: false, live: false, projectStatus: "approved" })).toBe("own-connect");
  });

  it("is live once the site is live or the domain is active", () => {
    expect(domainPageState({ domain: own("active"), isFreeAddress: false, live: false, projectStatus: null })).toBe("own-live");
    expect(domainPageState({ domain: own("verifying"), isFreeAddress: false, live: true, projectStatus: null })).toBe("own-live");
  });
});
