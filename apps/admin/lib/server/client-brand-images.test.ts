import { PhotoLimitReachedError, recordBrandAssetForStaff, type Database } from "@brandbasket/db";
import type { MediaStorage } from "@brandbasket/shared/server/media-storage";
import { processUpload, UploadRejectedError } from "@brandbasket/shared/server/media-upload";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_PHOTO_LIMIT_MESSAGE, storeClientBrandImage } from "./client-brand-images";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, recordBrandAssetForStaff: vi.fn() };
});
vi.mock("@brandbasket/shared/server/media-upload", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/shared/server/media-upload")>("@brandbasket/shared/server/media-upload");
  return { ...actual, processUpload: vi.fn() };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const DB = {} as Database;
const PROCESSED = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/webp" as const,
  width: 640,
  height: 480,
  byteLength: 3,
  sha256: "ab".repeat(32),
  sourceType: "image/jpeg" as const,
};

const put = vi.fn();
const remove = vi.fn();
const storage = { put, delete: remove } as unknown as MediaStorage;

function input(purpose: "logo" | "photo" = "photo") {
  return { businessId: BUSINESS, staffUserId: "staff-1", purpose, filename: "front.jpg", bytes: new Uint8Array([9]) };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(processUpload).mockResolvedValue(PROCESSED);
});

describe("storeClientBrandImage", () => {
  it("stores the re-encoded image under the business, records it for staff and returns its id", async () => {
    vi.mocked(recordBrandAssetForStaff).mockResolvedValue({ asset: {} as never, replacedStorageKeys: [] });

    const outcome = await storeClientBrandImage({ db: DB, storage }, input());

    expect(outcome.ok).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    const [key, bytes, mime] = put.mock.calls[0] as [string, Uint8Array, string];
    expect(key).toContain(BUSINESS);
    expect(bytes).toBe(PROCESSED.bytes);
    expect(mime).toBe("image/webp");
    expect(recordBrandAssetForStaff).toHaveBeenCalledWith(
      DB,
      BUSINESS,
      expect.objectContaining({ purpose: "photo", storageKey: key, originalFilename: "front.jpg", uploadedByUserId: "staff-1", altText: null, sha256: PROCESSED.sha256 }),
      { maxPhotos: 20 },
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes the files of a logo it replaced, once the row is recorded", async () => {
    vi.mocked(recordBrandAssetForStaff).mockResolvedValue({ asset: {} as never, replacedStorageKeys: ["old/logo-display.webp"] });

    await storeClientBrandImage({ db: DB, storage }, input("logo"));

    expect(remove).toHaveBeenCalledWith("old/logo-display.webp");
  });

  it("answers an image that cannot be used with its status and message, and stores nothing", async () => {
    vi.mocked(processUpload).mockRejectedValue(new UploadRejectedError("unsupported-type", "That file isn't an image we can use."));

    expect(await storeClientBrandImage({ db: DB, storage }, input())).toEqual({ ok: false, status: 415, message: "That file isn't an image we can use." });
    expect(put).not.toHaveBeenCalled();
    expect(recordBrandAssetForStaff).not.toHaveBeenCalled();
  });

  it("passes on how long to wait when the server is too busy to decode", async () => {
    vi.mocked(processUpload).mockRejectedValue(new UploadRejectedError("busy", "Busy.", 10));

    expect(await storeClientBrandImage({ db: DB, storage }, input())).toEqual({ ok: false, status: 503, message: "Busy.", retryAfterSeconds: 10 });
  });

  it("refuses a photo over the limit and deletes the file it had written", async () => {
    vi.mocked(recordBrandAssetForStaff).mockRejectedValue(new PhotoLimitReachedError(20));

    expect(await storeClientBrandImage({ db: DB, storage }, input())).toEqual({ ok: false, status: 409, message: CLIENT_PHOTO_LIMIT_MESSAGE });
    expect(remove).toHaveBeenCalledWith(put.mock.calls[0]?.[0]);
  });

  it("deletes the file and rethrows when recording fails for any other reason", async () => {
    vi.mocked(recordBrandAssetForStaff).mockRejectedValue(new Error("connection lost"));

    await expect(storeClientBrandImage({ db: DB, storage }, input())).rejects.toThrow("connection lost");
    expect(remove).toHaveBeenCalledWith(put.mock.calls[0]?.[0]);
  });
});
