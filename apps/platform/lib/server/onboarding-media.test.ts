import {
  consumeRateLimit,
  findOpenProject,
  newMediaAssetId,
  OnboardingLockedError,
  PhotoLimitReachedError,
  recordUploadedMedia,
  softDeleteMediaAsset,
  withTenantScope,
  type Database,
  type MediaAsset,
  type Project,
  type ScopedTransaction,
} from "@firstfold/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@firstfold/shared/lib/access";
import { ONBOARDING_LOCKED_MESSAGE } from "@/lib/onboarding/form-state";
import type { MediaStorage } from "@firstfold/shared/server/media-storage";
import { processUpload, UploadRejectedError, type ProcessedUpload } from "./media-upload";
import {
  consumeUploadAllowance,
  isOnboardingOpen,
  MEDIA_UPLOAD_RATE_LIMIT,
  PHOTO_LIMIT_MESSAGE,
  removeOnboardingImage,
  storeOnboardingImage,
} from "./onboarding-media";

// The database and the image pipeline are test doubles: row-level security, the lock and the photo limit are
// proven in packages/db's integration tests, and processUpload has its own tests. What is checked here is the order
// of the file and row writes, and that no failure leaves one without the other.
vi.mock("server-only", () => ({}));

/** What deleting a picture's file asks of storage: the file and its two possible smaller copies (keysOfPicture). */
function deletesOf(key: string): string[] {
  return [`delete ${key}`, `delete ${key.replace(/display$/, "w320")}`, `delete ${key.replace(/display$/, "w640")}`];
}
vi.mock("@firstfold/db", () => {
  class MockOnboardingLockedError extends Error {}
  class MockPhotoLimitReachedError extends Error {}
  return {
    consumeRateLimit: vi.fn(),
    findOpenProject: vi.fn(),
    newMediaAssetId: vi.fn(),
    OnboardingLockedError: MockOnboardingLockedError,
    PhotoLimitReachedError: MockPhotoLimitReachedError,
    recordUploadedMedia: vi.fn(),
    softDeleteMediaAsset: vi.fn(),
    withTenantScope: vi.fn(),
  };
});
vi.mock("./media-upload", () => {
  class MockUploadRejectedError extends Error {
    constructor(
      readonly reason: string,
      message: string,
      readonly retryAfterSeconds: number | null = null,
    ) {
      super(message);
    }
  }
  return { processUpload: vi.fn(), UploadRejectedError: MockUploadRejectedError };
});

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const NEW_ID = "0192f3c4-2222-7000-8000-000000000002";
const OLD_LOGO_ID = "0192f3c4-3333-7000-8000-000000000003";
const NEW_KEY = `t/${BUSINESS_ID}/${NEW_ID}/display`;
const OLD_KEY = `t/${BUSINESS_ID}/${OLD_LOGO_ID}/display`;

const appDb = { name: "app-db" } as unknown as Database;
const scopedTx = { name: "scoped-tx" } as unknown as ScopedTransaction;
const tenant: TenantContext = {
  userId: "user-a",
  businessId: BUSINESS_ID,
  businessName: "Riverside Plumbing",
  role: "owner",
};

const processed: ProcessedUpload = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/webp",
  width: 800,
  height: 600,
  byteLength: 3,
  sha256: "a".repeat(64),
  sourceType: "image/jpeg",
};
const received = new Uint8Array([9]);

function asset(id: string, purpose: MediaAsset["purpose"]): MediaAsset {
  return {
    id,
    businessId: BUSINESS_ID,
    purpose,
    storageKey: `t/${BUSINESS_ID}/${id}/display`,
    originalFilename: "front desk.jpg",
    mimeType: "image/webp",
    bytes: 3,
    width: 800,
    height: 600,
    sha256: "b".repeat(64),
    altText: null,
    status: "ready",
    uploadedByUserId: "user-a",
    createdAt: new Date("2026-09-16T00:00:00Z"),
  };
}

let events: string[];
let storage: MediaStorage;

function upload(purpose: "logo" | "photo" = "photo", filename = "front desk.jpg") {
  return storeOnboardingImage({ appDb, storage }, tenant, purpose, { bytes: received, filename });
}

beforeEach(() => {
  vi.resetAllMocks();
  events = [];
  storage = {
    put: vi.fn(async (key: string) => {
      events.push(`put ${key}`);
    }),
    get: vi.fn(async () => null),
    delete: vi.fn(async (key: string) => {
      events.push(`delete ${key}`);
    }),
  };
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 59, retryAfterSeconds: 0 });
  vi.mocked(processUpload).mockResolvedValue(processed);
  vi.mocked(newMediaAssetId).mockReturnValue(NEW_ID);
  vi.mocked(recordUploadedMedia).mockImplementation(async (_tx, input) => {
    events.push(`record ${input.id}`);
    return { asset: { ...asset(input.id, input.purpose), storageKey: input.storageKey }, replacedStorageKeys: [] };
  });
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => {
    events.push("begin");
    const result = await work(scopedTx);
    events.push("commit");
    return result;
  });
});

describe("isOnboardingOpen", () => {
  it("is true only while the tenant's open project is in onboarding", async () => {
    vi.mocked(findOpenProject).mockResolvedValue({ status: "onboarding" } as Project);
    await expect(isOnboardingOpen(appDb, tenant)).resolves.toBe(true);
    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, findOpenProject);

    vi.mocked(findOpenProject).mockResolvedValue({ status: "submitted" } as Project);
    await expect(isOnboardingOpen(appDb, tenant)).resolves.toBe(false);

    vi.mocked(findOpenProject).mockResolvedValue(null);
    await expect(isOnboardingOpen(appDb, tenant)).resolves.toBe(false);
  });
});

describe("consumeUploadAllowance", () => {
  it("spends from the business's hourly upload budget", async () => {
    await expect(consumeUploadAllowance(appDb, tenant)).resolves.toEqual({ allowed: true });
    expect(consumeRateLimit).toHaveBeenCalledWith(appDb, `media-upload:business:${BUSINESS_ID}`, MEDIA_UPLOAD_RATE_LIMIT);
    expect(MEDIA_UPLOAD_RATE_LIMIT).toEqual({ limit: 60, windowSeconds: 3600 });
  });

  it("says when to try again once the budget is spent", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 125 });
    await expect(consumeUploadAllowance(appDb, tenant)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 125,
      message: "You've uploaded a lot of images in the last hour. Try again in 3 minutes.",
    });
  });
});

describe("storeOnboardingImage", () => {
  it("stores the file, then records the row under the same id and key, in the tenant scope", async () => {
    await expect(upload()).resolves.toEqual({
      ok: true,
      asset: {
        id: NEW_ID,
        purpose: "photo",
        width: 800,
        height: 600,
        altText: null,
        originalFilename: "front desk.jpg",
      },
    });

    expect(processUpload).toHaveBeenCalledWith(received);
    expect(events).toEqual([`put ${NEW_KEY}`, "begin", `record ${NEW_ID}`, "commit"]);
    expect(storage.put).toHaveBeenCalledWith(NEW_KEY, processed.bytes, "image/webp");
    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(recordUploadedMedia).toHaveBeenCalledWith(
      scopedTx,
      {
        id: NEW_ID,
        purpose: "photo",
        storageKey: NEW_KEY,
        originalFilename: "front desk.jpg",
        mimeType: "image/webp",
        bytes: 3,
        width: 800,
        height: 600,
        sha256: "a".repeat(64),
        altText: null,
        uploadedByUserId: "user-a",
      },
      { maxPhotos: 20 },
    );
  });

  it("shows the reason for a rejected file and stores nothing", async () => {
    vi.mocked(processUpload).mockRejectedValue(new UploadRejectedError("unsupported-type", "Not an image we can use."));

    await expect(upload()).resolves.toEqual({
      ok: false,
      refusal: "unsupported-type",
      message: "Not an image we can use.",
    });
    expect(events).toEqual([]);
  });

  it("passes on when a busy server wants the upload retried, and stores nothing", async () => {
    vi.mocked(processUpload).mockRejectedValue(new UploadRejectedError("busy", "Try again in a few seconds.", 10));

    await expect(upload()).resolves.toEqual({
      ok: false,
      refusal: "busy",
      message: "Try again in a few seconds.",
      retryAfterSeconds: 10,
    });
    expect(events).toEqual([]);
  });

  it("records nothing when the file cannot be stored", async () => {
    vi.mocked(storage.put).mockRejectedValue(new Error("disk full"));

    await expect(upload()).rejects.toThrow("disk full");
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("deletes the stored file when the row cannot be recorded", async () => {
    vi.mocked(recordUploadedMedia).mockRejectedValue(new Error("connection lost"));

    await expect(upload()).rejects.toThrow("connection lost");
    expect(events).toEqual([`put ${NEW_KEY}`, "begin", ...deletesOf(NEW_KEY)]);
  });

  it("deletes the stored file and shows the locked notice once onboarding has been sent", async () => {
    vi.mocked(recordUploadedMedia).mockRejectedValue(new OnboardingLockedError());

    await expect(upload()).resolves.toEqual({ ok: false, refusal: "locked", message: ONBOARDING_LOCKED_MESSAGE });
    expect(events).toEqual([`put ${NEW_KEY}`, "begin", ...deletesOf(NEW_KEY)]);
  });

  it("still reports the original failure when the clean-up fails too", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(recordUploadedMedia).mockRejectedValue(new Error("connection lost"));
    vi.mocked(storage.delete).mockRejectedValue(new Error("disk gone"));

    await expect(upload()).rejects.toThrow("connection lost");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("refuses a 21st photo and removes the file it stored", async () => {
    vi.mocked(recordUploadedMedia).mockRejectedValue(new PhotoLimitReachedError(20));

    await expect(upload()).resolves.toEqual({ ok: false, refusal: "photo-limit", message: PHOTO_LIMIT_MESSAGE });
    expect(PHOTO_LIMIT_MESSAGE).toBe("You can add up to 20 photos. Remove one to add another.");
    expect(events).toEqual([`put ${NEW_KEY}`, "begin", ...deletesOf(NEW_KEY)]);
  });

  it("deletes a replaced logo's file only after the transaction commits", async () => {
    vi.mocked(recordUploadedMedia).mockImplementation(async (_tx, input) => {
      events.push(`record ${input.id}`);
      return { asset: asset(input.id, "logo"), replacedStorageKeys: [OLD_KEY] };
    });

    await expect(upload("logo", "logo.png")).resolves.toMatchObject({ ok: true, asset: { purpose: "logo" } });
    expect(events).toEqual([`put ${NEW_KEY}`, "begin", `record ${NEW_ID}`, "commit", ...deletesOf(OLD_KEY)]);
  });
});

describe("removeOnboardingImage", () => {
  it("soft-deletes the row in the tenant scope, then deletes the file", async () => {
    vi.mocked(softDeleteMediaAsset).mockImplementation(async (_tx, mediaId) => {
      events.push(`soft-delete ${mediaId}`);
      return OLD_KEY;
    });

    await expect(removeOnboardingImage({ appDb, storage }, tenant, OLD_LOGO_ID)).resolves.toEqual({ ok: true });
    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(events).toEqual(["begin", `soft-delete ${OLD_LOGO_ID}`, "commit", ...deletesOf(OLD_KEY)]);
  });

  it("touches no file when the image is not the business's, or is already gone", async () => {
    vi.mocked(softDeleteMediaAsset).mockResolvedValue(null);

    await expect(removeOnboardingImage({ appDb, storage }, tenant, "someone-elses")).resolves.toMatchObject({ ok: false });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("shows the locked notice once onboarding has been sent, and keeps the file", async () => {
    vi.mocked(softDeleteMediaAsset).mockRejectedValue(new OnboardingLockedError());

    await expect(removeOnboardingImage({ appDb, storage }, tenant, OLD_LOGO_ID)).resolves.toEqual({
      ok: false,
      message: ONBOARDING_LOCKED_MESSAGE,
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
