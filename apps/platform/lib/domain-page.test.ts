import { describe, expect, it } from "vitest";
import type { DomainStatus } from "@brandbasket/db";
import { domainPageState, moveStepIndex, type DomainPageInput } from "./domain-page";

const domain = (status: DomainStatus, hostname = "riverside.com") => ({ hostname, status });
const base: DomainPageInput = { domain: null, moving: null, isFreeAddress: false, live: false, projectStatus: null };

describe("domainPageState", () => {
  it("is none without a domain", () => {
    expect(domainPageState(base)).toBe("none");
  });

  it("sends a free-address customer who is still building to setup, not a form", () => {
    expect(domainPageState({ ...base, domain: domain("pending", "x.sites.test"), isFreeAddress: true, projectStatus: "building" })).toBe("free-building");
  });

  it("offers the form to a customer live on the free address", () => {
    expect(domainPageState({ ...base, domain: domain("active", "x.sites.test"), isFreeAddress: true, live: true, projectStatus: "live" })).toBe("free");
  });

  it("follows a requested move: waiting for us, then connecting", () => {
    const live = { ...base, domain: domain("active", "x.sites.test"), isFreeAddress: true, live: true, projectStatus: "live" as const };
    expect(domainPageState({ ...live, moving: domain("pending") })).toBe("move-requested");
    expect(domainPageState({ ...live, moving: domain("awaiting_dns") })).toBe("move-connect");
    expect(domainPageState({ ...live, moving: domain("verifying") })).toBe("move-connect");
    expect(domainPageState({ ...live, moving: domain("misconfigured") })).toBe("move-connect");
  });

  it("waits for approval before showing anything to connect", () => {
    expect(domainPageState({ ...base, domain: domain("pending"), projectStatus: "building" })).toBe("own-not-approved");
  });

  it("keeps the records hidden until staff have asked", () => {
    expect(domainPageState({ ...base, domain: domain("pending"), projectStatus: "approved" })).toBe("own-getting-ready");
  });

  it.each(["awaiting_dns", "verifying", "misconfigured"] as const)("shows the records when their own domain is %s", (status) => {
    expect(domainPageState({ ...base, domain: domain(status), projectStatus: "approved" })).toBe("own-connect");
  });

  it("is live once the site is live on their own domain", () => {
    expect(domainPageState({ ...base, domain: domain("active") })).toBe("own-live");
    expect(domainPageState({ ...base, domain: domain("verifying"), live: true })).toBe("own-live");
  });
});

describe("moveStepIndex", () => {
  it("counts the move's four steps", () => {
    expect(moveStepIndex("free")).toBe(0);
    expect(moveStepIndex("move-requested")).toBe(1);
    expect(moveStepIndex("move-connect")).toBe(2);
    expect(moveStepIndex("own-live")).toBe(3);
  });
});
