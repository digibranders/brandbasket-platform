import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@firstfold/db";
import type { TenantContext } from "@firstfold/shared/lib/access";
import { createLocalMediaStorage, mediaStorageKey, type MediaStorage } from "@firstfold/shared/server/media-storage";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));

const PICTURE_ID = "0192f3c4-4444-7000-8000-000000000004";
const OLD_PICTURE_ID = "0192f3c4-5555-7000-8000-000000000005";

const recordDirectoryPicture = vi.fn();
vi.mock("@firstfold/db", () => ({
  findBusinessKind: vi.fn(),
  findClaimForBusiness: vi.fn(),
  listDirectoryPictures: vi.fn(),
  newDirectoryPictureId: () => PICTURE_ID,
  recordDirectoryPicture: (...args: unknown[]) => recordDirectoryPicture(...args),
  removeDirectoryPictures: vi.fn(),
  withTenantScope: vi.fn(),
}));

import { storeListingPicture } from "./listing-pictures";

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const tenant = { businessId: BUSINESS_ID, userId: "user-1" } as unknown as TenantContext;
const NOW = new Date("2026-10-09T10:00:00Z");

let sandbox = "";
let storage: MediaStorage;

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#cc3333" } }).png().toBuffer());
}

function recordedAs(replacedStorageKeys: readonly string[] = []): void {
  recordDirectoryPicture.mockResolvedValue({
    kind: "recorded",
    picture: { id: PICTURE_ID, slot: "ad_wide", status: "pending" },
    replacedStorageKeys,
  });
}

beforeEach(async () => {
  recordDirectoryPicture.mockReset();
  sandbox = await mkdtemp(path.join(tmpdir(), "firstfold-listing-pictures-"));
  storage = createLocalMediaStorage(sandbox);
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("storeListingPicture: smaller copies", () => {
  it("stores the picture and its 320 and 640 px copies for a 960 px slot", async () => {
    recordedAs();
    const outcome = await storeListingPicture({ staffDb: {} as Database, storage }, tenant, "ad_wide", await png(1200, 800), NOW);

    expect(outcome.ok).toBe(true);
    const display = await storage.get(mediaStorageKey(BUSINESS_ID, PICTURE_ID, "display"));
    const small = await storage.get(mediaStorageKey(BUSINESS_ID, PICTURE_ID, "w320"));
    const medium = await storage.get(mediaStorageKey(BUSINESS_ID, PICTURE_ID, "w640"));
    expect(display).not.toBeNull();
    expect(await sharp(small?.bytes).metadata()).toMatchObject({ format: "webp", width: 320, height: 200 });
    expect(await sharp(medium?.bytes).metadata()).toMatchObject({ format: "webp", width: 640, height: 400 });
    expect(small?.contentType).toBe("image/webp");
  });

  it("makes only the 320 px copy for the 640 px listing photo", async () => {
    recordedAs();
    await storeListingPicture({ staffDb: {} as Database, storage }, tenant, "listing", await png(900, 900), NOW);

    expect(await storage.get(mediaStorageKey(BUSINESS_ID, PICTURE_ID, "w320"))).not.toBeNull();
    expect(await storage.get(mediaStorageKey(BUSINESS_ID, PICTURE_ID, "w640"))).toBeNull();
  });

  it("still stores the picture when a copy cannot be written", async () => {
    recordedAs();
    const failing: MediaStorage = {
      ...storage,
      put: async (key, bytes, contentType) => {
        if (key.endsWith("/w320")) throw new Error("bucket unavailable");
        await storage.put(key, bytes, contentType);
      },
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const outcome = await storeListingPicture({ staffDb: {} as Database, storage: failing }, tenant, "ad_wide", await png(1200, 800), NOW);

    expect(outcome.ok).toBe(true);
    expect(await storage.get(mediaStorageKey(BUSINESS_ID, PICTURE_ID, "display"))).not.toBeNull();
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("writes no copies, and keeps no file, when the business has no listing", async () => {
    recordDirectoryPicture.mockResolvedValue({ kind: "no-claim" });
    const outcome = await storeListingPicture({ staffDb: {} as Database, storage }, tenant, "ad_wide", await png(1200, 800), NOW);

    expect(outcome.ok).toBe(false);
    for (const variant of ["display", "w320", "w640"] as const) {
      expect(await storage.get(mediaStorageKey(BUSINESS_ID, PICTURE_ID, variant))).toBeNull();
    }
  });

  it("deletes the replaced picture together with its copies", async () => {
    const oldKeys = (["display", "w320", "w640"] as const).map((variant) => mediaStorageKey(BUSINESS_ID, OLD_PICTURE_ID, variant));
    for (const key of oldKeys) await storage.put(key, new Uint8Array([1]), "image/webp");
    recordedAs([oldKeys[0] as string]);

    await storeListingPicture({ staffDb: {} as Database, storage }, tenant, "ad_wide", await png(1200, 800), NOW);

    for (const key of oldKeys) expect(await storage.get(key)).toBeNull();
    expect(await storage.get(mediaStorageKey(BUSINESS_ID, PICTURE_ID, "display"))).not.toBeNull();
  });
});
