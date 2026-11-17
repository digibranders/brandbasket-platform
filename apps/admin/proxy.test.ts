import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as accessModule from "@/lib/server/cloudflare-access";
import { config, proxy } from "./proxy";

describe("admin proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when Cloudflare Access check fails", async () => {
    vi.spyOn(accessModule, "verifyCloudflareAccess").mockResolvedValue({
      ok: false,
      status: 401,
      reason: "Missing header",
    });

    const request = new NextRequest("http://console.brandbasket.localhost:3199/clients");
    const response = await proxy(request);

    expect(response.status).toBe(401);
    expect(await response.text()).toContain("Cloudflare Access assertion missing or invalid.");
  });

  it("calls NextResponse.next() when Cloudflare Access check passes", async () => {
    vi.spyOn(accessModule, "verifyCloudflareAccess").mockResolvedValue({
      ok: true,
      email: "staff@brandbasket.in",
    });

    const request = new NextRequest("http://console.brandbasket.localhost:3199/clients");
    const response = await proxy(request);

    expect(response.status).toBe(200);
  });

  describe("matcher", () => {
    // Next compiles the matcher with path-to-regexp; this one is a plain negative lookahead, so a RegExp is the same test.
    const runs = (path: string): boolean => new RegExp(`^${config.matcher[0]}$`).test(path);

    it.each(["/sw.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/favicon.ico"])("lets %s through without a Cloudflare Access check", (path) => {
      expect(runs(path)).toBe(false);
    });

    it.each(["/", "/clients", "/settings", "/api/uploads", "/iconsets"])("still checks %s", (path) => {
      expect(runs(path)).toBe(true);
    });
  });
});
