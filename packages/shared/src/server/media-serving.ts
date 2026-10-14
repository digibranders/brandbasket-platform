import "server-only";
import { findMediaAsset, findMediaForStaff, withTenantScope, type Database } from "@firstfold/db";
import type { TenantContext } from "../lib/access";
import { pictureCopyKey, type PictureCopyWidth } from "./media-keys";
import type { MediaStorage } from "./media-storage";

const NOT_FOUND = 404;

function notFound(): Response {
  return new Response(null, { status: NOT_FOUND, headers: { "Cache-Control": "no-store" } });
}

/** What a media response needs from the asset row. */
export interface ServableMedia {
  readonly storageKey: string;
  readonly mimeType: string;
  /** Hex SHA-256 of the stored file. */
  readonly sha256: string;
}

/**
 * Every response revalidates (`no-cache`), since access can be withdrawn, but an unchanged file costs a 304 and no
 * storage read. `private` keeps shared caches out, and CORP stops other sites embedding the image with the viewer's
 * cookies.
 */
const CACHE_HEADERS = {
  "Cache-Control": "private, no-cache",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

/** A strong validator: the stored bytes never change under an id, and the checksum names them exactly. */
export function mediaEtag(sha256: string): string {
  return `"${sha256}"`;
}

/**
 * Whether an If-None-Match header already names `etag`. Handles `*`, lists and weak tags, which compare weakly for
 * GET as RFC 9110 says.
 */
export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const trimmed = header.trim();
  if (trimmed === "*") return true;
  return trimmed
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === etag);
}

/**
 * The response for `GET /media/{mediaId}` on the app host. The asset row is read through the tenant-scoped app
 * connection, so another business's id, a deleted asset and a malformed id all look the same: 404. The content type
 * comes from the row, and the original filename is never sent.
 */
export async function serveTenantMedia(
  appDb: Database,
  storage: MediaStorage,
  tenant: TenantContext,
  mediaId: string,
  ifNoneMatch: string | null,
): Promise<Response> {
  const asset = await withTenantScope(appDb, tenant, (tx) => findMediaAsset(tx, mediaId));
  if (asset === null) return notFound();

  return storedMediaResponse(storage, asset, ifNoneMatch);
}

/**
 * Streams a stored image with the headers every media route shares, or answers 304 without reading storage when the
 * browser already holds this exact file. The caller has already decided the viewer may see this asset; a file
 * missing from storage is a 404 like any other.
 */
export async function storedMediaResponse(
  storage: MediaStorage,
  asset: ServableMedia,
  ifNoneMatch: string | null,
): Promise<Response> {
  const etag = mediaEtag(asset.sha256);
  if (matchesIfNoneMatch(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers: { ...CACHE_HEADERS, ETag: etag } });
  }

  const stored = await storage.get(asset.storageKey);
  if (stored === null) return notFound();

  return new Response(new Uint8Array(stored.bytes), {
    status: 200,
    headers: {
      ...CACHE_HEADERS,
      ETag: etag,
      "Content-Type": asset.mimeType,
      "Content-Length": String(stored.bytes.byteLength),
      "Content-Disposition": "inline",
      // Opened directly, the file can run nothing and load nothing.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

/**
 * Like storedMediaResponse, for a picture shown at a smaller size: sends the copy made at `width` when there is one, and
 * the picture itself when there is none (a picture uploaded before copies existed, or one narrower than `width`), so
 * asking for a size never fails a picture that exists. The copy has its own ETag, since it is other bytes. With no
 * `width` this is exactly storedMediaResponse.
 */
export async function storedPictureResponse(
  storage: MediaStorage,
  asset: ServableMedia,
  ifNoneMatch: string | null,
  width: PictureCopyWidth | null,
): Promise<Response> {
  if (width === null) return storedMediaResponse(storage, asset, ifNoneMatch);

  const copyKey = pictureCopyKey(asset.storageKey, width);
  if (copyKey === null) return storedMediaResponse(storage, asset, ifNoneMatch);

  const etag = mediaEtag(`${asset.sha256}-w${String(width)}`);
  if (matchesIfNoneMatch(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers: { ...CACHE_HEADERS, ETag: etag } });
  }

  const copy = await storage.get(copyKey);
  if (copy === null) return storedMediaResponse(storage, asset, ifNoneMatch);

  return new Response(new Uint8Array(copy.bytes), {
    status: 200,
    headers: {
      ...CACHE_HEADERS,
      ETag: etag,
      "Content-Type": copy.contentType,
      "Content-Length": String(copy.bytes.byteLength),
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

/** The staff console's view of any business's image. Only call after checking staff access. */
export async function serveStaffMedia(
  staffDb: Database,
  storage: MediaStorage,
  mediaId: string,
  ifNoneMatch: string | null,
): Promise<Response> {
  const asset = await findMediaForStaff(staffDb, mediaId);
  if (asset === null) return notFound();
  return storedMediaResponse(storage, asset, ifNoneMatch);
}
