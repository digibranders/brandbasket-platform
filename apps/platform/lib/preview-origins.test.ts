import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@fynix/shared/lib/security-headers";
import { previewOrigins } from "@/lib/preview-origins";

describe("previewOrigins", () => {
  it("pairs a bare domain with its www form, and the other way round", () => {
    expect(previewOrigins("https://fynix.digital")).toEqual(["https://fynix.digital", "https://www.fynix.digital"]);
    expect(previewOrigins("https://www.fynix.digital")).toEqual(["https://www.fynix.digital", "https://fynix.digital"]);
  });

  it("keeps the port and the scheme", () => {
    expect(previewOrigins("https://example.com:8443")).toEqual(["https://example.com:8443", "https://www.example.com:8443"]);
  });

  it("leaves localhost, addresses and deeper subdomains on their own", () => {
    expect(previewOrigins("http://localhost:3690")).toEqual(["http://localhost:3690"]);
    expect(previewOrigins("http://app.localhost:3001")).toEqual(["http://app.localhost:3001"]);
    expect(previewOrigins("http://127.0.0.1:3690")).toEqual(["http://127.0.0.1:3690"]);
    expect(previewOrigins("https://app.fynix.digital")).toEqual(["https://app.fynix.digital"]);
  });

  it("ignores a path, as an origin has none", () => {
    expect(previewOrigins("https://fynix.digital/in/mh")).toEqual(["https://fynix.digital", "https://www.fynix.digital"]);
  });
});

describe("the dashboard's frame-src for the preview", () => {
  it("allows the website at both of its addresses, so the preview still loads when one sends visitors on to the other", () => {
    const policy = contentSecurityPolicy({ development: false, https: true, framedOrigins: [...previewOrigins("https://fynix.digital")], razorpayCheckout: true });
    const frameSrc = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src")) ?? "";
    expect(frameSrc).toContain("https://fynix.digital");
    expect(frameSrc).toContain("https://www.fynix.digital");
  });
});
