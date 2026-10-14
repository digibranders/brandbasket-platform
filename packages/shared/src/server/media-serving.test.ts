import {
  findMediaAsset,
  findMediaForStaff,
  withTenantScope,
  type Database,
  type MediaAsset,
  type ScopedTransaction,
} from "@fynix/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../lib/access";
import {
  matchesIfNoneMatch,
  mediaEtag,
  serveStaffMedia,
  serveTenantMedia,
  storedPictureResponse,
} from "./media-serving";
import type { MediaStorage } from "./media-storage";

// The database is a test double: row-level security itself is proven in packages/db's integration tests. What is
// checked here is that the lookup goes through the tenant scope, and what the response does with each outcome.
vi.mock("server-only", () => ({}));
vi.mock("@fynix/db", () => ({ findMediaAsset: vi.fn(), findMediaForStaff: vi.fn(), withTenantScope: vi.fn() }));

const mockedFind = vi.mocked(findMediaAsset);
const mockedStaffFind = vi.mocked(findMediaForStaff);
const mockedScope = vi.mocked(withTenantScope);

const appDb = { name: "app-db" } as unknown as Database;
const scopedTx = { name: "scoped-tx" } as unknown as ScopedTransaction;
const tenant: TenantContext = {
  userId: "user-a",
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  businessName: "Riverside Plumbing",
  role: "owner",
};
const MEDIA_ID = "0192f3c4-2222-7000-8000-000000000002";

const asset: MediaAsset = {
  id: MEDIA_ID,
  businessId: tenant.businessId,
  purpose: "photo",
  storageKey: `t/${tenant.businessId}/${MEDIA_ID}/display`,
  originalFilename: "secret-plans.jpg",
  mimeType: "image/webp",
  bytes: 3,
  width: 1,
  height: 1,
  sha256: "0".repeat(64),
  altText: null,
  status: "ready",
  uploadedByUserId: "user-a",
  createdAt: new Date("2026-09-16T00:00:00Z"),
};

function storageWith(stored: Awaited<ReturnType<MediaStorage["get"]>>): MediaStorage & { get: ReturnType<typeof vi.fn> } {
  return { get: vi.fn().mockResolvedValue(stored), put: vi.fn(), delete: vi.fn() };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedScope.mockImplementation(async (_db, _scope, work) => work(scopedTx));
});

describe("serveTenantMedia", () => {
  it("looks the asset up inside the session's tenant scope on the app connection", async () => {
    mockedFind.mockResolvedValue(null);
    await serveTenantMedia(appDb, storageWith(null), tenant, MEDIA_ID, null);

    expect(mockedScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(mockedFind).toHaveBeenCalledWith(scopedTx, MEDIA_ID);
  });

  it("returns 404 without touching storage when the tenant cannot see the asset", async () => {
    mockedFind.mockResolvedValue(null);
    const storage = storageWith({ bytes: new Uint8Array([1]), contentType: "image/webp" });

    const response = await serveTenantMedia(appDb, storage, tenant, MEDIA_ID, null);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("returns 404 when the row exists but the file does not", async () => {
    mockedFind.mockResolvedValue(asset);
    const response = await serveTenantMedia(appDb, storageWith(null), tenant, MEDIA_ID, null);
    expect(response.status).toBe(404);
  });

  it("serves the bytes with the row's type, revalidated private caching, its ETag and nosniff, never the filename", async () => {
    mockedFind.mockResolvedValue(asset);
    const storage = storageWith({ bytes: new Uint8Array([7, 8, 9]), contentType: "text/html" });

    const response = await serveTenantMedia(appDb, storage, tenant, MEDIA_ID, null);

    expect(storage.get).toHaveBeenCalledWith(asset.storageKey);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
    expect(Object.fromEntries(response.headers)).toEqual({
      "cache-control": "private, no-cache",
      "content-disposition": "inline",
      "content-length": "3",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-type": "image/webp",
      "cross-origin-resource-policy": "same-origin",
      etag: `"${"0".repeat(64)}"`,
      "x-content-type-options": "nosniff",
    });
  });

  it("answers 304 with no body and no storage read when the browser holds this file", async () => {
    mockedFind.mockResolvedValue(asset);
    const storage = storageWith({ bytes: new Uint8Array([7, 8, 9]), contentType: "image/webp" });

    const response = await serveTenantMedia(appDb, storage, tenant, MEDIA_ID, mediaEtag(asset.sha256));

    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(storage.get).not.toHaveBeenCalled();
    expect(Object.fromEntries(response.headers)).toEqual({
      "cache-control": "private, no-cache",
      "cross-origin-resource-policy": "same-origin",
      etag: `"${"0".repeat(64)}"`,
      "x-content-type-options": "nosniff",
    });
  });

  it("serves the file again when the browser holds a different version", async () => {
    mockedFind.mockResolvedValue(asset);
    const storage = storageWith({ bytes: new Uint8Array([7]), contentType: "image/webp" });

    const response = await serveTenantMedia(appDb, storage, tenant, MEDIA_ID, `"${"f".repeat(64)}"`);

    expect(response.status).toBe(200);
    expect(storage.get).toHaveBeenCalledOnce();
  });

  it("never answers 304 for an asset the tenant cannot see", async () => {
    mockedFind.mockResolvedValue(null);
    const response = await serveTenantMedia(appDb, storageWith(null), tenant, MEDIA_ID, "*");
    expect(response.status).toBe(404);
  });
});

describe("serveStaffMedia", () => {
  const staffDb = { name: "staff-db" } as unknown as Database;

  it("looks the asset up on the staff connection, with no tenant scope", async () => {
    mockedStaffFind.mockResolvedValue(null);
    await serveStaffMedia(staffDb, storageWith(null), MEDIA_ID, null);

    expect(mockedStaffFind).toHaveBeenCalledWith(staffDb, MEDIA_ID);
    expect(mockedScope).not.toHaveBeenCalled();
  });

  it("returns 404 without touching storage for an unknown asset", async () => {
    mockedStaffFind.mockResolvedValue(null);
    const storage = storageWith({ bytes: new Uint8Array([1]), contentType: "image/webp" });

    const response = await serveStaffMedia(staffDb, storage, MEDIA_ID, null);

    expect(response.status).toBe(404);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("answers 304 without a storage read when staff already hold the file", async () => {
    mockedStaffFind.mockResolvedValue({ storageKey: asset.storageKey, mimeType: "image/webp", sha256: asset.sha256 });
    const storage = storageWith({ bytes: new Uint8Array([4, 5]), contentType: "image/webp" });

    const response = await serveStaffMedia(staffDb, storage, MEDIA_ID, `W/${mediaEtag(asset.sha256)}`);

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(mediaEtag(asset.sha256));
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("serves the file with the same locked-down headers as the customer route", async () => {
    mockedStaffFind.mockResolvedValue({ storageKey: asset.storageKey, mimeType: "image/webp", sha256: asset.sha256 });
    const storage = storageWith({ bytes: new Uint8Array([4, 5]), contentType: "text/html" });

    const response = await serveStaffMedia(staffDb, storage, MEDIA_ID, null);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("etag")).toBe(mediaEtag(asset.sha256));
  });
});

describe("matchesIfNoneMatch", () => {
  const etag = mediaEtag("a".repeat(64));

  it("matches the tag, a weak copy of it, a list holding it, and *", () => {
    expect(matchesIfNoneMatch(etag, etag)).toBe(true);
    expect(matchesIfNoneMatch(`W/${etag}`, etag)).toBe(true);
    expect(matchesIfNoneMatch(`"other", ${etag}`, etag)).toBe(true);
    expect(matchesIfNoneMatch(" * ", etag)).toBe(true);
  });

  it("does not match a missing header, another tag, or the checksum without quotes", () => {
    expect(matchesIfNoneMatch(null, etag)).toBe(false);
    expect(matchesIfNoneMatch("", etag)).toBe(false);
    expect(matchesIfNoneMatch(`"${"b".repeat(64)}"`, etag)).toBe(false);
    expect(matchesIfNoneMatch("a".repeat(64), etag)).toBe(false);
  });
});

describe("storedPictureResponse", () => {
  const picture = { storageKey: asset.storageKey, mimeType: "image/webp", sha256: "a".repeat(64) };
  const copyKey = `t/${tenant.businessId}/${MEDIA_ID}/w320`;

  function storageByKey(files: Record<string, number[]>): MediaStorage & { get: ReturnType<typeof vi.fn> } {
    return {
      get: vi.fn(async (key: string) => (files[key] === undefined ? null : { bytes: new Uint8Array(files[key]), contentType: "image/webp" })),
      put: vi.fn(),
      delete: vi.fn(),
    };
  }

  it("sends the picture itself when no width is asked for", async () => {
    const storage = storageByKey({ [picture.storageKey]: [1, 2, 3, 4] });
    const response = await storedPictureResponse(storage, picture, null, null);
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe(mediaEtag(picture.sha256));
    expect(storage.get).toHaveBeenCalledWith(picture.storageKey);
  });

  it("sends the smaller copy, with its own ETag, when there is one", async () => {
    const storage = storageByKey({ [picture.storageKey]: [1, 2, 3, 4], [copyKey]: [9, 9] });
    const response = await storedPictureResponse(storage, picture, null, 320);
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([9, 9]);
    expect(response.headers.get("ETag")).toBe(mediaEtag(`${picture.sha256}-w320`));
    expect(response.headers.get("ETag")).not.toBe(mediaEtag(picture.sha256));
    expect(response.headers.get("Content-Length")).toBe("2");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("falls back to the picture itself when the copy was never made", async () => {
    const storage = storageByKey({ [picture.storageKey]: [1, 2, 3, 4] });
    const response = await storedPictureResponse(storage, picture, null, 640);
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect(response.headers.get("ETag")).toBe(mediaEtag(picture.sha256));
  });

  it("answers 304 for the copy without reading storage when the browser holds it", async () => {
    const storage = storageByKey({ [copyKey]: [9, 9] });
    const response = await storedPictureResponse(storage, picture, mediaEtag(`${picture.sha256}-w320`), 320);
    expect(response.status).toBe(304);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("does not take the picture's ETag for the copy's", async () => {
    const storage = storageByKey({ [picture.storageKey]: [1, 2, 3, 4], [copyKey]: [9, 9] });
    const response = await storedPictureResponse(storage, picture, mediaEtag(picture.sha256), 320);
    expect(response.status).toBe(200);
  });

  it("answers 404 when neither the copy nor the picture is stored", async () => {
    const response = await storedPictureResponse(storageByKey({}), picture, null, 320);
    expect(response.status).toBe(404);
  });

  it("serves the picture when its key is not a display key", async () => {
    const odd = { ...picture, storageKey: "t/short/key" };
    const storage = storageByKey({ "t/short/key": [5] });
    expect((await storedPictureResponse(storage, odd, null, 320)).status).toBe(200);
  });
});
