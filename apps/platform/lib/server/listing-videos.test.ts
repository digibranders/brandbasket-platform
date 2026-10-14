import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectoryVideo } from "@fynix/db";
import { VimeoError, type VimeoVideo } from "@fynix/shared/server/vimeo";
import { checkVideoProgress, removeListingVideo, requestVideoUpload, type ListingVideoDeps } from "./listing-videos";

vi.mock("server-only", () => ({}));

const tenant = {
  userId: "user-a",
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  businessName: "Smile Dental",
  role: "owner",
} as const;
const NOW = new Date("2026-10-08T06:30:00.000Z");
const VIDEO_ID = "0192f3c4-2222-7000-8000-000000000002";
const POSTER = "https://i.vimeocdn.com/video/1-aaa_640x360";

function row(overrides: Partial<DirectoryVideo> = {}): DirectoryVideo {
  return {
    id: VIDEO_ID,
    businessId: tenant.businessId,
    slot: 1,
    status: "pending",
    vimeoId: "1233986429",
    vimeoHash: null,
    posterUrl: null,
    width: null,
    height: null,
    durationMs: null,
    bytes: 20_000_000,
    featured: false,
    createdAt: NOW,
    decidedAt: null,
    ...overrides,
  };
}

function onVimeo(overrides: Partial<VimeoVideo> = {}): VimeoVideo {
  return { vimeoId: "1233986429", state: "ready", seconds: 15.8, width: 1280, height: 720, hash: "858a280296", posterUrl: POSTER, ...overrides };
}

let vimeo: {
  createUpload: ReturnType<typeof vi.fn>;
  getVideo: ReturnType<typeof vi.fn>;
  deleteVideo: ReturnType<typeof vi.fn>;
};
let deps: ListingVideoDeps & {
  start: ReturnType<typeof vi.fn<ListingVideoDeps["start"]>>;
  findPending: ReturnType<typeof vi.fn<ListingVideoDeps["findPending"]>>;
  complete: ReturnType<typeof vi.fn<ListingVideoDeps["complete"]>>;
  discard: ReturnType<typeof vi.fn<ListingVideoDeps["discard"]>>;
  remove: ReturnType<typeof vi.fn<ListingVideoDeps["remove"]>>;
  log: ReturnType<typeof vi.fn<ListingVideoDeps["log"]>>;
};

beforeEach(() => {
  vimeo = {
    createUpload: vi.fn().mockResolvedValue({ vimeoId: "1233986429", uploadLink: "https://global.upload.vimeo.com/files/abc" }),
    getVideo: vi.fn().mockResolvedValue(onVimeo()),
    deleteVideo: vi.fn().mockResolvedValue(undefined),
  };
  deps = {
    vimeo,
    newId: () => VIDEO_ID,
    start: vi.fn<ListingVideoDeps["start"]>().mockImplementation((input) =>
      Promise.resolve({ kind: "started", video: row({ slot: input.slot, vimeoId: input.vimeoId, bytes: input.bytes }), staleVimeoIds: [] }),
    ),
    findPending: vi.fn<ListingVideoDeps["findPending"]>().mockResolvedValue(row()),
    complete: vi.fn<ListingVideoDeps["complete"]>().mockImplementation((input) =>
      Promise.resolve({
        kind: "live",
        video: row({ status: "approved", vimeoHash: input.vimeoHash, posterUrl: input.posterUrl, width: input.width, height: input.height, durationMs: input.durationMs }),
        replacedVimeoIds: [],
      }),
    ),
    discard: vi.fn<ListingVideoDeps["discard"]>().mockResolvedValue("1233986429"),
    remove: vi.fn<ListingVideoDeps["remove"]>().mockResolvedValue([]),
    log: vi.fn<ListingVideoDeps["log"]>(),
  } as typeof deps;
});

describe("requestVideoUpload", () => {
  it("asks Vimeo for an upload of the size the owner said, records it as waiting for its file, and hands back where to send it", async () => {
    const outcome = await requestVideoUpload(deps, tenant, 2, 20_000_000, NOW);
    expect(outcome).toEqual({ ok: true, video: { id: VIDEO_ID, slot: 2, status: "pending" }, uploadLink: "https://global.upload.vimeo.com/files/abc" });
    expect(vimeo.createUpload).toHaveBeenCalledWith({ size: 20_000_000, name: "Fynix · Smile Dental · video 2" });
    expect(deps.start).toHaveBeenCalledWith({
      id: VIDEO_ID,
      businessId: tenant.businessId,
      slot: 2,
      vimeoId: "1233986429",
      bytes: 20_000_000,
      uploadedByUserId: tenant.userId,
      now: NOW,
      staleBefore: new Date(NOW.getTime() - 60 * 60_000),
    });
  });

  it("deletes the unfinished uploads the database gave up, from Vimeo, once the new one is recorded", async () => {
    deps.start.mockResolvedValue({ kind: "started", video: row(), staleVimeoIds: ["111", "222"] });
    await requestVideoUpload(deps, tenant, 1, 1000, NOW);
    expect(vimeo.deleteVideo).toHaveBeenCalledTimes(2);
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("111");
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("222");
  });

  it("does not let a failed clean-up of an old upload spoil the new one", async () => {
    deps.start.mockResolvedValue({ kind: "started", video: row(), staleVimeoIds: ["111", "222"] });
    vimeo.deleteVideo.mockRejectedValueOnce(new VimeoError("down", 500));
    const outcome = await requestVideoUpload(deps, tenant, 1, 1000, NOW);
    expect(outcome.ok).toBe(true);
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("222");
    expect(deps.log).toHaveBeenCalled();
  });

  it.each([
    ["not-member", "Videos are part of Premium. Upgrade to add yours."],
    ["no-claim", "Add your listing first, then your videos can show on its page."],
  ] as const)("refuses (%s) and deletes the empty video it just made on Vimeo", async (kind, message) => {
    deps.start.mockResolvedValue({ kind });
    expect(await requestVideoUpload(deps, tenant, 1, 1000, NOW)).toEqual({ ok: false, refusal: kind, message });
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("1233986429");
  });

  it("deletes the video it made, and lets the error through, when recording it fails", async () => {
    deps.start.mockRejectedValue(new Error("database down"));
    await expect(requestVideoUpload(deps, tenant, 1, 1000, NOW)).rejects.toThrow("database down");
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("1233986429");
  });

  it("says uploads are not available when there is no Vimeo token, and records nothing", async () => {
    expect(await requestVideoUpload({ ...deps, vimeo: null }, tenant, 1, 1000, NOW)).toMatchObject({ ok: false, refusal: "unavailable" });
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("says uploads are not available when Vimeo refuses the token, and logs why", async () => {
    vimeo.createUpload.mockRejectedValue(new VimeoError("no", 401, "unauthorized"));
    expect(await requestVideoUpload(deps, tenant, 1, 1000, NOW)).toMatchObject({ ok: false, refusal: "unavailable" });
    expect(deps.log).toHaveBeenCalled();
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("says uploads are not available when the Fynix folder is missing on Vimeo, so no video is filed loose, and logs why", async () => {
    vimeo.createUpload.mockRejectedValue(new VimeoError('The Vimeo account has no "Fynix" folder.', 404, "configuration"));
    expect(await requestVideoUpload(deps, tenant, 1, 1000, NOW)).toMatchObject({ ok: false, refusal: "unavailable" });
    expect(deps.log).toHaveBeenCalled();
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("tells the owner to try later when Vimeo's upload allowance is used up", async () => {
    vimeo.createUpload.mockRejectedValue(new VimeoError("quota", 403, "quota"));
    expect(await requestVideoUpload(deps, tenant, 1, 1000, NOW)).toEqual({
      ok: false,
      refusal: "quota",
      message: "Video uploads are very busy right now. Please try again in a few days.",
    });
    expect(deps.start).not.toHaveBeenCalled();
  });

  it("answers a plain failure with a try-again message, and logs the real one", async () => {
    vimeo.createUpload.mockRejectedValue(new VimeoError("boom", 500));
    expect(await requestVideoUpload(deps, tenant, 1, 1000, NOW)).toMatchObject({ ok: false, refusal: "failed" });
    expect(deps.log).toHaveBeenCalled();
  });
});

describe("checkVideoProgress", () => {
  it("is gone for an upload that is not waiting: not this business's, already live, or given up", async () => {
    deps.findPending.mockResolvedValue(null);
    expect(await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).toEqual({ state: "gone" });
    expect(vimeo.getVideo).not.toHaveBeenCalled();
  });

  it.each(["uploading", "preparing"] as const)("says it is still %s while Vimeo has not finished", async (state) => {
    vimeo.getVideo.mockResolvedValue(onVimeo({ state, hash: null, posterUrl: null, seconds: null, width: null, height: null }));
    expect(await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).toEqual({ state });
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.discard).not.toHaveBeenCalled();
  });

  it("takes the video live once Vimeo has prepared it, with what Vimeo reported", async () => {
    expect(await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).toEqual({ state: "live", video: { id: VIDEO_ID, slot: 1, status: "approved" } });
    expect(deps.complete).toHaveBeenCalledWith({
      videoId: VIDEO_ID,
      businessId: tenant.businessId,
      vimeoHash: "858a280296",
      posterUrl: POSTER,
      width: 1280,
      height: 720,
      durationMs: 15_800,
      now: NOW,
    });
  });

  it("accepts a clip a little over 16 seconds, within the margin, and refuses one over it", async () => {
    vimeo.getVideo.mockResolvedValue(onVimeo({ seconds: 16.5 }));
    expect((await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).state).toBe("live");
    vimeo.getVideo.mockResolvedValue(onVimeo({ seconds: 16.6 }));
    expect((await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).state).toBe("failed");
  });

  it("deletes a clip that is too long from Vimeo, drops its row, and says how long it was", async () => {
    vimeo.getVideo.mockResolvedValue(onVimeo({ seconds: 23.4 }));
    expect(await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).toEqual({ state: "failed", message: "That video is 23 seconds. The limit is 16 seconds." });
    expect(deps.discard).toHaveBeenCalledWith({ videoId: VIDEO_ID, businessId: tenant.businessId, now: NOW });
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("1233986429");
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("deletes the replaced video from Vimeo after the new one is live", async () => {
    deps.complete.mockResolvedValue({ kind: "live", video: row({ status: "approved" }), replacedVimeoIds: ["999"] });
    await checkVideoProgress(deps, tenant, VIDEO_ID, NOW);
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("999");
  });

  it("gives up a video Vimeo could not process, or no longer has, and says so", async () => {
    vimeo.getVideo.mockResolvedValue(onVimeo({ state: "failed" }));
    expect(await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).toMatchObject({ state: "failed" });
    expect(deps.discard).toHaveBeenCalled();
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("1233986429");

    deps.discard.mockClear();
    vimeo.deleteVideo.mockClear();
    vimeo.getVideo.mockResolvedValue(null);
    expect(await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).toMatchObject({ state: "failed" });
    expect(deps.discard).toHaveBeenCalled();
    expect(vimeo.deleteVideo).not.toHaveBeenCalled();
  });

  it("drops a video whose owner stopped being a member while it was prepared", async () => {
    deps.complete.mockResolvedValue({ kind: "not-member" });
    expect(await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).toEqual({ state: "failed", message: "Videos are part of Premium. Upgrade to add yours." });
    expect(deps.discard).toHaveBeenCalled();
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("1233986429");
  });

  it("is gone when someone else got there first", async () => {
    deps.complete.mockResolvedValue({ kind: "not-found" });
    expect(await checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).toEqual({ state: "gone" });
  });

  it("lets a Vimeo failure through, so the page asks again a moment later, and keeps the row", async () => {
    vimeo.getVideo.mockRejectedValue(new VimeoError("down", 503));
    await expect(checkVideoProgress(deps, tenant, VIDEO_ID, NOW)).rejects.toBeInstanceOf(VimeoError);
    expect(deps.discard).not.toHaveBeenCalled();
  });

  it("says it failed when Vimeo is not configured", async () => {
    expect(await checkVideoProgress({ ...deps, vimeo: null }, tenant, VIDEO_ID, NOW)).toMatchObject({ state: "failed" });
  });
});

describe("removeListingVideo", () => {
  it("removes the slot's videos and deletes each from Vimeo afterwards", async () => {
    deps.remove.mockResolvedValue(["111", "222"]);
    await removeListingVideo(deps, tenant, 3, NOW);
    expect(deps.remove).toHaveBeenCalledWith({ businessId: tenant.businessId, slot: 3, now: NOW });
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("111");
    expect(vimeo.deleteVideo).toHaveBeenCalledWith("222");
  });

  it("still removes the video from the page when Vimeo cannot be reached, and logs it", async () => {
    deps.remove.mockResolvedValue(["111"]);
    vimeo.deleteVideo.mockRejectedValue(new VimeoError("down", 503));
    await expect(removeListingVideo(deps, tenant, 1, NOW)).resolves.toBeUndefined();
    expect(deps.log).toHaveBeenCalled();
  });

  it("deletes nothing from Vimeo when the slot was empty", async () => {
    await removeListingVideo(deps, tenant, 1, NOW);
    expect(vimeo.deleteVideo).not.toHaveBeenCalled();
  });
});
