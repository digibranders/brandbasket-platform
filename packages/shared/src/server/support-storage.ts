import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createR2SupportStorage,
  supportR2ConfigFromEnv,
} from "./r2-support-storage";

/** Deliberately has no public URL method: every read must pass application authorization. */
export interface SupportStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY = new RegExp(`^support/${UUID}/${UUID}$`);
export class InvalidSupportStorageKeyError extends Error {
  constructor() {
    super("Invalid support storage key: expected two opaque UUIDs.");
    this.name = "InvalidSupportStorageKeyError";
  }
}
export function validateSupportStorageKey(key: string): void {
  if (!KEY.test(key)) throw new InvalidSupportStorageKeyError();
}
export function supportStorageKey(
  namespaceId: string,
  attachmentId: string,
): string {
  const key = `support/${namespaceId}/${attachmentId}`;
  validateSupportStorageKey(key);
  return key;
}
function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
export function createLocalSupportStorage(rootDir: string): SupportStorage {
  const root = path.resolve(rootDir);
  const resolveKey = (key: string): string => {
    validateSupportStorageKey(key);
    return path.join(root, key);
  };
  return {
    async put(key, bytes) {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
        await rename(temporary, target);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
    async get(key) {
      const target = resolveKey(key);
      try {
        return new Uint8Array(await readFile(target));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}
export function localSupportRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = env.FIRSTFOLD_SUPPORT_ROOT?.trim();
  const root = configured
    ? path.resolve(/*turbopackIgnore: true*/ configured)
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..", ".data", "support-private");
  const media = path.resolve(
    /*turbopackIgnore: true*/
    env.FIRSTFOLD_MEDIA_ROOT?.trim() ||
      path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "..", ".data", "media"),
  );
  const inside = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child);
    return (
      relative === "" ||
      (relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative))
    );
  };
  if (inside(media, root) || inside(root, media))
    throw new Error(
      "Support storage must use a separate root outside public media storage.",
    );
  return root;
}
export function createSupportStorage(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SupportStorage {
  const config = supportR2ConfigFromEnv(env);
  return config === null
    ? createLocalSupportStorage(localSupportRoot(env))
    : createR2SupportStorage(config);
}
let sharedStorage: SupportStorage | undefined;
export function getSupportStorage(): SupportStorage {
  sharedStorage ??= createSupportStorage();
  return sharedStorage;
}
