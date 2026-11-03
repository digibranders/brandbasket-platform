// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleBlogUpload, IMAGE_TYPE_MESSAGE, readImageTarget, TARGET_GONE_MESSAGE, type BlogUploadDeps } from "./media";

const ORIGIN = "https://app.brandbasket.in";
const TENANT = { businessId: "0192f3c4-1111-7000-8000-000000000001" } as never;
/** A PNG's signature and a few bytes: what detectImageType reads. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function request(query: string, overrides: { readonly origin?: string; readonly type?: string; readonly body?: Uint8Array } = {}): Request {
  const bytes = overrides.body ?? PNG_BYTES;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes.byteLength > 0) controller.enqueue(bytes);
      controller.close();
    },
  });
  const headers = new Headers({ "content-type": overrides.type ?? "image/png", "x-file-name": "cover.png" });
  headers.set("host", "app.brandbasket.in");
  headers.set("origin", overrides.origin ?? ORIGIN);
  headers.set("content-length", String(bytes.byteLength));
  // Node needs `duplex` to send a streamed body; the DOM typings used by this project do not know the option yet.
  const init: RequestInit & { readonly duplex: "half" } = { method: "POST", headers, body, duplex: "half" };
  return new Request(`${ORIGIN}/website/blog/media${query}`, init);
}

function deps(overrides: Partial<BlogUploadDeps> = {}): BlogUploadDeps {
  return { getTenant: vi.fn(async () => TENANT), appOrigin: ORIGIN, anyLocalHost: false, ownsTarget: vi.fn(async () => true), consumeAllowance: vi.fn(async () => ({ allowed: true }) as const), store: vi.fn(async () => undefined), ...overrides };
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: string }).error;
}

describe("readImageTarget", () => {
  it("reads one post or one author, and nothing else", () => {
    expect(readImageTarget(new URL(`${ORIGIN}/x?post=7`))).toEqual({ kind: "post", id: "7" });
    expect(readImageTarget(new URL(`${ORIGIN}/x?author=3`))).toEqual({ kind: "author", id: "3" });
    expect(readImageTarget(new URL(`${ORIGIN}/x?post=7&author=3`))).toBeNull();
    expect(readImageTarget(new URL(`${ORIGIN}/x?post=abc`))).toBeNull();
    expect(readImageTarget(new URL(`${ORIGIN}/x`))).toBeNull();
  });
});

describe("handleBlogUpload", () => {
  it("refuses an upload from another origin before anything else", async () => {
    const given = deps();
    expect((await handleBlogUpload(request("?post=7", { origin: "https://evil.test" }), given)).status).toBe(403);
    expect(given.getTenant).not.toHaveBeenCalled();
  });

  it("refuses a request that names no post or author", async () => {
    expect((await handleBlogUpload(request(""), deps())).status).toBe(400);
  });

  it("answers 401 when signed out, and passes the guard's own refusal through", async () => {
    expect((await handleBlogUpload(request("?post=7"), deps({ getTenant: async () => null }))).status).toBe(401);
    const refusal = Response.json({ error: "Only the owner or an editor can add images." }, { status: 403 });
    expect(await handleBlogUpload(request("?post=7"), deps({ getTenant: async () => refusal }))).toBe(refusal);
  });

  it("takes JPEG, PNG and WebP only", async () => {
    const response = await handleBlogUpload(request("?post=7", { type: "image/svg+xml" }), deps());
    expect(response.status).toBe(415);
    expect(await errorOf(response)).toBe(IMAGE_TYPE_MESSAGE);
  });

  it("stores nothing for a post or author that is not the business's own", async () => {
    const given = deps({ ownsTarget: async () => false });
    const response = await handleBlogUpload(request("?author=3"), given);
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe(TARGET_GONE_MESSAGE);
    expect(given.store).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    expect((await handleBlogUpload(request("?post=7", { body: new Uint8Array() }), deps())).status).toBe(422);
  });

  it("stores the image for the session's business and its target", async () => {
    const given = deps();
    const response = await handleBlogUpload(request("?post=7"), given);
    expect(response.status).toBe(201);
    expect(given.store).toHaveBeenCalledWith(TENANT, { kind: "post", id: "7" }, expect.objectContaining({ mimeType: "image/png", filename: "cover.png" }));
    expect(given.consumeAllowance).toHaveBeenCalledWith(TENANT);
  });

  it("judges the type by the file's own bytes, not the Content-Type it was sent with", async () => {
    const given = deps();
    const disguised = await handleBlogUpload(request("?post=7", { body: new TextEncoder().encode("<svg onload=alert(1)>") }), given);
    expect(disguised.status).toBe(415);
    expect(await errorOf(disguised)).toBe(IMAGE_TYPE_MESSAGE);
    expect(given.store).not.toHaveBeenCalled();
    // A PNG sent as a JPEG is stored as what it is.
    await handleBlogUpload(request("?post=7", { type: "image/jpeg" }), given);
    expect(given.store).toHaveBeenCalledWith(TENANT, { kind: "post", id: "7" }, expect.objectContaining({ mimeType: "image/png" }));
  });

  it("spends the business's hourly upload budget and refuses with Retry-After when it is used up", async () => {
    const message = "You've uploaded a lot of images in the last hour. Try again in 5 minutes.";
    const given = deps({ consumeAllowance: vi.fn(async () => ({ allowed: false, retryAfterSeconds: 300, message }) as const) });
    const response = await handleBlogUpload(request("?post=7"), given);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(await errorOf(response)).toBe(message);
    expect(given.store).not.toHaveBeenCalled();
  });
});
