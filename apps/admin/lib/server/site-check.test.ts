import { describe, expect, it, vi } from "vitest";
import { checkSiteAddress, isPrivateAddress, type SiteCheckDeps } from "./site-check";

vi.mock("server-only", () => ({}));

const PUBLIC_V4 = "93.184.216.34";
const PUBLIC_V6 = "2606:2800:220:1:248:1893:25c8:1946";

function deps(overrides: Partial<SiteCheckDeps> = {}): SiteCheckDeps {
  return {
    resolve4: vi.fn(async () => [PUBLIC_V4]),
    resolve6: vi.fn(async () => {
      throw new Error("ENODATA");
    }),
    fetch: vi.fn(async () => new Response(null, { status: 200 })),
    ...overrides,
  };
}

const failing = async (): Promise<string[]> => {
  throw new Error("ENOTFOUND");
};

describe("checkSiteAddress: hostnames", () => {
  it.each(["localhost", "127.0.0.1", "169.254.169.254", "::1", "[::1]", "bad_host.example.com", "-bad.example.com", "bad-.example.com", "a..example.com", "example", "shop.1"])(
    "refuses %s before any lookup",
    async (hostname) => {
      const d = deps();
      await expect(checkSiteAddress(hostname, d)).resolves.toEqual({ ok: false, reason: "invalid-host" });
      expect(d.resolve4).not.toHaveBeenCalled();
      expect(d.fetch).not.toHaveBeenCalled();
    },
  );

  it("accepts a plain public hostname and an internationalised top label", async () => {
    await expect(checkSiteAddress("shop.example.com", deps())).resolves.toEqual({ ok: true, status: 200 });
    await expect(checkSiteAddress("shop.xn--p1ai", deps())).resolves.toEqual({ ok: true, status: 200 });
  });
});

describe("checkSiteAddress: DNS", () => {
  it("says dns when neither lookup finds an address", async () => {
    const d = deps({ resolve4: failing, resolve6: failing });
    await expect(checkSiteAddress("shop.example.com", d)).resolves.toEqual({ ok: false, reason: "dns" });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("says dns when both lookups return nothing", async () => {
    await expect(checkSiteAddress("shop.example.com", deps({ resolve4: async () => [], resolve6: async () => [] }))).resolves.toEqual({
      ok: false,
      reason: "dns",
    });
  });

  it("counts an IPv6 answer on its own", async () => {
    const d = deps({ resolve4: failing, resolve6: async () => [PUBLIC_V6] });
    await expect(checkSiteAddress("shop.example.com", d)).resolves.toEqual({ ok: true, status: 200 });
  });
});

describe("checkSiteAddress: private addresses", () => {
  it.each(["10.0.0.5", "127.0.0.1", "169.254.10.10", "172.16.0.1", "172.31.255.255", "192.168.1.1", "0.0.0.0", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1"])(
    "treats %s as private",
    (address) => {
      expect(isPrivateAddress(address)).toBe(true);
    },
  );

  it.each([PUBLIC_V4, "8.8.8.8", "172.32.0.1", "172.15.255.255", "11.0.0.1", PUBLIC_V6, "::ffff:8.8.8.8"])("treats %s as public", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("treats an IPv4-mapped loopback address as private", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("refuses when every address is private, without fetching", async () => {
    const d = deps({ resolve4: async () => ["10.0.0.5", "192.168.0.9"], resolve6: async () => ["fd00::9"] });
    await expect(checkSiteAddress("shop.example.com", d)).resolves.toEqual({ ok: false, reason: "private-address" });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("refuses when any one address is private, even if others are public", async () => {
    const d = deps({ resolve4: async () => ["10.0.0.5", PUBLIC_V4] });
    await expect(checkSiteAddress("shop.example.com", d)).resolves.toEqual({ ok: false, reason: "private-address" });
    expect(d.fetch).not.toHaveBeenCalled();
  });
});

describe("checkSiteAddress: the HTTPS request", () => {
  it("asks for the root over HTTPS without following redirects, with a timeout", async () => {
    const d = deps();
    await checkSiteAddress("shop.example.com", d);
    const [url, init] = vi.mocked(d.fetch).mock.calls[0] ?? [];
    expect(url).toBe("https://shop.example.com/");
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([200, 204, 301, 302, 399])("passes a status of %i and reports it", async (status) => {
    await expect(checkSiteAddress("shop.example.com", deps({ fetch: async () => new Response(null, { status }) }))).resolves.toEqual({
      ok: true,
      status,
    });
  });

  it.each([400, 404, 500, 503])("says http-status with the status %i", async (status) => {
    await expect(checkSiteAddress("shop.example.com", deps({ fetch: async () => new Response(null, { status }) }))).resolves.toEqual({
      ok: false,
      reason: "http-status",
      status,
    });
  });

  it.each([
    ["the certificate has expired", Object.assign(new TypeError("fetch failed"), { cause: { code: "CERT_HAS_EXPIRED" } })],
    ["the name does not match", Object.assign(new TypeError("fetch failed"), { cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } })],
    ["the chain cannot be verified", Object.assign(new TypeError("fetch failed"), { cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" } })],
  ])("says tls when %s", async (_label, error) => {
    await expect(checkSiteAddress("shop.example.com", deps({ fetch: async () => Promise.reject(error) }))).resolves.toEqual({
      ok: false,
      reason: "tls",
    });
  });

  it("says timeout when the request is aborted by its timer", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    await expect(checkSiteAddress("shop.example.com", deps({ fetch: async () => Promise.reject(timeout) }))).resolves.toEqual({
      ok: false,
      reason: "timeout",
    });
  });

  it("says unreachable for a connection that fails without a TLS code", async () => {
    const refused = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    await expect(checkSiteAddress("shop.example.com", deps({ fetch: async () => Promise.reject(refused) }))).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});
