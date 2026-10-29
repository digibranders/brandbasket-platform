import { beforeEach, describe, expect, it, vi } from "vitest";
import { kickoffSyncToken, startBuildsAfterKickoff } from "@/lib/server/kickoff-sync";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/kickoff-sync", () => ({ kickoffSyncToken: vi.fn(), startBuildsAfterKickoff: vi.fn() }));

const TOKEN = "k".repeat(40);
const post = (auth: string | null = `Bearer ${TOKEN}`): Request =>
  new Request("http://app.localhost:3198/api/internal/start-builds-after-kickoff", { method: "POST", headers: auth === null ? {} : { Authorization: auth } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(kickoffSyncToken).mockReturnValue(TOKEN);
  vi.mocked(startBuildsAfterKickoff).mockResolvedValue({ checked: 2, started: 1, failed: 0 });
});

describe("POST /api/internal/start-builds-after-kickoff", () => {
  it("is off until its secret is configured", async () => {
    vi.mocked(kickoffSyncToken).mockReturnValue(null);
    expect((await POST(post())).status).toBe(503);
    expect(startBuildsAfterKickoff).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret", async () => {
    expect((await POST(post(null))).status).toBe(401);
    expect((await POST(post(`Bearer ${"x".repeat(40)}`))).status).toBe(401);
    expect(startBuildsAfterKickoff).not.toHaveBeenCalled();
  });

  it("runs the sync and returns the report", async () => {
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checked: 2, started: 1, failed: 0 });
  });

  it("answers 502 when a build could not be started, so a person looks", async () => {
    vi.mocked(startBuildsAfterKickoff).mockResolvedValue({ checked: 1, started: 0, failed: 1 });
    expect((await POST(post())).status).toBe(502);
  });
});
