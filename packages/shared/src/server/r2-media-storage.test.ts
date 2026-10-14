import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { InvalidMediaKeyError, mediaStorageKey } from "./media-keys";
import { createR2MediaStorage, r2ConfigFromEnv, type R2Client, type R2Config } from "./r2-media-storage";

vi.mock("server-only", () => ({}));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const MEDIA_ID = "0192f3c4-2222-7000-8000-000000000002";
const KEY = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "display");

const CONFIG: R2Config = {
  accountId: "acct",
  accessKeyId: "key-id",
  secretAccessKey: "secret",
  bucket: "firstfold-media",
};

function clientReturning(...answers: unknown[]): R2Client & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn();
  for (const answer of answers) {
    if (answer instanceof Error) send.mockRejectedValueOnce(answer);
    else send.mockResolvedValueOnce(answer);
  }
  return { send };
}

describe("createR2MediaStorage", () => {
  it("puts an object into the bucket with its content type and a long, immutable cache lifetime", async () => {
    const client = clientReturning({});
    const storage = createR2MediaStorage(CONFIG, client);
    await storage.put(KEY, new Uint8Array([1, 2, 3]), "image/webp");

    const command = client.send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "firstfold-media",
      Key: KEY,
      Body: new Uint8Array([1, 2, 3]),
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  it("reads an object back with its content type", async () => {
    const client = clientReturning({
      ContentType: "image/webp",
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([9, 8])) },
    });
    const storage = createR2MediaStorage(CONFIG, client);
    expect(await storage.get(KEY)).toEqual({ bytes: new Uint8Array([9, 8]), contentType: "image/webp" });
    const command = client.send.mock.calls[0]?.[0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({ Bucket: "firstfold-media", Key: KEY });
  });

  it("answers null for an object that is not there, whichever way the library says so", async () => {
    const missingByName = Object.assign(new Error("gone"), { name: "NoSuchKey" });
    const missingByStatus = Object.assign(new Error("gone"), { name: "Other", $metadata: { httpStatusCode: 404 } });
    const storage = createR2MediaStorage(CONFIG, clientReturning(missingByName, missingByStatus));
    expect(await storage.get(KEY)).toBeNull();
    expect(await storage.get(KEY)).toBeNull();
  });

  it("lets any other failure through, so a broken bucket is not mistaken for a missing file", async () => {
    const storage = createR2MediaStorage(CONFIG, clientReturning(Object.assign(new Error("denied"), { name: "AccessDenied" })));
    await expect(storage.get(KEY)).rejects.toThrow("denied");
  });

  it("deletes an object", async () => {
    const client = clientReturning({});
    await createR2MediaStorage(CONFIG, client).delete(KEY);
    const command = client.send.mock.calls[0]?.[0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({ Bucket: "firstfold-media", Key: KEY });
  });

  it("refuses a malformed key or content type before it asks the bucket anything", async () => {
    const client = clientReturning({});
    const storage = createR2MediaStorage(CONFIG, client);
    await expect(storage.put("../escape", new Uint8Array([1]), "image/webp")).rejects.toBeInstanceOf(InvalidMediaKeyError);
    await expect(storage.get("t/photo.jpg")).rejects.toBeInstanceOf(InvalidMediaKeyError);
    await expect(storage.delete("")).rejects.toBeInstanceOf(InvalidMediaKeyError);
    await expect(storage.put(KEY, new Uint8Array([1]), "text/html\r\nX-Evil: 1")).rejects.toThrow("Refusing to store media with content type");
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe("r2ConfigFromEnv", () => {
  const FULL = {
    R2_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key-id",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "firstfold-media",
  };

  it("is null when none of the settings are present, so local disk is used", () => {
    expect(r2ConfigFromEnv({})).toBeNull();
    expect(r2ConfigFromEnv({ R2_BUCKET: "  " })).toBeNull();
  });

  it("reads all four, trimming what it is given", () => {
    expect(r2ConfigFromEnv({ ...FULL, R2_ACCOUNT_ID: "  acct " })).toEqual({ ...CONFIG });
  });

  it("names every missing setting when only some are present, instead of quietly using local disk", () => {
    expect(() => r2ConfigFromEnv({ R2_BUCKET: "firstfold-media", R2_ACCOUNT_ID: "acct" })).toThrow(
      "R2 storage is half set up. Missing: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  });
});
