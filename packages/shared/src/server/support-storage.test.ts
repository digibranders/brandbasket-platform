import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalSupportStorage,
  createSupportStorage,
  supportStorageKey,
} from "./support-storage";
vi.mock("server-only", () => ({}));
const owner = "0192f3c4-1111-7000-8000-000000000001";
const id = "0192f3c4-2222-7000-8000-000000000002";
let sandbox: string | undefined;
afterEach(async () => {
  if (sandbox) await rm(sandbox, { recursive: true, force: true });
});
describe("private support storage", () => {
  it("stores opaque keys privately and deletes idempotently", async () => {
    sandbox = await mkdtemp(path.join(tmpdir(), "support-private-"));
    const storage = createLocalSupportStorage(sandbox);
    const key = supportStorageKey(owner, id);
    await storage.put(key, new Uint8Array([1, 2]));
    expect(await storage.get(key)).toEqual(new Uint8Array([1, 2]));
    expect((await stat(path.join(sandbox, key))).mode & 0o777).toBe(0o600);
    expect(storage).not.toHaveProperty("publicUrl");
    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });
  it("refuses traversal, filenames and malformed namespaces before disk operations", async () => {
    const storage = createLocalSupportStorage("/unused");
    for (const key of [
      "../secret",
      `support/${owner}/${id}.png`,
      `support/${owner}/../${id}`,
      `t/${owner}/${id}/display`,
    ]) {
      await expect(storage.put(key, new Uint8Array([1]))).rejects.toThrow(
        "Invalid support storage key",
      );
      await expect(storage.get(key)).rejects.toThrow(
        "Invalid support storage key",
      );
      await expect(storage.delete(key)).rejects.toThrow(
        "Invalid support storage key",
      );
    }
  });
  it("does not reuse public media settings and refuses overlapping roots", () => {
    expect(createSupportStorage({ R2_BUCKET: "public" })).not.toHaveProperty(
      "publicUrl",
    );
    expect(() =>
      createSupportStorage({
        FYNIX_SUPPORT_ROOT: "/data/media/support",
        FYNIX_MEDIA_ROOT: "/data/media",
      }),
    ).toThrow("separate");
  });
});
it("rejects private roots inside public media even when the directory begins with two dots", () => {
  expect(() =>
    createSupportStorage({
      FYNIX_SUPPORT_ROOT: "/data/media/..screenshots",
      FYNIX_MEDIA_ROOT: "/data/media",
    }),
  ).toThrow("separate");
});
