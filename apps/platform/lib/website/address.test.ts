import { describe, expect, it } from "vitest";
import { addressCardView, previewHost, siteAddress } from "@/lib/website/address";

describe("siteAddress", () => {
  it("prefers the live site's address", () => {
    expect(siteAddress({ liveHostname: "sai.in", domainHostname: "sai.brandbasket.in", domainIsTemporary: true })).toBe("sai.in");
  });

  it("falls back to the free address, and only to that", () => {
    expect(siteAddress({ liveHostname: null, domainHostname: "sai.brandbasket.in", domainIsTemporary: true })).toBe("sai.brandbasket.in");
    expect(siteAddress({ liveHostname: null, domainHostname: "sai.in", domainIsTemporary: false })).toBeNull();
    expect(siteAddress({ liveHostname: null, domainHostname: null, domainIsTemporary: false })).toBeNull();
  });
});

describe("previewHost", () => {
  it("is the host of a web link", () => {
    expect(previewHost("https://preview.sai.in/home?x=1")).toBe("preview.sai.in");
  });

  it("is null for nothing, a bad link or another scheme", () => {
    expect(previewHost(null)).toBeNull();
    expect(previewHost("not a link")).toBeNull();
    expect(previewHost("javascript:alert(1)")).toBeNull();
  });
});

describe("addressCardView", () => {
  const own = (status: "pending" | "awaiting_dns" | "verifying" | "active" | "misconfigured") => ({ hostname: "sai.in", status });

  it("asks for the one step while the records are awaited", () => {
    const view = addressCardView({ domain: own("awaiting_dns"), isFreeAddress: false, live: false, projectStatus: "approved" });
    expect(view).toMatchObject({ hostname: "sai.in", chip: "One step left for you", showHow: true });
    expect(view?.line).toBe("Change one setting where you bought the name, so it points to your new site. About 5 minutes.");
  });

  it("says Connected, with nothing to do, once the site is live on its own domain", () => {
    expect(addressCardView({ domain: own("active"), isFreeAddress: false, live: true, projectStatus: "live" })).toEqual({
      hostname: "sai.in",
      chip: "Connected",
      line: null,
      showHow: false,
    });
  });

  it("is absent when nothing is needed", () => {
    expect(addressCardView({ domain: null, isFreeAddress: false, live: false, projectStatus: null })).toBeNull();
    expect(addressCardView({ domain: { hostname: "sai.brandbasket.in", status: "active" }, isFreeAddress: true, live: true, projectStatus: "live" })).toBeNull();
    expect(addressCardView({ domain: own("pending"), isFreeAddress: false, live: false, projectStatus: "building" })).toBeNull();
    expect(addressCardView({ domain: own("pending"), isFreeAddress: false, live: false, projectStatus: "approved" })).toBeNull();
  });
});
