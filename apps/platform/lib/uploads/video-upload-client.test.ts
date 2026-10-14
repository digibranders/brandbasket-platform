import { describe, expect, it, vi } from "vitest";
import { VIDEO_MAX_UPLOAD_BYTES, VIDEO_TOO_LARGE_MESSAGE } from "@firstfold/shared/lib/directory/videos";
import {
  messageForVideoResponse,
  requestVideoUpload,
  sendFileToVimeo,
  videoFileProblem,
  videoLengthProblem,
  waitForVideo,
  type VideoRequest,
  type WaitOptions,
  type WaitState,
} from "./video-upload-client";

describe("videoFileProblem", () => {
  it("accepts an MP4, a MOV and a WebM within 50 MB", () => {
    expect(videoFileProblem({ size: 20_000_000, type: "video/mp4" })).toBeNull();
    expect(videoFileProblem({ size: 20_000_000, type: "video/quicktime" })).toBeNull();
    expect(videoFileProblem({ size: VIDEO_MAX_UPLOAD_BYTES, type: "video/webm" })).toBeNull();
  });

  it("accepts a file whose type the browser did not report, and leaves the server to read its bytes", () => {
    expect(videoFileProblem({ size: 1000, type: "" })).toBeNull();
  });

  it("refuses a file over 50 MB with the size message", () => {
    expect(videoFileProblem({ size: VIDEO_MAX_UPLOAD_BYTES + 1, type: "video/mp4" })).toBe(VIDEO_TOO_LARGE_MESSAGE);
  });

  it("refuses an empty file, and a type that is plainly not a video", () => {
    expect(videoFileProblem({ size: 0, type: "video/mp4" })).toBe("That file is empty. Please choose a video.");
    expect(videoFileProblem({ size: 1000, type: "image/jpeg" })).toBe("That isn't a video. Please upload an MP4, MOV or WebM video.");
    expect(videoFileProblem({ size: 1000, type: "application/pdf" })).toBe("That isn't a video. Please upload an MP4, MOV or WebM video.");
  });
});

describe("videoLengthProblem", () => {
  it("says nothing for a clip within 16 seconds and its margin, or when the browser could not tell", () => {
    expect(videoLengthProblem(12)).toBeNull();
    expect(videoLengthProblem(16.4)).toBeNull();
    expect(videoLengthProblem(null)).toBeNull();
  });

  it("names the length of a clip that is too long", () => {
    expect(videoLengthProblem(23.4)).toBe("That video is 23 seconds. The limit is 16 seconds.");
  });
});

describe("messageForVideoResponse", () => {
  it("shows the server's own words when it sent some", () => {
    expect(messageForVideoResponse(422, { error: "That video is 20 seconds. The limit is 16 seconds." })).toBe(
      "That video is 20 seconds. The limit is 16 seconds.",
    );
    expect(messageForVideoResponse(403, { error: "Videos are part of Premium. Upgrade to add yours." })).toBe(
      "Videos are part of Premium. Upgrade to add yours.",
    );
  });

  it("falls back to the size message for a 413 with no words, such as a proxy's own page", () => {
    expect(messageForVideoResponse(413, null)).toBe(VIDEO_TOO_LARGE_MESSAGE);
  });

  it("falls back to a reload message for anything else, and ignores an empty or odd error", () => {
    const reload = "Something went wrong with that upload. Reload the page and try again.";
    expect(messageForVideoResponse(500, null)).toBe(reload);
    expect(messageForVideoResponse(502, "<html>Bad gateway</html>")).toBe(reload);
    expect(messageForVideoResponse(500, { error: "" })).toBe(reload);
    expect(messageForVideoResponse(500, { error: 7 })).toBe(reload);
  });
});

const LINK = "https://global.upload.vimeo.com/files/abc";
const VIDEO = { id: "0192f3c4-2222-7000-8000-000000000002", slot: 2, status: "pending" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("requestVideoUpload", () => {
  it("asks our server for an upload of this size in this slot, as JSON from the dashboard", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(201, { video: VIDEO, uploadLink: LINK }));
    expect(await requestVideoUpload(2, 20_000_000, fetchImpl)).toEqual({ ok: true, video: VIDEO, uploadLink: LINK });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/listing-videos");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ slot: 2, size: 20_000_000 });
  });

  it("shows the server's own words when it refuses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(403, { error: "Videos are part of Premium. Upgrade to add yours." }));
    expect(await requestVideoUpload(1, 1000, fetchImpl)).toEqual({ ok: false, message: "Videos are part of Premium. Upgrade to add yours." });
  });

  it("says the connection failed when the request cannot be sent", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await requestVideoUpload(1, 1000, fetchImpl)).toEqual({ ok: false, message: "We couldn't upload that video. Check your connection and try again." });
  });

  it("will not send a file anywhere but Vimeo's upload servers, whatever the answer says", async () => {
    for (const uploadLink of ["https://evil.example.com/files/abc", "http://global.upload.vimeo.com/files/abc", "javascript:alert(1)", 5, undefined]) {
      const fetchImpl = vi.fn().mockResolvedValue(json(201, { video: VIDEO, uploadLink }));
      const result = await requestVideoUpload(1, 1000, fetchImpl);
      expect(result.ok, String(uploadLink)).toBe(false);
    }
  });
});

/** The parts of XMLHttpRequest the upload uses, as a test can drive them. */
class FakeRequest implements VideoRequest {
  method = "";
  url = "";
  headers: Record<string, string> = {};
  withCredentials = false;
  status = 0;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  timeout = 0;
  body: unknown = null;
  private responseHeaders: Record<string, string> = {};
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  send(body: unknown): void {
    this.body = body;
  }
  reply(status: number, headers: Record<string, string> = {}): void {
    this.status = status;
    this.responseHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    this.onload?.();
  }
}

function file(size: number): File {
  return new File([new Uint8Array(size)], "clip.mp4", { type: "video/mp4" });
}

describe("sendFileToVimeo", () => {
  it("sends the whole file in one tus request, with progress, and no cookies", async () => {
    const fake = new FakeRequest();
    const progress: number[] = [];
    const pending = sendFileToVimeo(LINK, file(1000), (fraction) => progress.push(fraction), () => fake);
    expect(fake.method).toBe("PATCH");
    expect(fake.url).toBe(LINK);
    expect(fake.headers).toEqual({ "Tus-Resumable": "1.0.0", "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream" });
    expect(fake.withCredentials).toBe(false);
    fake.upload.onprogress?.({ lengthComputable: true, loaded: 250, total: 1000 });
    fake.upload.onprogress?.({ lengthComputable: true, loaded: 1000, total: 1000 });
    fake.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
    fake.reply(204, { "Upload-Offset": "1000" });
    expect(await pending).toEqual({ ok: true });
    expect(progress).toEqual([0.25, 1]);
  });

  it("says it did not all arrive when Vimeo has fewer bytes than were sent", async () => {
    const fake = new FakeRequest();
    const pending = sendFileToVimeo(LINK, file(1000), () => undefined, () => fake);
    fake.reply(204, { "Upload-Offset": "400" });
    expect(await pending).toMatchObject({ ok: false });
  });

  it("fails on a refusal, a dropped connection and a timeout", async () => {
    for (const trigger of [(f: FakeRequest) => f.reply(409), (f: FakeRequest) => f.onerror?.(), (f: FakeRequest) => f.ontimeout?.(), (f: FakeRequest) => f.onabort?.()]) {
      const fake = new FakeRequest();
      const pending = sendFileToVimeo(LINK, file(10), () => undefined, () => fake);
      trigger(fake);
      expect(await pending).toMatchObject({ ok: false, message: "We couldn't upload that video. Check your connection and try again." });
    }
  });
});

describe("waitForVideo", () => {
  const instantly = (): Promise<void> => Promise.resolve();
  const options = (fetchImpl: ReturnType<typeof vi.fn>, extra: Partial<WaitOptions> = {}): WaitOptions => ({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: instantly,
    intervalMs: 3000,
    timeoutMs: 60_000,
    ...extra,
  });

  it("asks every few seconds, reports where it stands, and stops when the video is live", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, { state: "uploading" }))
      .mockResolvedValueOnce(json(200, { state: "preparing" }))
      .mockResolvedValueOnce(json(200, { state: "live", video: { ...VIDEO, status: "approved" } }));
    const seen: WaitState[] = [];
    expect(await waitForVideo(VIDEO.id, (state) => seen.push(state), options(fetchImpl))).toEqual({ ok: true });
    expect(seen).toEqual(["uploading", "preparing"]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/listing-videos/${VIDEO.id}/finish`);
    expect(init.method).toBe("POST");
  });

  it("stops with the owner's words when the video was given up", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(422, { error: "That video is 23 seconds. The limit is 16 seconds." }));
    expect(await waitForVideo(VIDEO.id, () => undefined, options(fetchImpl))).toEqual({ ok: false, message: "That video is 23 seconds. The limit is 16 seconds." });
  });

  it("counts an upload that is no longer waiting as done: it went live in another tab", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(404, { error: "That upload isn't waiting any more." }));
    expect(await waitForVideo(VIDEO.id, () => undefined, options(fetchImpl))).toEqual({ ok: true });
  });

  it("keeps asking through a hiccup: a 502, a dropped connection", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(502, { error: "Trying again…" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json(200, { state: "live", video: VIDEO }));
    expect(await waitForVideo(VIDEO.id, () => undefined, options(fetchImpl))).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up waiting after the time limit, and says the video will show when it is ready", async () => {
    let now = 0;
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { state: "preparing" }));
    const result = await waitForVideo(VIDEO.id, () => undefined, {
      ...options(fetchImpl, { timeoutMs: 10_000 }),
      now: () => now,
      sleep: () => {
        now += 4000;
        return Promise.resolve();
      },
    });
    expect(result).toEqual({ ok: false, message: "This is taking longer than usual. Reload the page in a few minutes: it will show once it's ready." });
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
