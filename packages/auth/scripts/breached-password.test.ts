import { describe, expect, it, vi } from "vitest";
import { BreachCheckUnavailableError, breachedPasswordCount } from "./breached-password";

// SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
const PREFIX = "5BAA6";
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function respond(body: string, status = 200): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("breachedPasswordCount", () => {
  it("sends only the first five characters of the hash, never the rest of it or the password", async () => {
    const fetchFn = respond(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFFIX}:10437277\r\n`);
    await breachedPasswordCount("password", fetchFn);
    const [url, init] = vi.mocked(fetchFn).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    expect(new URL(url).pathname).not.toContain("password");
    expect(new Headers(init.headers).get("Add-Padding")).toBe("true");
  });

  it("returns how many times the password appears in known breaches", async () => {
    expect(await breachedPasswordCount("password", respond(`ABC:1\r\n${SUFFIX}:10437277\r\nDEF:2`))).toBe(10_437_277);
  });

  it("returns 0 for a password that is not listed, and ignores the padding rows", async () => {
    expect(await breachedPasswordCount("password", respond("ABC:5\r\nDEF:0"))).toBe(0);
    expect(await breachedPasswordCount("password", respond(`${SUFFIX}:0`))).toBe(0);
  });

  it("matches the hash whatever the case the service uses", async () => {
    expect(await breachedPasswordCount("password", respond(`${SUFFIX.toLowerCase()}:7`))).toBe(7);
  });

  it("says the check could not be made, rather than passing the password, when the service is down", async () => {
    await expect(breachedPasswordCount("password", respond("busy", 503))).rejects.toThrow(BreachCheckUnavailableError);
    const unreachable = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(breachedPasswordCount("password", unreachable)).rejects.toThrow(BreachCheckUnavailableError);
  });
});
