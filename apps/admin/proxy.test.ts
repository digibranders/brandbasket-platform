import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as accessModule from "@/lib/server/cloudflare-access";
import { proxy } from "./proxy";

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
});
