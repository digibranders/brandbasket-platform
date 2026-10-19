import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalMediaStorage,
  deleteMediaFiles,
  deleteMediaFilesReporting,
  InvalidMediaKeyError,
  localMediaRoot,
  MEDIA_ROOT_VARIABLE,
  mediaStorageKey,
  type MediaStorage,
} from "./media-storage";

vi.mock("server-only", () => ({}));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const MEDIA_ID = "0192f3c4-2222-7000-8000-000000000002";

let sandbox = "";
let root = "";
let storage: MediaStorage;

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  // The storage root sits one level inside the sandbox, so a file escaping the root would still be visible here.
  sandbox = await mkdtemp(path.join(tmpdir(), "brandbasket-media-"));
  root = path.join(sandbox, "media");
  storage = createLocalMediaStorage(root);
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("mediaStorageKey", () => {
  it("builds the key from the business id, media id and variant", () => {
    expect(mediaStorageKey(BUSINESS_ID, MEDIA_ID, "display")).toBe(`t/${BUSINESS_ID}/${MEDIA_ID}/display`);
  });

  it("refuses anything that is not a lowercase UUID, such as a filename", () => {
    for (const [businessId, mediaId] of [
      ["holiday photo.jpg", MEDIA_ID],
      [BUSINESS_ID, "../../etc/passwd"],
      [BUSINESS_ID, MEDIA_ID.toUpperCase()],
      ["", MEDIA_ID],
    ] as const) {
      expect(() => mediaStorageKey(businessId, mediaId, "display")).toThrow(InvalidMediaKeyError);
    }
  });

  it("refuses an unknown variant", () => {
    expect(() => mediaStorageKey(BUSINESS_ID, MEDIA_ID, "original" as "display")).toThrow(InvalidMediaKeyError);
  });
});

describe("createLocalMediaStorage", () => {
  it("stores, reads back and deletes an object", async () => {
    const key = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "display");
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await storage.put(key, bytes, "image/webp");

    expect(await storage.get(key)).toEqual({ bytes, contentType: "image/webp" });
    expect(await exists(path.join(root, "t", BUSINESS_ID, MEDIA_ID, "display"))).toBe(true);

    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    expect(await readdir(path.join(root, "t", BUSINESS_ID, MEDIA_ID))).toEqual([]);
  });

  it("returns null for a key that was never stored, and deletes one quietly", async () => {
    expect(await storage.get("t/nothing/here")).toBeNull();
    await expect(storage.delete("t/nothing/here")).resolves.toBeUndefined();
  });

  it("replaces an object stored under the same key", async () => {
    await storage.put("t/a/b", new Uint8Array([1]), "image/png");
    await storage.put("t/a/b", new Uint8Array([2, 2]), "image/webp");
    expect(await storage.get("t/a/b")).toEqual({ bytes: new Uint8Array([2, 2]), contentType: "image/webp" });
    // No temporary files are left behind.
    expect((await readdir(path.join(root, "t", "a"))).sort()).toEqual(["b", "b.content-type"]);
  });

  it("refuses keys that could leave the root, for every operation, and writes nothing", async () => {
    const hostile = [
      "../escape",
      "t/../../escape",
      "t/../../../etc/passwd",
      "/etc/passwd",
      "..",
      ".",
      "",
      "t//x",
      "t/./x",
      "t\\..\\..\\escape",
      "t/x\0",
      "t/x/",
      "t/photo.jpg",
      "x".repeat(513),
    ];
    for (const key of hostile) {
      await expect(storage.put(key, new Uint8Array([1]), "image/webp"), key).rejects.toBeInstanceOf(
        InvalidMediaKeyError,
      );
      await expect(storage.get(key), key).rejects.toBeInstanceOf(InvalidMediaKeyError);
      await expect(storage.delete(key), key).rejects.toBeInstanceOf(InvalidMediaKeyError);
    }
    expect(await readdir(sandbox)).toEqual([]);
  });

  it("refuses a content type that is not a plain media type", async () => {
    await expect(storage.put("t/a/b", new Uint8Array([1]), "text/html\r\nX-Evil: 1")).rejects.toThrow(
      'Refusing to store media with content type "text/html\r\nX-Evil: 1".',
    );
    expect(await storage.get("t/a/b")).toBeNull();
  });
});

/**
 * The customer app writes an upload and the staff console reads it back, so the two apps must land on the same
 * directory. They did not: the root was derived from `process.cwd()`, which is each app's own directory, and every
 * customer photo 404ed in the console.
 */
describe("localMediaRoot", () => {
  it("uses the configured root, resolved to an absolute path", () => {
    expect(localMediaRoot({ [MEDIA_ROOT_VARIABLE]: "/srv/brandbasket/.data/media" })).toBe("/srv/brandbasket/.data/media");
    expect(localMediaRoot({ [MEDIA_ROOT_VARIABLE]: "  /srv/media  " })).toBe("/srv/media");
  });

  it("is the same directory for both apps, which run from their own app folder", () => {
    const cwd = vi.spyOn(process, "cwd");

    cwd.mockReturnValue("/repo/apps/platform");
    const fromPlatform = localMediaRoot({});
    cwd.mockReturnValue("/repo/apps/admin");
    const fromAdmin = localMediaRoot({});

    expect(fromPlatform).toBe(fromAdmin);
    expect(fromPlatform).toBe(path.join("/repo", ".data", "media"));
    cwd.mockRestore();
  });

  it("ignores a blank variable rather than resolving to the filesystem root", () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue("/repo/apps/platform");
    expect(localMediaRoot({ [MEDIA_ROOT_VARIABLE]: "   " })).toBe(path.join("/repo", ".data", "media"));
    cwd.mockRestore();
  });
});

describe("deleteMediaFiles", () => {
  const bytes = new Uint8Array([1, 2, 3]);

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "brandbasket-media-delete-"));
    storage = createLocalMediaStorage(sandbox);
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("deletes a picture's smaller copies with the picture", async () => {
    const display = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "display");
    const small = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "w320");
    const medium = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "w640");
    for (const key of [display, small, medium]) await storage.put(key, bytes, "image/webp");

    await deleteMediaFiles(storage, [display]);

    for (const key of [display, small, medium]) expect(await storage.get(key)).toBeNull();
  });

  it("does not fail for a picture that never had copies, and leaves other pictures alone", async () => {
    const display = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "display");
    const otherId = "0192f3c4-3333-7000-8000-000000000003";
    const other = mediaStorageKey(BUSINESS_ID, otherId, "display");
    await storage.put(display, bytes, "image/webp");
    await storage.put(other, bytes, "image/webp");

    await deleteMediaFiles(storage, [display]);

    expect(await storage.get(display)).toBeNull();
    expect(await storage.get(other)).not.toBeNull();
  });
});

describe("deleteMediaFilesReporting", () => {
  it("returns the keys it could not delete, copies of a picture included, and keeps going", async () => {
    const display = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "display");
    const small = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "w320");
    const calls: string[] = [];
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flaky: MediaStorage = {
      get: vi.fn(),
      put: vi.fn(),
      delete: async (key) => {
        calls.push(key);
        if (key === small) throw new Error("bucket unavailable");
      },
    };

    const failed = await deleteMediaFilesReporting(flaky, [display]);

    expect(failed).toEqual([small]);
    expect(calls).toEqual([display, small, mediaStorageKey(BUSINESS_ID, MEDIA_ID, "w640")]);
    quiet.mockRestore();
  });

  it("returns nothing when every file went", async () => {
    const delete_ = vi.fn(async () => undefined);
    const storage_: MediaStorage = { get: vi.fn(), put: vi.fn(), delete: delete_ };
    expect(await deleteMediaFilesReporting(storage_, [mediaStorageKey(BUSINESS_ID, MEDIA_ID, "w320")])).toEqual([]);
    expect(delete_).toHaveBeenCalledTimes(1);
  });
});
