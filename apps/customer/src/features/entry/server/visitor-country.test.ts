import { afterEach, describe, expect, it, vi } from "vitest";
import { visitorCountry } from "./visitor-country";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

describe("visitorCountry", () => {
  it("reads Cloudflare's header off Vercel, in capitals", () => {
    expect(visitorCountry(new Headers({ "cf-ipcountry": "ae" }))).toBe("AE");
  });

  it("ignores a Vercel header a client sent when not on Vercel", () => {
    expect(visitorCountry(new Headers({ "x-vercel-ip-country": "AE" }))).toBe("IN");
    expect(visitorCountry(new Headers({ "cf-ipcountry": "AE", "x-vercel-ip-country": "IN" }))).toBe("AE");
  });

  it("reads Vercel's header, and not Cloudflare's, on Vercel", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(visitorCountry(new Headers({ "x-vercel-ip-country": "US", "cf-ipcountry": "IN" }))).toBe("US");
  });

  it("falls back to India for a missing, unknown or unlisted country", () => {
    expect(visitorCountry(new Headers())).toBe("IN");
    expect(visitorCountry(new Headers({ "cf-ipcountry": "XX" }))).toBe("IN");
    expect(visitorCountry(new Headers({ "cf-ipcountry": "T1" }))).toBe("IN");
  });
});
