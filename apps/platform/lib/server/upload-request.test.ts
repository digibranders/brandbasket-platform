import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { ONBOARDING_LOCKED_MESSAGE } from "@/lib/onboarding/form-state";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";
import type { UploadOutcome } from "./onboarding-media";
import { handleUploadRequest, type UploadRequestDeps } from "./upload-request";

vi.mock("server-only", () => ({}));

const APP_ORIGIN = "http://app.localhost:3000";
const APP_HOST = "app.localhost:3000";
const UPLOAD_URL = `${APP_ORIGIN}/api/uploads?purpose=photo`;
const TOO_LARGE = "That file is larger than 4 MB. Please upload a smaller image.";
const WRONG_HOST = "Uploads only work from your Fynix dashboard. Open it and try again.";
const WRONG_ORIGIN = "That upload didn't come from your dashboard. Reload the page and try again.";
const SIGNED_OUT = "Your session has ended. Sign in again, then try the upload.";

const tenant: TenantContext = {
  userId: "user-a",
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  businessName: "Riverside Plumbing",
  role: "owner",
};
const storedAsset = {
  id: "0192f3c4-2222-7000-8000-000000000002",
  purpose: "photo",
  width: 800,
  height: 600,
  altText: null,
  originalFilename: "front desk.jpg",
} as const;

interface TrackedBody {
  readonly stream: ReadableStream<Uint8Array>;
  /** Chunks the handler has pulled from the body. */
  readonly pulled: () => number;
}

/** A body that yields `chunks` one pull at a time, so a test can see how much of it was read. */
function trackedBody(chunks: readonly Uint8Array[]): TrackedBody {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[pulled];
        if (chunk === undefined) {
          controller.close();
          return;
        }
        pulled += 1;
        controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulled: () => pulled };
}

interface UploadRequestOptions {
  readonly url?: string;
  readonly host?: string | null;
  readonly origin?: string | null;
  readonly contentLength?: string | null;
  readonly fileName?: string;
  readonly body?: TrackedBody;
}

function uploadRequest(options: UploadRequestOptions = {}): Request {
  const body = options.body ?? trackedBody([new Uint8Array([1, 2, 3])]);
  const headers = new Headers({ "content-type": "image/webp" });
  const host = options.host === undefined ? APP_HOST : options.host;
  if (host !== null) headers.set("host", host);
  const origin = options.origin === undefined ? APP_ORIGIN : options.origin;
  if (origin !== null) headers.set("origin", origin);
  const contentLength = options.contentLength === undefined ? "3" : options.contentLength;
  if (contentLength !== null) headers.set("content-length", contentLength);
  if (options.fileName !== undefined) headers.set("x-file-name", options.fileName);
  // Node needs `duplex` to send a streamed body; the DOM typings used by this project do not know the option yet.
  const init: RequestInit & { readonly duplex: "half" } = { method: "POST", headers, body: body.stream, duplex: "half" };
  return new Request(options.url ?? UPLOAD_URL, init);
}

let deps: {
  getTenant: ReturnType<typeof vi.fn<UploadRequestDeps["getTenant"]>>;
  appOrigin: string;
  isOnboardingOpen: ReturnType<typeof vi.fn<UploadRequestDeps["isOnboardingOpen"]>>;
  decodeBusy: ReturnType<typeof vi.fn<UploadRequestDeps["decodeBusy"]>>;
  consumeAllowance: ReturnType<typeof vi.fn<UploadRequestDeps["consumeAllowance"]>>;
  store: ReturnType<typeof vi.fn<UploadRequestDeps["store"]>>;
};

beforeEach(() => {
  deps = {
    getTenant: vi.fn<UploadRequestDeps["getTenant"]>().mockResolvedValue(tenant),
    appOrigin: APP_ORIGIN,
    isOnboardingOpen: vi.fn<UploadRequestDeps["isOnboardingOpen"]>().mockResolvedValue(true),
    decodeBusy: vi.fn<UploadRequestDeps["decodeBusy"]>().mockReturnValue(null),
    consumeAllowance: vi.fn<UploadRequestDeps["consumeAllowance"]>().mockResolvedValue({ allowed: true }),
    store: vi
      .fn<UploadRequestDeps["store"]>()
      .mockResolvedValue({ ok: true, asset: storedAsset } satisfies UploadOutcome),
  };
});

async function expectRefused(response: Response, status: number, message?: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body: unknown = await response.json();
  expect(body).toEqual({ error: message ?? expect.any(String) });
}

/**
 * Refused by a check that needs no database: no session lookup, no lock read, no budget spent, no body read, nothing
 * stored. Every dependency but `store` is a database call, and `store` writes to one.
 */
function expectNoDatabaseCall(body: TrackedBody): void {
  expect(deps.getTenant).not.toHaveBeenCalled();
  expectNoWorkAfterSession(body);
}

/** Refused at the session: nothing after it ran. */
function expectNoWorkAfterSession(body: TrackedBody): void {
  expect(deps.isOnboardingOpen).not.toHaveBeenCalled();
  expect(deps.decodeBusy).not.toHaveBeenCalled();
  expect(deps.consumeAllowance).not.toHaveBeenCalled();
  expect(deps.store).not.toHaveBeenCalled();
  expect(body.pulled()).toBe(0);
}

describe("handleUploadRequest", () => {
  it("stores the image and answers 201 with the new asset", async () => {
    const body = trackedBody([new Uint8Array([1, 2]), new Uint8Array([3])]);
    const response = await handleUploadRequest(
      uploadRequest({ body, fileName: encodeURIComponent("C:\\Photos\\front desk.jpg") }),
      deps,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ asset: storedAsset });
    expect(deps.isOnboardingOpen).toHaveBeenCalledWith(tenant);
    expect(deps.consumeAllowance).toHaveBeenCalledWith(tenant);
    expect(deps.store).toHaveBeenCalledWith(tenant, "photo", {
      bytes: new Uint8Array([1, 2, 3]),
      filename: "front desk.jpg",
    });
  });

  it("names an upload with no file name 'upload', and takes the purpose from the query", async () => {
    await handleUploadRequest(uploadRequest({ url: `${APP_ORIGIN}/api/uploads?purpose=logo` }), deps);
    expect(deps.store).toHaveBeenCalledWith(tenant, "logo", expect.objectContaining({ filename: "upload" }));
  });

  it("answers 403 unless the request came to the app host, before touching the database", async () => {
    for (const host of [null, "localhost:3000", "admin.localhost:3000", "evil.example", "app.localhost", "app.localhost:3001", "app.localhost:3000.evil.io"]) {
      const body = trackedBody([new Uint8Array([1])]);
      const response = await handleUploadRequest(uploadRequest({ body, host }), deps);
      await expectRefused(response, 403, WRONG_HOST);
      expectNoDatabaseCall(body);
    }
  });

  it("compares the host as the proxy does: case and a trailing dot do not matter", async () => {
    for (const host of ["APP.localhost:3000", "app.localhost.:3000"]) {
      expect((await handleUploadRequest(uploadRequest({ host }), deps)).status, host).toBe(201);
    }
  });

  it("answers 403 when the Origin is missing or not the app's own, before touching the database", async () => {
    for (const origin of [null, "https://evil.example", "http://localhost:3000", `${APP_ORIGIN}/`, "null"]) {
      const body = trackedBody([new Uint8Array([1])]);
      await expectRefused(await handleUploadRequest(uploadRequest({ body, origin }), deps), 403, WRONG_ORIGIN);
      expectNoDatabaseCall(body);
    }
  });

  it("answers 411 without a Content-Length, and 400 for a malformed one", async () => {
    const missing = trackedBody([new Uint8Array([1])]);
    await expectRefused(await handleUploadRequest(uploadRequest({ body: missing, contentLength: null }), deps), 411);
    expectNoDatabaseCall(missing);

    for (const contentLength of ["-1", "3.5", "abc", "1e9", "9".repeat(20)]) {
      const body = trackedBody([new Uint8Array([1])]);
      await expectRefused(await handleUploadRequest(uploadRequest({ body, contentLength }), deps), 400);
      expectNoDatabaseCall(body);
    }
  });

  it("answers 413 for a declared length over the limit, without reading the body", async () => {
    const body = trackedBody([new Uint8Array([1])]);
    const response = await handleUploadRequest(
      uploadRequest({ body, contentLength: String(MAX_UPLOAD_BYTES + 1) }),
      deps,
    );
    await expectRefused(response, 413, TOO_LARGE);
    expectNoDatabaseCall(body);
  });

  it("answers 413 when the body is larger than its declared length, and stops reading it", async () => {
    const chunkSize = 1024 * 1024;
    const chunks = Array.from({ length: 20 }, () => new Uint8Array(chunkSize));
    const body = trackedBody(chunks);

    const response = await handleUploadRequest(uploadRequest({ body, contentLength: "10" }), deps);

    await expectRefused(response, 413, TOO_LARGE);
    // Stopped on the first chunk past 4 MB, never reading the other 15.
    expect(body.pulled()).toBe(MAX_UPLOAD_BYTES / chunkSize + 1);
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("answers 400 for a missing or unknown purpose", async () => {
    for (const query of ["", "?purpose=", "?purpose=avatar", "?purpose=Photo", "?purpose=photo%00"]) {
      const body = trackedBody([new Uint8Array([1])]);
      const url = `${APP_ORIGIN}/api/uploads${query}`;
      const response = await handleUploadRequest(uploadRequest({ body, url }), deps);
      await expectRefused(response, 400);
      expectNoDatabaseCall(body);
    }
  });

  it("answers 401 without a customer session, once the cheap checks pass, and does nothing more", async () => {
    deps.getTenant.mockResolvedValue(null);
    const body = trackedBody([new Uint8Array([1])]);
    await expectRefused(await handleUploadRequest(uploadRequest({ body }), deps), 401, SIGNED_OUT);
    expect(deps.getTenant).toHaveBeenCalledTimes(1);
    expectNoWorkAfterSession(body);
  });

  it("runs the cheap checks before the session, in order", async () => {
    deps.getTenant.mockResolvedValue(null);
    const cases: readonly [UploadRequestOptions, number, string | undefined][] = [
      [{ host: "evil.example", origin: "https://evil.example", contentLength: null, url: `${APP_ORIGIN}/api/uploads` }, 403, WRONG_HOST],
      [{ origin: "https://evil.example", contentLength: null, url: `${APP_ORIGIN}/api/uploads` }, 403, WRONG_ORIGIN],
      [{ contentLength: null, url: `${APP_ORIGIN}/api/uploads` }, 411, undefined],
      [{ contentLength: String(MAX_UPLOAD_BYTES + 1), url: `${APP_ORIGIN}/api/uploads` }, 413, TOO_LARGE],
      [{ url: `${APP_ORIGIN}/api/uploads` }, 400, undefined],
      [{}, 401, SIGNED_OUT],
    ];
    for (const [options, status, message] of cases) {
      await expectRefused(await handleUploadRequest(uploadRequest(options), deps), status, message);
    }
    expect(deps.getTenant).toHaveBeenCalledTimes(1);
  });

  it("answers 409 once onboarding is sent, without reading the body or spending the budget", async () => {
    deps.isOnboardingOpen.mockResolvedValue(false);
    const body = trackedBody([new Uint8Array([1])]);

    await expectRefused(await handleUploadRequest(uploadRequest({ body }), deps), 409, ONBOARDING_LOCKED_MESSAGE);
    expect(deps.isOnboardingOpen).toHaveBeenCalledWith(tenant);
    expect(deps.consumeAllowance).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
    expect(body.pulled()).toBe(0);
  });

  it("answers 429 with Retry-After once the hourly budget is spent, without reading the body", async () => {
    const message = "You've uploaded a lot of images in the last hour. Try again in 3 minutes.";
    deps.consumeAllowance.mockResolvedValue({ allowed: false, retryAfterSeconds: 125, message });
    const body = trackedBody([new Uint8Array([1])]);

    const response = await handleUploadRequest(uploadRequest({ body }), deps);

    expect(response.headers.get("retry-after")).toBe("125");
    await expectRefused(response, 429, message);
    expect(deps.store).not.toHaveBeenCalled();
    expect(body.pulled()).toBe(0);
  });

  it("passes on the reason an upload was refused, with a matching status", async () => {
    const cases: readonly [UploadOutcome, number][] = [
      [{ ok: false, refusal: "unsupported-type", message: "Not an image we can use." }, 415],
      [{ ok: false, refusal: "unreadable", message: "We couldn't read that image." }, 422],
      [{ ok: false, refusal: "empty", message: "That file is empty." }, 422],
      [{ ok: false, refusal: "too-large", message: TOO_LARGE }, 413],
      [{ ok: false, refusal: "photo-limit", message: "You can add up to 20 photos." }, 409],
      [{ ok: false, refusal: "locked", message: ONBOARDING_LOCKED_MESSAGE }, 409],
    ];
    for (const [outcome, status] of cases) {
      deps.store.mockResolvedValueOnce(outcome);
      const response = await handleUploadRequest(uploadRequest(), deps);
      await expectRefused(response, status, outcome.ok ? undefined : outcome.message);
    }
  });

  it("answers 503 before spending the budget or reading the body when there is no room to decode", async () => {
    const message = "We're handling a lot of uploads right now. Please try that image again in a few seconds.";
    deps.decodeBusy.mockReturnValue({ message, retryAfterSeconds: 10 });
    const body = trackedBody([new Uint8Array([1])]);

    const response = await handleUploadRequest(uploadRequest({ body }), deps);

    expect(response.headers.get("retry-after")).toBe("10");
    await expectRefused(response, 503, message);
    expect(deps.isOnboardingOpen).toHaveBeenCalledWith(tenant);
    expect(deps.consumeAllowance).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
    expect(body.pulled()).toBe(0);
  });

  it("does not check for room to decode once onboarding is sent", async () => {
    deps.isOnboardingOpen.mockResolvedValue(false);
    await expectRefused(await handleUploadRequest(uploadRequest(), deps), 409, ONBOARDING_LOCKED_MESSAGE);
    expect(deps.decodeBusy).not.toHaveBeenCalled();
  });

  it("still answers 503 when the server became too busy after the room check", async () => {
    const message = "We're handling a lot of uploads right now. Please try that image again in a few seconds.";
    deps.store.mockResolvedValue({ ok: false, refusal: "busy", message, retryAfterSeconds: 10 });

    const response = await handleUploadRequest(uploadRequest(), deps);

    expect(response.headers.get("retry-after")).toBe("10");
    await expectRefused(response, 503, message);
  });

  it("sends no Retry-After with a refusal that retrying will not fix", async () => {
    deps.store.mockResolvedValue({ ok: false, refusal: "unreadable", message: "We couldn't read that image." });
    const response = await handleUploadRequest(uploadRequest(), deps);
    expect(response.status).toBe(422);
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("lets an unexpected failure propagate", async () => {
    deps.store.mockRejectedValue(new Error("disk full"));
    await expect(handleUploadRequest(uploadRequest(), deps)).rejects.toThrow("disk full");
  });
});
