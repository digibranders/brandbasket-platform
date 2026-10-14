import "server-only";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { validateContentType, validateMediaKey } from "./media-keys";
import type { MediaStorage } from "./media-storage";

/*
 * Media (pictures, logos) in a Cloudflare R2 bucket, through its S3-compatible API, instead of on local disk. Files are
 * read back through the platform exactly as from disk, so the bucket stays private: it holds the bytes, nothing more.
 */

export interface R2Config {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}

/** The part of the AWS client the adapter uses, so a test can stand in for the network. */
export interface R2Client {
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

/** Every object's name holds a fresh id, so a copy cached anywhere can never go stale. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

const SETTINGS = {
  accountId: "R2_ACCOUNT_ID",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
  bucket: "R2_BUCKET",
} as const;

/**
 * The bucket's settings from the environment: null when none are present (local disk is used), the settings when all
 * four are, and an error naming the missing ones when only some are, so a half-finished setup is noticed at once
 * rather than writing files to a disk the other app cannot read.
 */
export function r2ConfigFromEnv(env: Readonly<Record<string, string | undefined>>): R2Config | null {
  const read = (name: string): string => env[name]?.trim() ?? "";
  const present = Object.values(SETTINGS).filter((name) => read(name) !== "");
  if (present.length === 0) return null;
  const missing = Object.values(SETTINGS).filter((name) => read(name) === "");
  if (missing.length > 0) throw new Error(`R2 storage is half set up. Missing: ${missing.join(", ")}.`);
  return {
    accountId: read(SETTINGS.accountId),
    accessKeyId: read(SETTINGS.accessKeyId),
    secretAccessKey: read(SETTINGS.secretAccessKey),
    bucket: read(SETTINGS.bucket),
  };
}

function isMissingObject(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "NoSuchKey") return true;
  const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return metadata?.httpStatusCode === 404;
}

function defaultClient(config: R2Config): R2Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

/** Stores media in the bucket. Every key and content type is checked exactly as local disk checks them, before the network is asked anything. */
export function createR2MediaStorage(config: R2Config, client: R2Client = defaultClient(config)): MediaStorage {
  return {
    async put(key, bytes, contentType) {
      validateMediaKey(key);
      validateContentType(contentType);
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: CACHE_CONTROL }),
      );
    },

    async get(key) {
      validateMediaKey(key);
      try {
        const answer = (await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))) as {
          Body?: { transformToByteArray(): Promise<Uint8Array> };
          ContentType?: string;
        };
        if (answer.Body === undefined) return null;
        return { bytes: await answer.Body.transformToByteArray(), contentType: answer.ContentType ?? "application/octet-stream" };
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },

    async delete(key) {
      validateMediaKey(key);
      // Deleting an object that is already gone is not an error in S3, which matches local disk.
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
