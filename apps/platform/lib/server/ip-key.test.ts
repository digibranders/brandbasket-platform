import { describe, expect, it, vi } from "vitest";
import { ipRateLimitKey } from "./ip-key";

vi.mock("server-only", () => ({}));

describe("ipRateLimitKey", () => {
  it("keeps an IPv4 address as given", () => {
    expect(ipRateLimitKey("203.0.113.9")).toBe("203.0.113.9");
  });

  it("collapses a full IPv6 address to its first four groups, with leading zeros stripped", () => {
    expect(ipRateLimitKey("2001:0db8:0000:0000:0000:ff00:0042:8329")).toBe("2001:db8:0:0");
  });

  it("expands a '::' run before collapsing to the first four groups", () => {
    expect(ipRateLimitKey("2001:db8:85a3::8a2e:370:7334")).toBe("2001:db8:85a3:0");
  });

  it("expands a leading '::' (loopback) to all zero groups", () => {
    expect(ipRateLimitKey("::1")).toBe("0:0:0:0");
  });

  it("uses an unparseable value as-is rather than discarding it", () => {
    expect(ipRateLimitKey("not-an-ip")).toBe("not-an-ip");
  });

  it("keys an IPv4-mapped IPv6 address on its IPv4 part, not the shared all-zeros /64", () => {
    expect(ipRateLimitKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
  });

  it("recognizes an IPv4-mapped address regardless of case", () => {
    expect(ipRateLimitKey("::FFFF:1.2.3.4")).toBe("1.2.3.4");
  });

  it("keys an IPv4-mapped IPv6 address written in hex-group form on its IPv4 part", () => {
    expect(ipRateLimitKey("::ffff:cb00:7109")).toBe("203.0.113.9");
  });

  it("recognizes an IPv4-mapped hex-form address regardless of case", () => {
    expect(ipRateLimitKey("::FFFF:CB00:7109")).toBe("203.0.113.9");
  });

  it("keys a fully expanded IPv4-mapped hex-form address the same as its compressed spelling", () => {
    expect(ipRateLimitKey("0:0:0:0:0:ffff:cb00:7109")).toBe("203.0.113.9");
  });

  it("treats an upper-case and a zero-padded spelling of the same address as one key", () => {
    const upper = ipRateLimitKey("2001:DB8::1");
    const padded = ipRateLimitKey("2001:0db8::1");
    expect(upper).toBe(padded);
    expect(upper).toBe("2001:db8:0:0");
  });
});
