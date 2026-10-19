import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@brandbasket/shared/lib/security-headers";
import { previewOrigins } from "@/lib/preview-origins";

describe("previewOrigins", () => {
  it("pairs a bare domain with its www form, and the other way round", () => {
    expect(previewOrigins("https://brandbasket.in")).toEqual(["https://brandbasket.in", "https://www.brandbasket.in"]);
    expect(previewOrigins("https://www.brandbasket.in")).toEqual(["https://www.brandbasket.in", "https://brandbasket.in"]);
  });

  it("keeps the port and the scheme", () => {
    expect(previewOrigins("https://example.com:8443")).toEqual(["https://example.com:8443", "https://www.example.com:8443"]);
  });

  it("leaves localhost, addresses and deeper subdomains on their own", () => {
    expect(previewOrigins("http://localhost:3690")).toEqual(["http://localhost:3690"]);
    expect(previewOrigins("http://app.localhost:3001")).toEqual(["http://app.localhost:3001"]);
    expect(previewOrigins("http://127.0.0.1:3690")).toEqual(["http://127.0.0.1:3690"]);
    expect(previewOrigins("https://app.brandbasket.in")).toEqual(["https://app.brandbasket.in"]);
  });

  it("ignores a path, as an origin has none", () => {
    expect(previewOrigins("https://brandbasket.in/in/mh")).toEqual(["https://brandbasket.in", "https://www.brandbasket.in"]);
  });
});

describe("the dashboard's frame-src for the preview", () => {
  it("allows the website at both of its addresses, so the preview still loads when one sends visitors on to the other", () => {
    const policy = contentSecurityPolicy({ development: false, https: true, framedOrigins: [...previewOrigins("https://brandbasket.in")], razorpayCheckout: true });
    const frameSrc = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src")) ?? "";
    expect(frameSrc).toContain("https://brandbasket.in");
    expect(frameSrc).toContain("https://www.brandbasket.in");
  });
});
