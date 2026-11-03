import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { parseUploadFileName } from "@brandbasket/shared/lib/uploads/file-name";
import { isAcceptedUploadType, UPLOAD_FILE_NAME_HEADER } from "@brandbasket/shared/lib/uploads/limits";
import { detectImageType } from "@brandbasket/shared/server/media-upload";
import type { Payload } from "payload";
import { readUploadBody, refuseUpload, refuseUploadEnvelope, UPLOAD_RELOAD_MESSAGE, UPLOAD_SIGNED_OUT_MESSAGE } from "@/features/checklist/server/upload-request";
import type { UploadAllowance } from "@/lib/server-media/onboarding-media";
import { isDocId, relationId } from "../rules/paths";
import { ownedOrNull, requireOwnedBlogPost, requireOwnedTaxonomyDoc } from "./store";

/*
 * Blog images: a cover image for a post or a photo for an author, stored as a Payload `media` document stamped with the
 * session's business, and served back through a tenant-checked route. Ported from apps/platform
 * app/api/content-media-uploads/route.ts, the attach half of setCoverImageAction and setAuthorPhotoAction, and
 * lib/server/payload-media-serving.ts. The upload and the attach are one request here: the post or author is checked to be
 * the business's own before anything is stored, so a media id never travels through the browser.
 */

/** What the image is for: `?post=<id>` (its cover) or `?author=<id>` (their photo). */
export type BlogImageTarget = { readonly kind: "post"; readonly id: string } | { readonly kind: "author"; readonly id: string };

export function readImageTarget(url: URL): BlogImageTarget | null {
  const post = url.searchParams.get("post");
  const author = url.searchParams.get("author");
  if (post !== null && author === null && isDocId(post)) return { kind: "post", id: post };
  if (author !== null && post === null && isDocId(author)) return { kind: "author", id: author };
  return null;
}

export interface ReceivedImage {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
}

export interface BlogUploadDeps {
  /** The tenant, null when signed out, or the refusal the guard decided (unpaid, lapsed, no website, a viewer). */
  readonly getTenant: () => Promise<TenantContext | Response | null>;
  readonly appOrigin: string;
  readonly anyLocalHost: boolean;
  /** False when the post or author is missing or another business's. Checked before the body is read. */
  readonly ownsTarget: (tenant: TenantContext, target: BlogImageTarget) => Promise<boolean>;
  /** Spends one of the business's hourly uploads: the same budget as /api/uploads. Checked before the body is read. */
  readonly consumeAllowance: (tenant: TenantContext) => Promise<UploadAllowance>;
  readonly store: (tenant: TenantContext, target: BlogImageTarget, image: ReceivedImage) => Promise<void>;
}

export const TARGET_GONE_MESSAGE = "This post or author no longer exists. Reload the page.";
export const IMAGE_TYPE_MESSAGE = "Choose a JPEG, PNG or WEBP image.";

/**
 * `POST /website/blog/media?post=<id>` or `?author=<id>`, the raw image bytes in the body. The envelope checks (Host,
 * Origin, Content-Length, 4 MB) come first, then the target, the session and its rights, the declared type, ownership, the
 * hourly upload budget, and the body last, counted again whatever Content-Length claimed. The file's own first bytes decide
 * its type; the declared one is only an early refusal.
 */
export async function handleBlogUpload(request: Request, deps: BlogUploadDeps): Promise<Response> {
  const refused = refuseUploadEnvelope(request, deps.appOrigin, deps.anyLocalHost);
  if (refused !== null) return refused;

  const target = readImageTarget(new URL(request.url));
  if (target === null) return refuseUpload(400, UPLOAD_RELOAD_MESSAGE);

  const tenant = await deps.getTenant();
  if (tenant === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);
  if (tenant instanceof Response) return tenant;

  const mimeType = request.headers.get("content-type") ?? "";
  if (!isAcceptedUploadType(mimeType)) return refuseUpload(415, IMAGE_TYPE_MESSAGE);
  if (!(await deps.ownsTarget(tenant, target))) return refuseUpload(404, TARGET_GONE_MESSAGE);

  const allowance = await deps.consumeAllowance(tenant);
  if (!allowance.allowed) return refuseUpload(429, allowance.message, { "Retry-After": String(allowance.retryAfterSeconds) });

  const bytes = await readUploadBody(request);
  if (bytes instanceof Response) return bytes;
  if (bytes.byteLength === 0) return refuseUpload(422, "That file is empty.");
  const detected = detectImageType(bytes.subarray(0, 12));
  if (detected === null) return refuseUpload(415, IMAGE_TYPE_MESSAGE);

  await deps.store(tenant, target, { bytes, mimeType: detected, filename: parseUploadFileName(request.headers.get(UPLOAD_FILE_NAME_HEADER)) });
  return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export function ownsImageTarget(payload: Payload, businessId: string, target: BlogImageTarget): Promise<boolean> {
  const check = async (): Promise<unknown> =>
    target.kind === "post" ? requireOwnedBlogPost(payload, target.id, businessId) : requireOwnedTaxonomyDoc(payload, "blogAuthors", target.id, businessId);
  return ownedOrNull(check).then((owned) => owned !== null);
}

/** Stores the image for the business and puts it on the post (as its cover) or the author (as their photo). */
export async function storeBlogImage(payload: Payload, businessId: string, target: BlogImageTarget, image: ReceivedImage): Promise<void> {
  const media = await payload.create({
    collection: "media",
    data: { businessId },
    file: { data: Buffer.from(image.bytes), mimetype: image.mimeType, name: image.filename, size: image.bytes.byteLength },
    overrideAccess: true,
  });
  const mediaId = relationId(String(media.id));
  if (target.kind === "post") {
    await payload.update({ collection: "blogPosts", id: target.id, data: { coverImage: mediaId }, overrideAccess: true });
  } else {
    await payload.update({ collection: "blogAuthors", id: target.id, data: { photo: mediaId }, overrideAccess: true });
  }
}

const NOT_FOUND = (): Response => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

interface RawMediaDoc {
  readonly filename?: unknown;
  readonly mimeType?: unknown;
  readonly businessId?: unknown;
}

/**
 * One stored image's bytes, for this business only: another business's id answers the same bare 404 as a missing one. Read
 * through the Local API plus a disk read from the media collection's own storage folder (Payload's REST file route denies
 * every request on purpose). Only works with Payload's local-disk storage, as in the old app.
 */
export async function serveBlogImage(payload: Payload, mediaId: string, businessId: string): Promise<Response> {
  const doc = await ownedOrNull(async () => (await payload.findByID({ collection: "media", id: mediaId, depth: 0, overrideAccess: true })) as unknown as RawMediaDoc);
  if (doc === null || typeof doc.filename !== "string" || doc.filename === "" || doc.businessId !== businessId) return NOT_FOUND();

  const resolvedDir = path.resolve(payload.collections["media"]?.config.upload?.staticDir ?? "media");
  const filePath = path.resolve(resolvedDir, doc.filename);
  if (!filePath.startsWith(resolvedDir + path.sep)) return NOT_FOUND();

  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return NOT_FOUND();
  }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      // Revalidates every time: the file never changes under an id, but access can be withdrawn.
      "Cache-Control": "private, no-cache",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Type": typeof doc.mimeType === "string" && doc.mimeType !== "" ? doc.mimeType : "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
