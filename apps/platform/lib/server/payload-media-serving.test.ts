import { readFile } from "node:fs/promises";
import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { servePayloadMediaFile } from "./payload-media-serving";

/*
 * Covers the second spec-review fix, 2026-09-18 (see collections/Media.ts's doc comment): Payload's own REST file
 * route can no longer be used at all, since `Media.access.read` now denies every request unconditionally —
 * including one from our own server code, since that route has no `overrideAccess` equivalent. This function
 * replaces it: real authorization (the businessId check) plus a direct disk read, both exercised here for real —
 * only Payload's Local API and the filesystem are doubles.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

const { findByID } = vi.hoisted(() => ({ findByID: vi.fn() }));

vi.mock("payload", () => ({ getPayload: vi.fn(async () => ({ findByID, collections })) }));

const mockedReadFile = vi.mocked(readFile);
const mockedGetPayload = vi.mocked(getPayload);

const STATIC_DIR = "/tmp/fynix-test-media";
const collections = { media: { config: { upload: { staticDir: STATIC_DIR } } } };

const BUSINESS_A = "0192f3c4-aaaa-7000-8000-00000000000a";
const BUSINESS_B = "0192f3c4-bbbb-7000-8000-00000000000b";

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetPayload.mockResolvedValue({ findByID, collections } as never);
});

describe("servePayloadMediaFile", () => {
  it("serves the file when allowedBusinessId matches the document's own businessId", async () => {
    findByID.mockResolvedValue({ filename: "photo.png", mimeType: "image/png", businessId: BUSINESS_A });
    mockedReadFile.mockResolvedValue(Buffer.from("fake-bytes"));

    const response = await servePayloadMediaFile("5", BUSINESS_A);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(await response.text()).toBe("fake-bytes");
    expect(mockedReadFile).toHaveBeenCalledWith(`${STATIC_DIR}/photo.png`);
  });

  it("serves the file unscoped when allowedBusinessId is null (staff)", async () => {
    findByID.mockResolvedValue({ filename: "photo.png", mimeType: "image/png", businessId: BUSINESS_B });
    mockedReadFile.mockResolvedValue(Buffer.from("fake-bytes"));

    const response = await servePayloadMediaFile("5", null);

    expect(response.status).toBe(200);
  });

  it("refuses with a bare 404 when the document belongs to a different business", async () => {
    findByID.mockResolvedValue({ filename: "photo.png", mimeType: "image/png", businessId: BUSINESS_B });

    const response = await servePayloadMediaFile("5", BUSINESS_A);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mockedReadFile).not.toHaveBeenCalled();
  });

  it("refuses with a bare 404 when the media id does not resolve at all", async () => {
    findByID.mockRejectedValue(new Error("not found"));

    const response = await servePayloadMediaFile("does-not-exist", BUSINESS_A);

    expect(response.status).toBe(404);
    expect(mockedReadFile).not.toHaveBeenCalled();
  });

  it("refuses with a bare 404 when the file is missing on disk", async () => {
    findByID.mockResolvedValue({ filename: "photo.png", mimeType: "image/png", businessId: BUSINESS_A });
    mockedReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const response = await servePayloadMediaFile("5", BUSINESS_A);

    expect(response.status).toBe(404);
  });

  it("refuses a filename that would resolve outside the storage root", async () => {
    findByID.mockResolvedValue({ filename: "../../etc/passwd", mimeType: "image/png", businessId: BUSINESS_A });

    const response = await servePayloadMediaFile("5", BUSINESS_A);

    expect(response.status).toBe(404);
    expect(mockedReadFile).not.toHaveBeenCalled();
  });
});

describe("servePayloadMediaFile for published website content", () => {
  it("lets any origin embed and cache it, unlike the private default", async () => {
    findByID.mockResolvedValue({ filename: "photo.png", mimeType: "image/png", businessId: BUSINESS_A });
    mockedReadFile.mockResolvedValue(Buffer.from("fake-bytes"));

    const publicResponse = await servePayloadMediaFile("5", null, { sharing: "public" });
    const privateResponse = await servePayloadMediaFile("5", null);

    expect(publicResponse.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(publicResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(publicResponse.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(privateResponse.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(privateResponse.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("keeps a draft's image out of every shared cache while letting its author's website show it", async () => {
    findByID.mockResolvedValue({ filename: "photo.png", mimeType: "image/png", businessId: BUSINESS_A });
    mockedReadFile.mockResolvedValue(Buffer.from("fake-bytes"));

    const response = await servePayloadMediaFile("5", BUSINESS_A, { sharing: "preview" });

    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
