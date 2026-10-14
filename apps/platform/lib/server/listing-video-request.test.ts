import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@fynix/shared/lib/access";
import { VIDEO_MAX_UPLOAD_BYTES, VIDEO_PREMIUM_MESSAGE, VIDEO_TOO_LARGE_MESSAGE } from "@fynix/shared/lib/directory/videos";
import {
  handleVideoFinishRequest,
  handleVideoUploadRequest,
  NO_LISTING_FOR_VIDEO_MESSAGE,
  type VideoRequestDeps,
} from "./listing-video-request";
import type { VideoProgress, VideoUploadOutcome } from "./listing-videos";

vi.mock("server-only", () => ({}));

const APP_ORIGIN = "http://app.localhost:3000";
const APP_HOST = "app.localhost:3000";
const VIDEO_ID = "0192f3c4-2222-7000-8000-000000000002";
const LINK = "https://global.upload.vimeo.com/files/abc";

const tenant: TenantContext = {
  userId: "user-a",
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  businessName: "Smile Dental",
  role: "owner",
};

interface Options {
  readonly host?: string;
  readonly origin?: string;
  readonly contentType?: string | null;
  readonly contentLength?: boolean;
  readonly body?: unknown;
  readonly raw?: string;
}

/** A POST the way the dashboard's script sends it: JSON, from its own origin. */
function post(path: string, options: Options = {}): Request {
  const text = options.raw ?? JSON.stringify(options.body === undefined ? { slot: 1, size: 20_000_000 } : options.body);
  const headers = new Headers({ host: options.host ?? APP_HOST, origin: options.origin ?? APP_ORIGIN });
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json");
  if (options.contentLength !== false) headers.set("content-length", String(new TextEncoder().encode(text).length));
  return new Request(`${APP_ORIGIN}${path}`, { method: "POST", headers, body: text });
}

let deps: {
  getTenant: ReturnType<typeof vi.fn<VideoRequestDeps["getTenant"]>>;
  appOrigin: string;
  videoAccess: ReturnType<typeof vi.fn<VideoRequestDeps["videoAccess"]>>;
  consumeAllowance: ReturnType<typeof vi.fn<VideoRequestDeps["consumeAllowance"]>>;
  requestUpload: ReturnType<typeof vi.fn<VideoRequestDeps["requestUpload"]>>;
  checkProgress: ReturnType<typeof vi.fn<VideoRequestDeps["checkProgress"]>>;
  log: ReturnType<typeof vi.fn<VideoRequestDeps["log"]>>;
};

beforeEach(() => {
  deps = {
    getTenant: vi.fn<VideoRequestDeps["getTenant"]>().mockResolvedValue(tenant),
    appOrigin: APP_ORIGIN,
    videoAccess: vi.fn<VideoRequestDeps["videoAccess"]>().mockResolvedValue("ok"),
    consumeAllowance: vi.fn<VideoRequestDeps["consumeAllowance"]>().mockResolvedValue({ allowed: true }),
    requestUpload: vi
      .fn<VideoRequestDeps["requestUpload"]>()
      .mockResolvedValue({ ok: true, video: { id: VIDEO_ID, slot: 1, status: "pending" }, uploadLink: LINK } satisfies VideoUploadOutcome),
    checkProgress: vi.fn<VideoRequestDeps["checkProgress"]>().mockResolvedValue({ state: "preparing" } satisfies VideoProgress),
    log: vi.fn<VideoRequestDeps["log"]>(),
  };
});

async function expectRefused(response: Response, status: number, message?: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: message ?? expect.any(String) });
}

describe("handleVideoUploadRequest", () => {
  it("answers 201 with the new video and where to send it, and spends one of the owner's uploads", async () => {
    const response = await handleVideoUploadRequest(post("/api/listing-videos", { body: { slot: 2, size: 20_000_000 } }), deps);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ video: { id: VIDEO_ID, slot: 1, status: "pending" }, uploadLink: LINK });
    expect(deps.requestUpload).toHaveBeenCalledWith(tenant, 2, 20_000_000);
    expect(deps.consumeAllowance).toHaveBeenCalledTimes(1);
  });

  it("refuses another host and another origin, before anything else", async () => {
    await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos", { host: "marketing.example.com" }), deps), 403);
    await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos", { origin: "https://evil.example.com" }), deps), 403);
    expect(deps.getTenant).not.toHaveBeenCalled();
    expect(deps.requestUpload).not.toHaveBeenCalled();
  });

  it("wants JSON, with a slot from 1 to 3 and a whole number of bytes", async () => {
    await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos", { contentType: "text/plain" }), deps), 400);
    await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos", { raw: "not json" }), deps), 400);
    for (const body of [{ slot: 0, size: 1000 }, { slot: 4, size: 1000 }, { slot: "x", size: 1000 }, { size: 1000 }, { slot: 1 }, { slot: 1, size: 0 }, { slot: 1, size: -5 }, { slot: 1, size: 1.5 }, { slot: 1, size: "1000" }, [], null]) {
      await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos", { body }), deps), 400);
    }
    expect(deps.requestUpload).not.toHaveBeenCalled();
  });

  it("refuses a file over 50 MB with the size message, before anything is made on Vimeo", async () => {
    await expectRefused(
      await handleVideoUploadRequest(post("/api/listing-videos", { body: { slot: 1, size: VIDEO_MAX_UPLOAD_BYTES + 1 } }), deps),
      413,
      VIDEO_TOO_LARGE_MESSAGE,
    );
    const exactly = await handleVideoUploadRequest(post("/api/listing-videos", { body: { slot: 1, size: VIDEO_MAX_UPLOAD_BYTES } }), deps);
    expect(exactly.status).toBe(201);
  });

  it("wants a signed-in customer", async () => {
    deps.getTenant.mockResolvedValue(null);
    await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos"), deps), 401);
    expect(deps.videoAccess).not.toHaveBeenCalled();
  });

  it("answers a business that is not a Premium member with the Premium message, and spends nothing", async () => {
    deps.videoAccess.mockResolvedValue("not-member");
    await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos"), deps), 403, VIDEO_PREMIUM_MESSAGE);
    expect(deps.consumeAllowance).not.toHaveBeenCalled();
    expect(deps.requestUpload).not.toHaveBeenCalled();
  });

  it("answers a member with no listing to show it on", async () => {
    deps.videoAccess.mockResolvedValue("no-listing");
    await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos"), deps), 409, NO_LISTING_FOR_VIDEO_MESSAGE);
    expect(deps.requestUpload).not.toHaveBeenCalled();
  });

  it("refuses a request over the hourly allowance, with Retry-After", async () => {
    deps.consumeAllowance.mockResolvedValue({ allowed: false, retryAfterSeconds: 600, message: "Too many." });
    const response = await handleVideoUploadRequest(post("/api/listing-videos"), deps);
    await expectRefused(response, 429, "Too many.");
    expect(response.headers.get("retry-after")).toBe("600");
    expect(deps.requestUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["not-member", 403],
    ["no-claim", 409],
    ["unavailable", 503],
    ["quota", 503],
    ["failed", 502],
  ] as const)("answers a refused upload (%s) with %i and the words for the owner", async (refusal, status) => {
    deps.requestUpload.mockResolvedValue({ ok: false, refusal, message: "Words for the owner." });
    await expectRefused(await handleVideoUploadRequest(post("/api/listing-videos"), deps), status, "Words for the owner.");
  });

  it("lets an unexpected failure through, for the route to turn into a 500", async () => {
    deps.requestUpload.mockRejectedValue(new Error("database down"));
    await expect(handleVideoUploadRequest(post("/api/listing-videos"), deps)).rejects.toThrow("database down");
  });
});

describe("handleVideoFinishRequest", () => {
  const finish = (id = VIDEO_ID, options: Options = {}): Request => post(`/api/listing-videos/${id}/finish`, { ...options, raw: "" });

  it.each([{ state: "uploading" }, { state: "preparing" }] as const)("answers 200 with where it stands while it is %j", async (progress) => {
    deps.checkProgress.mockResolvedValue(progress);
    const response = await handleVideoFinishRequest(finish(), deps, VIDEO_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(progress);
    expect(deps.checkProgress).toHaveBeenCalledWith(tenant, VIDEO_ID);
  });

  it("answers 200 with the video once it is live", async () => {
    deps.checkProgress.mockResolvedValue({ state: "live", video: { id: VIDEO_ID, slot: 1, status: "approved" } });
    const response = await handleVideoFinishRequest(finish(), deps, VIDEO_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "live", video: { id: VIDEO_ID, slot: 1, status: "approved" } });
  });

  it("answers 422 with the words for the owner when the video was given up", async () => {
    deps.checkProgress.mockResolvedValue({ state: "failed", message: "That video is 23 seconds. The limit is 16 seconds." });
    await expectRefused(await handleVideoFinishRequest(finish(), deps, VIDEO_ID), 422, "That video is 23 seconds. The limit is 16 seconds.");
  });

  it("answers 404 for an upload that is not waiting, and for an id that is not a UUID without asking anyone", async () => {
    deps.checkProgress.mockResolvedValue({ state: "gone" });
    await expectRefused(await handleVideoFinishRequest(finish(), deps, VIDEO_ID), 404);
    deps.checkProgress.mockClear();
    await expectRefused(await handleVideoFinishRequest(finish("not-a-uuid"), deps, "not-a-uuid"), 404);
    expect(deps.checkProgress).not.toHaveBeenCalled();
  });

  it("refuses another host and another origin, and wants a signed-in customer", async () => {
    await expectRefused(await handleVideoFinishRequest(finish(VIDEO_ID, { origin: "https://evil.example.com" }), deps, VIDEO_ID), 403);
    await expectRefused(await handleVideoFinishRequest(finish(VIDEO_ID, { host: "marketing.example.com" }), deps, VIDEO_ID), 403);
    deps.getTenant.mockResolvedValue(null);
    await expectRefused(await handleVideoFinishRequest(finish(), deps, VIDEO_ID), 401);
    expect(deps.checkProgress).not.toHaveBeenCalled();
  });

  it("answers 502, and logs why, when Vimeo cannot be reached, so the page asks again a moment later", async () => {
    deps.checkProgress.mockRejectedValue(new Error("Vimeo answered 503."));
    const response = await handleVideoFinishRequest(finish(), deps, VIDEO_ID);
    await expectRefused(response, 502);
    expect(deps.log).toHaveBeenCalledTimes(1);
  });
});
