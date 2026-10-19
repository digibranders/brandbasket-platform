import type { Resolver } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import { VERCEL_APEX_IP, VERCEL_CNAME_TARGET } from "@brandbasket/shared/lib/onboarding/domain-dns";
import { checkDomainDns } from "./domain-check";

vi.mock("server-only", () => ({}));

function dnsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function resolverWith(answers: Record<string, { a?: string[]; cname?: string[] }>): Resolver {
  return {
    resolve4: async (name: string) => answers[name]?.a ?? Promise.reject(dnsError("ENODATA")),
    resolveCname: async (name: string) => answers[name]?.cname ?? Promise.reject(dnsError("ENODATA")),
  } as unknown as Resolver;
}

describe("checkDomainDns", () => {
  it("is connected once the bare domain and www both point at the host", async () => {
    const resolver = resolverWith({ "example.com": { a: [VERCEL_APEX_IP] }, "www.example.com": { cname: [VERCEL_CNAME_TARGET] } });
    await expect(checkDomainDns("example.com", resolver)).resolves.toEqual({
      overall: "connected",
      records: [
        { host: "@", status: "connected" },
        { host: "www", status: "connected" },
      ],
    });
  });

  it("is pending when nothing has been added yet", async () => {
    const result = await checkDomainDns("example.com", resolverWith({}));
    expect(result.overall).toBe("pending");
  });

  it("says so when the domain still points at another host", async () => {
    const resolver = resolverWith({ "example.com": { a: ["203.0.113.9"] }, "www.example.com": { cname: [VERCEL_CNAME_TARGET] } });
    const result = await checkDomainDns("example.com", resolver);
    expect(result.overall).toBe("elsewhere");
    expect(result.records[0]).toEqual({ host: "@", status: "elsewhere" });
  });

  it("checks a single CNAME for another subdomain", async () => {
    const result = await checkDomainDns("shop.example.com", resolverWith({ "shop.example.com": { cname: [VERCEL_CNAME_TARGET] } }));
    expect(result).toEqual({ overall: "connected", records: [{ host: "shop", status: "connected" }] });
  });

  it("lets an unreachable DNS service through, for the caller to show as try again", async () => {
    const resolver = { resolve4: async () => Promise.reject(dnsError("ETIMEOUT")), resolveCname: async () => [] } as unknown as Resolver;
    await expect(checkDomainDns("example.com", resolver)).rejects.toThrow("ETIMEOUT");
  });
});
