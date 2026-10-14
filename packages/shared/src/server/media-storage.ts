import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createR2MediaStorage, r2ConfigFromEnv } from "./r2-media-storage";
import {
  InvalidMediaKeyError,
  keysOfPicture,
  mediaStorageKey,
  MEDIA_VARIANTS,
  validateContentType,
  validateMediaKey,
  type MediaVariant,
} from "./media-keys";

export { InvalidMediaKeyError, mediaStorageKey, MEDIA_VARIANTS, type MediaVariant };

/**
 * Where uploaded media lives: plain files on local disk (below), or a Cloudflare R2 bucket (r2-media-storage.ts), chosen
 * by getMediaStorage from the environment. Keys are opaque to callers except through mediaStorageKey, which builds them
 * only from ids.
 */
export interface MediaStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ readonly bytes: Uint8Array; readonly contentType: string } | null>;
  delete(key: string): Promise<void>;
}

/** Stored beside each object. Keys cannot contain a dot, so this suffix can never collide with a key. */
const CONTENT_TYPE_SUFFIX = ".content-type";

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Stores media as plain files under `rootDir`, with each object's content type in a small file beside it. Every key
 * is checked for shape and then resolved against the root; a key whose resolved path is not strictly inside the
 * root is refused, so no key can read or write anywhere else on disk.
 */
export function createLocalMediaStorage(rootDir: string): MediaStorage {
  const root = path.resolve(rootDir);

  function resolveKey(key: string): string {
    validateMediaKey(key);
    const resolved = path.resolve(root, key);
    const relative = path.relative(root, resolved);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new InvalidMediaKeyError("it resolves outside the storage root");
    }
    return resolved;
  }

  /** Written to a temporary name first, so a reader never sees half a file. */
  async function writeAtomically(target: string, data: Uint8Array | string): Promise<void> {
    const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, data, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  return {
    async put(key, bytes, contentType) {
      const file = resolveKey(key);
      validateContentType(contentType);
      await mkdir(path.dirname(file), { recursive: true });
      // The content type goes first: an object is only readable once its bytes exist, and by then its type does.
      await writeAtomically(`${file}${CONTENT_TYPE_SUFFIX}`, contentType);
      await writeAtomically(file, bytes);
    },

    async get(key) {
      const file = resolveKey(key);
      try {
        const [bytes, contentType] = await Promise.all([
          readFile(file),
          readFile(`${file}${CONTENT_TYPE_SUFFIX}`, "utf8"),
        ]);
        return { bytes: new Uint8Array(bytes), contentType };
      } catch (error) {
        if (isMissingFile(error)) return null;
        throw error;
      }
    },

    async delete(key) {
      const file = resolveKey(key);
      await rm(file, { force: true });
      await rm(`${file}${CONTENT_TYPE_SUFFIX}`, { force: true });
    },
  };
}

/** The environment variable that sets the media root, absolute. Written by `pnpm env:init` for both apps. */
export const MEDIA_ROOT_VARIABLE = "FYNIX_MEDIA_ROOT";

/**
 * Where uploaded media lives on disk.
 *
 * Both apps must resolve the *same* directory: the customer uploads a logo through apps/platform and staff read it
 * back through apps/admin. This was `path.join(process.cwd(), ".data", "media")`, which was correct while there was
 * one app and silently wrong the moment there were two — Next runs each app from its own directory, so the console
 * looked in `apps/admin/.data/media` for files the dashboard had written to `apps/platform/.data/media`, and every
 * customer photo 404ed.
 *
 * So the root is configuration, not a derived path. The fallback resolves the workspace root from the app's
 * directory (both apps run from `apps/<name>`) purely so a checkout without the variable set still works.
 */
export function localMediaRoot(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env[MEDIA_ROOT_VARIABLE]?.trim();
  if (configured !== undefined && configured.length > 0) return path.resolve(configured);
  return path.resolve(process.cwd(), "..", "..", ".data", "media");
}

let sharedStorage: MediaStorage | undefined;

/**
 * The storage this process uses: the R2 bucket when its settings are present, else local disk. Settings that are only
 * partly present throw, rather than quietly falling back to a disk the other app cannot see.
 */
export function createMediaStorage(env: Readonly<Record<string, string | undefined>> = process.env): MediaStorage {
  const r2 = r2ConfigFromEnv(env);
  return r2 === null ? createLocalMediaStorage(localMediaRoot(env)) : createR2MediaStorage(r2);
}

export function getMediaStorage(): MediaStorage {
  sharedStorage ??= createMediaStorage();
  return sharedStorage;
}

/**
 * Deletes stored files whose rows are already gone. A failure leaves an unreferenced file behind, which is harmless
 * and cannot be served (serving starts from the row), so it is logged rather than shown to anyone.
 */
export async function deleteMediaFiles(storage: MediaStorage, keys: readonly string[]): Promise<void> {
  await deleteMediaFilesReporting(storage, keys);
}

/**
 * As deleteMediaFiles, for a caller that must know what was left behind (erasing a closed account): the keys that
 * could not be deleted, each logged. A picture's key stands for its smaller copies too (keysOfPicture); deleting a copy
 * that was never made is harmless, so a failed key may be a copy.
 */
export async function deleteMediaFilesReporting(storage: MediaStorage, keys: readonly string[]): Promise<readonly string[]> {
  const failed: string[] = [];
  for (const key of keys.flatMap((candidate) => keysOfPicture(candidate))) {
    try {
      await storage.delete(key);
    } catch (error) {
      console.error("Could not delete a stored media file", { key, error });
      failed.push(key);
    }
  }
  return failed;
}
