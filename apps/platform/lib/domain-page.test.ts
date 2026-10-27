import { describe, expect, it } from "vitest";
import type { DomainStatus } from "@brandbasket/db";
import { domainPageState, domainSteps, type DomainPageInput, type DomainPageState } from "./domain-page";

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

describe("domainSteps", () => {
  const statuses = (state: DomainPageState): string[] | null => domainSteps(state)?.map((step) => step.status) ?? null;

  it("has no steps before there is a domain to move, while the website is still being built, or once it is live on the domain", () => {
    expect(domainSteps("none")).toBeNull();
    expect(domainSteps("free-building")).toBeNull();
    expect(domainSteps("own-live")).toBeNull();
  });

  it("starts a live customer on the free address at the first step", () => {
    expect(statuses("free")).toEqual(["now", "next", "next", "next"]);
    expect(domainSteps("free")?.map((step) => step.label)).toEqual(["Send your domain", "We add it", "You connect it", "You’re live"]);
  });

  it("walks the move: waiting for us, then connecting", () => {
    expect(statuses("move-requested")).toEqual(["done", "now", "next", "next"]);
    expect(statuses("move-connect")).toEqual(["done", "done", "now", "next"]);
  });

  it("starts a customer who chose their own domain in setup at the preview, then follows the same steps", () => {
    expect(domainSteps("own-not-approved")?.[0]?.label).toBe("Approve your preview");
    expect(statuses("own-not-approved")).toEqual(["now", "next", "next", "next"]);
    expect(statuses("own-getting-ready")).toEqual(["done", "now", "next", "next"]);
    expect(statuses("own-connect")).toEqual(["done", "done", "now", "next"]);
  });

  it("says what the customer does at their domain company in the connect step", () => {
    expect(domainSteps("own-connect")?.[2]?.detail).toContain("domain company");
  });
});
