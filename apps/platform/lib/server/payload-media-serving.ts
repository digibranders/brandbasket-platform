import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPayload } from "payload";
import config from "@/payload.config";

const NOT_FOUND_HEADERS = { "Cache-Control": "no-store" } as const;

function notFound(): Response {
  return new Response(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

interface RawMediaDoc {
  readonly filename?: unknown;
  readonly mimeType?: unknown;
  readonly businessId?: unknown;
}

/**
 * Serves one Payload `media` document's file bytes, entirely through the Local API (`overrideAccess: true`) plus a
 * direct disk read — never through Payload's REST file route (`/api/media/file/<filename>`). That route cannot be
 * used any more for this: `collections/Media.ts`'s `access.read` now denies every request (see that file's doc
 * comment for the full incident this fixes), and Payload's REST file handler always evaluates the real `access`
 * function — it has no `overrideAccess` equivalent, since a browser's `<img src>` request never goes through our
 * server code. So this function reads the bytes itself, after doing the *real* authorization check here, in code
 * that can actually see who's asking.
 *
 * `allowedBusinessId`: `null` for an unscoped caller (staff — the single-admin model already gives staff blanket
 * access to every business's data everywhere else in this app). For a scoped caller (a customer), pass their own
 * `tenant.businessId`; the media document's own `businessId` must match exactly, or this returns the same bare 404
 * as a not-found id — nothing about the response tells an unauthorized guess which case it hit.
 *
 * Reads straight off local disk, resolving the same `staticDir` Payload's own `getFileHandler` would (see
 * node_modules/payload/dist/uploads/endpoints/getFile.js: `collection.config.upload?.staticDir || collection.config.slug`),
 * read off the live `Payload` instance rather than duplicated as a guessed constant. This only works for Payload's
 * default local-disk storage (see collections/Media.ts's still-open production storage-adapter note) — if that
 * lands with `disableLocalStorage: true`, this function needs to change to fetch bytes from that adapter's store
 * instead of the filesystem; don't assume this keeps working unmodified once that decision lands.
 */
export async function servePayloadMediaFile(
  mediaId: string,
  allowedBusinessId: string | null,
  options: { readonly publicContent?: boolean } = {},
): Promise<Response> {
  const payload = await getPayload({ config });

  let doc: RawMediaDoc;
  try {
    doc = (await payload.findByID({
      collection: "media",
      id: mediaId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as RawMediaDoc;
  } catch {
    return notFound();
  }

  if (typeof doc.filename !== "string" || doc.filename.length === 0) return notFound();
  if (allowedBusinessId !== null && doc.businessId !== allowedBusinessId) return notFound();

  const mediaCollection = payload.collections["media"];
  const staticDir = mediaCollection?.config.upload?.staticDir ?? "media";
  const resolvedDir = path.resolve(staticDir);
  const filePath = path.resolve(resolvedDir, doc.filename);
  // Guards against a filename that would resolve outside the storage root, the same check getFileHandler makes —
  // belt-and-braces here, since `doc.filename` comes from our own database, not directly from user input.
  if (filePath !== resolvedDir && !filePath.startsWith(resolvedDir + path.sep)) return notFound();

  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return notFound();
  }

  const mimeType = typeof doc.mimeType === "string" && doc.mimeType.length > 0 ? doc.mimeType : "application/octet-stream";

  // `publicContent` is for an image already published on a client's website (the site API's media route), which any
  // origin must be able to embed and which a shared cache may keep for a short while. Everything else stays private.
  const sharing: Record<string, string> = options.publicContent === true
    ? { "Cache-Control": "public, max-age=300", "Cross-Origin-Resource-Policy": "cross-origin", "Access-Control-Allow-Origin": "*" }
    : {
        // Revalidates every time (no-cache, not no-store): the file itself never changes under a given id, but
        // access can be withdrawn (a business could stop being able to see media that was never theirs), so a shared
        // or browser cache must not serve this to a different viewer without asking again.
        "Cache-Control": "private, no-cache",
        "Cross-Origin-Resource-Policy": "same-origin",
      };

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...sharing,
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      // Opened directly, the file can run nothing and load nothing — matches lib/server/media-serving.ts's
      // equivalent header for the old system's media route.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
