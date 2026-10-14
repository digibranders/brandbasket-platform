import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { expect, it, vi } from "vitest";
import {
  createR2SupportStorage,
  supportR2ConfigFromEnv,
  type SupportR2Config,
} from "./r2-support-storage";
vi.mock("server-only", () => ({}));
const config: SupportR2Config = {
  accountId: "account123",
  accessKeyId: "test",
  secretAccessKey: "test",
  bucket: "private-support",
};
const key =
  "support/0192f3c4-1111-7000-8000-000000000001/0192f3c4-2222-7000-8000-000000000002";
it("uses private no-store object metadata without public URLs", async () => {
  const send = vi.fn(
    async (
      _command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand,
    ) => ({ Body: { transformToByteArray: async () => new Uint8Array([1]) } }),
  );
  const storage = createR2SupportStorage(config, { send });
  await storage.put(key, new Uint8Array([1]));
  expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
  expect(
    (send.mock.calls[0]?.[0] as unknown as PutObjectCommand).input,
  ).toMatchObject({
    Bucket: "private-support",
    Key: key,
    ContentType: "image/webp",
    CacheControl: "private, no-store",
  });
  expect(await storage.get(key)).toEqual(new Uint8Array([1]));
  expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
  await storage.delete(key);
  expect(send.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  expect(storage).not.toHaveProperty("publicUrl");
});
it("rejects partial private config and public bucket reuse", () => {
  expect(
    supportR2ConfigFromEnv({
      R2_BUCKET: "public",
      R2_ACCOUNT_ID: "public-account",
    }),
  ).toBeNull();
  expect(() =>
    supportR2ConfigFromEnv({ SUPPORT_R2_BUCKET: "private-support" }),
  ).toThrow("incomplete");
  expect(() =>
    supportR2ConfigFromEnv({
      SUPPORT_R2_ACCOUNT_ID: "account123",
      SUPPORT_R2_ACCESS_KEY_ID: "test",
      SUPPORT_R2_SECRET_ACCESS_KEY: "test",
      SUPPORT_R2_BUCKET: "public",
      R2_BUCKET: "public",
    }),
  ).toThrow("separate private bucket");
});
it("does not contact object storage for a traversal key", async () => {
  const send = vi.fn();
  const storage = createR2SupportStorage(config, { send });
  await expect(storage.get("../private")).rejects.toThrow(
    "Invalid support storage key",
  );
  expect(send).not.toHaveBeenCalled();
});
