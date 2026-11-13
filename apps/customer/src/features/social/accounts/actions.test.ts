import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireService } from "@/lib/guards";
import { startConnectAction } from "./actions";
import { ensureWorkspace, fetchConnectLink } from "./client";
import { PostingServiceError } from "../posting-service";

vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireService: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("./client", () => ({ ensureWorkspace: vi.fn(), fetchConnectLink: vi.fn(), returnUrl: () => "https://app.example.com/social/accounts" }));

const owner = { role: "owner", businessId: "b1", businessName: "Om Sweets" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireService).mockResolvedValue(owner as never);
});

describe("startConnectAction", () => {
  it("makes the workspace for the signed-in business and returns the link to the network's page", async () => {
    vi.mocked(fetchConnectLink).mockResolvedValue("https://social.example.com/connect/abc");
    expect(await startConnectAction("instagram")).toEqual({ ok: true, data: { url: "https://social.example.com/connect/abc" } });
    expect(requireService).toHaveBeenCalledWith("social", { write: true });
    expect(ensureWorkspace).toHaveBeenCalledWith({ id: "b1", name: "Om Sweets" });
    expect(fetchConnectLink).toHaveBeenCalledWith("b1", "instagram", "https://app.example.com/social/accounts");
  });

  it("refuses a viewer and a network we do not know, and calls nothing", async () => {
    vi.mocked(requireService).mockResolvedValue({ ...owner, role: "viewer" } as never);
    expect((await startConnectAction("instagram")).ok).toBe(false);
    vi.mocked(requireService).mockResolvedValue(owner as never);
    expect(await startConnectAction("tiktok")).toMatchObject({ ok: false });
    expect(ensureWorkspace).not.toHaveBeenCalled();
  });

  it("says plainly when the posting service cannot be reached or refuses", async () => {
    vi.mocked(ensureWorkspace).mockRejectedValue(new PostingServiceError(0, "x"));
    expect(await startConnectAction("instagram")).toMatchObject({ ok: false, message: expect.stringContaining("not available just now") });
    vi.mocked(ensureWorkspace).mockRejectedValue(new PostingServiceError(500, "x"));
    expect(await startConnectAction("instagram")).toMatchObject({ ok: false, message: expect.stringContaining("could not start") });
  });
});
