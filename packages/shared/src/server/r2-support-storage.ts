import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  validateSupportStorageKey,
  type SupportStorage,
} from "./support-storage";
export interface SupportR2Config {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}
export interface SupportR2Client {
  send(
    command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand,
  ): Promise<unknown>;
}
const SETTINGS = {
  accountId: "SUPPORT_R2_ACCOUNT_ID",
  accessKeyId: "SUPPORT_R2_ACCESS_KEY_ID",
  secretAccessKey: "SUPPORT_R2_SECRET_ACCESS_KEY",
  bucket: "SUPPORT_R2_BUCKET",
} as const;
export function supportR2ConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): SupportR2Config | null {
  const read = (name: string): string => env[name]?.trim() ?? "";
  if (Object.values(SETTINGS).every((name) => read(name) === "")) return null;
  const missing = Object.values(SETTINGS).filter((name) => read(name) === "");
  if (missing.length)
    throw new Error(
      `Private support R2 configuration is incomplete. Missing: ${missing.join(", ")}.`,
    );
  if (read(SETTINGS.bucket) === read("R2_BUCKET"))
    throw new Error(
      "Support R2 must use a separate private bucket from public media.",
    );
  if (!/^[a-z0-9]+$/i.test(read(SETTINGS.accountId)))
    throw new Error("Invalid SUPPORT_R2_ACCOUNT_ID.");
  return {
    accountId: read(SETTINGS.accountId),
    accessKeyId: read(SETTINGS.accessKeyId),
    secretAccessKey: read(SETTINGS.secretAccessKey),
    bucket: read(SETTINGS.bucket),
  };
}
function defaultClient(config: SupportR2Config): SupportR2Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
export function createR2SupportStorage(
  config: SupportR2Config,
  client: SupportR2Client = defaultClient(config),
): SupportStorage {
  return {
    async put(key, bytes) {
      validateSupportStorageKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: "image/webp",
          CacheControl: "private, no-store",
        }),
      );
    },
    async get(key) {
      validateSupportStorageKey(key);
      try {
        const result = (await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
        return result.Body ? await result.Body.transformToByteArray() : null;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === "NoSuchKey" ||
            ("$metadata" in error &&
              (error.$metadata as { httpStatusCode?: number })
                ?.httpStatusCode === 404))
        )
          return null;
        throw error;
      }
    },
    async delete(key) {
      validateSupportStorageKey(key);
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
      );
    },
  };
}
