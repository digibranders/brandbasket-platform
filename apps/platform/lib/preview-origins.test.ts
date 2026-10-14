import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@firstfold/shared/lib/security-headers";
import { previewOrigins } from "@/lib/preview-origins";

describe("previewOrigins", () => {
  it("pairs a bare domain with its www form, and the other way round", () => {
    expect(previewOrigins("https://firstfold.io")).toEqual(["https://firstfold.io", "https://www.firstfold.io"]);
    expect(previewOrigins("https://www.firstfold.io")).toEqual(["https://www.firstfold.io", "https://firstfold.io"]);
  });

  it("keeps the port and the scheme", () => {
    expect(previewOrigins("https://example.com:8443")).toEqual(["https://example.com:8443", "https://www.example.com:8443"]);
  });

  it("leaves localhost, addresses and deeper subdomains on their own", () => {
    expect(previewOrigins("http://localhost:3690")).toEqual(["http://localhost:3690"]);
    expect(previewOrigins("http://app.localhost:3001")).toEqual(["http://app.localhost:3001"]);
    expect(previewOrigins("http://127.0.0.1:3690")).toEqual(["http://127.0.0.1:3690"]);
    expect(previewOrigins("https://app.firstfold.io")).toEqual(["https://app.firstfold.io"]);
  });

  it("ignores a path, as an origin has none", () => {
    expect(previewOrigins("https://firstfold.io/in/mh")).toEqual(["https://firstfold.io", "https://www.firstfold.io"]);
  });
});

describe("the dashboard's frame-src for the preview", () => {
  it("allows the website at both of its addresses, so the preview still loads when one sends visitors on to the other", () => {
    const policy = contentSecurityPolicy({ development: false, https: true, framedOrigins: [...previewOrigins("https://firstfold.io")], razorpayCheckout: true });
    const frameSrc = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src")) ?? "";
    expect(frameSrc).toContain("https://firstfold.io");
    expect(frameSrc).toContain("https://www.firstfold.io");
  });
});
