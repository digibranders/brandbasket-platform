// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/platform/lib/server/account-erase-auth", () => ({ accountEraseToken: vi.fn() }));
vi.mock("@/platform/lib/server/account-erasure", () => ({ realErasureDeps: vi.fn(() => ({} as never)) }));
vi.mock("@/platform/lib/account-erasure-run", () => ({ runAccountErasure: vi.fn() }));

import { accountEraseToken } from "@/platform/lib/server/account-erase-auth";
import { realErasureDeps } from "@/platform/lib/server/account-erasure";
import { runAccountErasure } from "@/platform/lib/account-erasure-run";
import { POST } from "./route";

const TOKEN = "t".repeat(40);
const post = (url: string = "http://localhost/api/internal/erase-closed-accounts", auth?: string): Request =>
  new Request(url, { method: "POST", headers: auth === undefined ? {} : { Authorization: auth } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountEraseToken).mockReturnValue(TOKEN);
  vi.mocked(runAccountErasure).mockResolvedValue({ dryRun: false, due: 0, items: [] });
});

describe("POST /api/internal/erase-closed-accounts", () => {
  it("answers 503 when the secret is not configured, and erases nothing", async () => {
    vi.mocked(accountEraseToken).mockReturnValue(null);
    const response = await POST(post("http://localhost/api/internal/erase-closed-accounts", `Bearer ${TOKEN}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The erase job is not configured." });
    expect(runAccountErasure).not.toHaveBeenCalled();
  });

  it("answers 401 for a missing secret, and erases nothing", async () => {
    const response = await POST(post());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorised." });
    expect(runAccountErasure).not.toHaveBeenCalled();
  });

  it("answers 401 for a wrong secret, and erases nothing", async () => {
    const response = await POST(post("http://localhost/api/internal/erase-closed-accounts", `Bearer ${"x".repeat(40)}`));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorised." });
    expect(runAccountErasure).not.toHaveBeenCalled();
  });

  it("answers 400 for an invalid dryRun parameter", async () => {
    const response = await POST(post("http://localhost/api/internal/erase-closed-accounts?dryRun=2", `Bearer ${TOKEN}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "dryRun must be 0 or 1 and limit a whole number from 1 to 100." });
    expect(runAccountErasure).not.toHaveBeenCalled();
  });

  it("answers 400 for an invalid limit parameter", async () => {
    for (const badLimit of ["0", "101", "-1", "abc"]) {
      const response = await POST(
        post(`http://localhost/api/internal/erase-closed-accounts?limit=${badLimit}`, `Bearer ${TOKEN}`),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "dryRun must be 0 or 1 and limit a whole number from 1 to 100." });
      expect(runAccountErasure).not.toHaveBeenCalled();
    }
  });

  it("runs the erase with default options and returns the report", async () => {
    const report = { dryRun: false, due: 1, items: [{ closureId: "c1", status: "erased" as const, files: 1, filesNotRemoved: 0, videos: 0, videosNotRemoved: 0 }] };
    vi.mocked(runAccountErasure).mockResolvedValue(report);

    const response = await POST(post("http://localhost/api/internal/erase-closed-accounts", `Bearer ${TOKEN}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
    expect(realErasureDeps).toHaveBeenCalledTimes(1);
    expect(runAccountErasure).toHaveBeenCalledWith(expect.anything(), {
      now: expect.any(Date),
      limit: 25,
      dryRun: false,
    });
  });

  it("passes dryRun=1 and custom limit to the erase run", async () => {
    const report = { dryRun: true, due: 1, items: [{ closureId: "c1", status: "would-erase" as const }] };
    vi.mocked(runAccountErasure).mockResolvedValue(report);

    const response = await POST(
      post("http://localhost/api/internal/erase-closed-accounts?dryRun=1&limit=5", `Bearer ${TOKEN}`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
    expect(runAccountErasure).toHaveBeenCalledWith(expect.anything(), {
      now: expect.any(Date),
      limit: 5,
      dryRun: true,
    });
  });
});
