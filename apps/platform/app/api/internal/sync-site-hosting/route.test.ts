import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteHostingSyncToken, syncSiteHosting } from "@/lib/server/site-hosting";
import type { HostingSyncReport } from "@/lib/site-hosting-sync";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/site-hosting", () => ({ siteHostingSyncToken: vi.fn(), syncSiteHosting: vi.fn() }));

const mockedToken = vi.mocked(siteHostingSyncToken);
const mockedSync = vi.mocked(syncSiteHosting);

const TOKEN = "s".repeat(40);
const URL = "http://app.localhost:3198/api/internal/sync-site-hosting";

function post(query = "", auth: string | null = `Bearer ${TOKEN}`): Request {
  return new Request(`${URL}${query}`, { method: "POST", headers: auth === null ? {} : { Authorization: auth } });
}

function report(overrides: Partial<HostingSyncReport> = {}): HostingSyncReport {
  return { dryRun: false, sites: 1, items: [], held: [], braked: false, failed: 0, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedToken.mockReturnValue(TOKEN);
  mockedSync.mockResolvedValue(report());
});

describe("POST /api/internal/sync-site-hosting", () => {
  it("is off until its secret is configured", async () => {
    mockedToken.mockReturnValue(null);
    expect((await POST(post())).status).toBe(503);
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret", async () => {
    expect((await POST(post("", null))).status).toBe(401);
    expect((await POST(post("", `Bearer ${"x".repeat(40)}`))).status).toBe(401);
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it("refuses a dryRun it does not understand", async () => {
    expect((await POST(post("?dryRun=yes"))).status).toBe(400);
    expect(mockedSync).not.toHaveBeenCalled();
  });

  it("runs for real by default and answers 200 with the report", async () => {
    const response = await POST(post());
    expect(mockedSync).toHaveBeenCalledWith({ dryRun: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report());
  });

  it("passes dryRun=1 through", async () => {
    await POST(post("?dryRun=1"));
    expect(mockedSync).toHaveBeenCalledWith({ dryRun: true });
  });

  it("answers 409 when the brake stopped a batch of pauses", async () => {
    mockedSync.mockResolvedValue(report({ braked: true }));
    expect((await POST(post())).status).toBe(409);
  });

  it("answers 502 when the host refused a change", async () => {
    mockedSync.mockResolvedValue(report({ failed: 1, items: [{ businessId: "a", status: "failed", error: "boom" }] }));
    expect((await POST(post())).status).toBe(502);
  });
});
