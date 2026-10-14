import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./client-ip";

describe("clientIpFrom", () => {
  it("uses the first X-Forwarded-For address", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": " 198.51.100.4 " }))).toBe("198.51.100.4");
  });

  it("returns unknown when neither header is present or usable", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});
