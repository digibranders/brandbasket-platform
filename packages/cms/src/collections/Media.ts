import type { CollectionConfig } from "payload";

/**
 * Backing storage for every image `Pages`, `Gallery` and `BlogPosts` reference (hero images, gallery photos, blog
 * cover images). `upload: true` gives Payload's own upload handling for free — see this collection's note in
 * docs/superpowers/plans/2026-09-17-payload-cms-migration.md's Task 3 about production storage: by default Payload
 * writes uploaded files to local disk (`disableLocalStorage` defaults to `false`), which does not survive on
 * Vercel's ephemeral filesystem. Before this reaches production, wire a storage adapter package (e.g.
 * `@payloadcms/storage-vercel-blob` or `@payloadcms/storage-s3`) with `disableLocalStorage: true` — local disk is
 * fine for local dev only.
 *
 * `businessId` (added 2026-09-18, during Task 5's first spec-review round — a real per-tenant field, mirroring
 * `Pages`, `Gallery` and `BlogPosts`): every `media` document is stamped with the business it belongs to at create
 * time (see `app/api/admin-content-media/route.ts`, the one place that creates one), and is the field
 * `lib/server/payload-media-serving.ts` checks a customer session against before serving file bytes.
 *
 * **`access` below denies everything, on purpose — this is the second, more serious incident this collection (and
 * every other one in this app) had, found in a second spec-review round the same day. Read this in full before
 * touching any collection's `access` block.**
 *
 * The first round's fix (the `businessId` check above) closed the hole in *our own* `content-media` proxy route,
 * but every collection here — including `Media` — still had `access: { read: () => true, create: () => true, ... }`,
 * justified by a comment claiming "nobody reaches this except our own server code via the Local API." That claim
 * was false, and it was live-confirmed exploitable with zero authentication of any kind: `requireAdminHost`
 * (lib/server/require-admin-host.ts), which gates Payload's REST/GraphQL catch-all
 * (`app/(payload)/api/[...slug]/route.ts`), checks only the `Host` header — it is *routing*, not *authentication*.
 * `admin.<real-domain>` is a real, public, resolvable hostname; anyone who sends that Host header (or, in
 * production, simply reaches the real admin subdomain) hits Payload's own REST API directly, with no session and
 * no cookie. Confirmed live: `curl -H "Host: admin.localhost:3001" http://localhost:3001/api/media` returned every
 * business's media metadata, `GET /api/pages` returned every business's live page content, and
 * `GET /api/media/file/<filename>` returned the raw image bytes — all with zero authentication.
 *
 * The fix: nobody is ever supposed to reach Payload's REST/GraphQL HTTP API at all (see this plan's Architecture
 * note — the admin and the customer both only ever use Firstfold's own screens, which talk to Payload's *Local API*
 * from trusted server code, after that code's own `requireCustomerAccess`/`requireStaffAccess`/`requireBillingAccess`
 * check). The Local API's `overrideAccess: true` parameter bypasses a collection's `access` functions entirely —
 * and critically, `overrideAccess` is a **Local-API-only** parameter; no REST or GraphQL request can ever set it.
 * So denying every operation here at the collection level costs every legitimate caller nothing (they all pass
 * `overrideAccess: true` — audited across the whole `apps/platform` tree as part of this fix, see the migration
 * plan's Task 5 report), while making it *impossible* for an unauthenticated REST/GraphQL request to read, create,
 * update or delete anything here, no matter what Host header it sends or how `requireAdminHost` is (mis)configured.
 * This is defense in depth done right: `requireAdminHost` still keeps Payload's admin UI and data API off the
 * customer/marketing hosts as routing hygiene, but the real authorization boundary is this `access` block, not that
 * Host check.
 *
 * One direct consequence, fixed as part of the same change: Payload's REST file-serving endpoint
 * (`/api/media/file/<filename>`, the same `getFileHandler` that back `app/(payload)/api/[...slug]/route.ts`) always
 * evaluates this collection's real `access.read` for every request, REST or Local API alike — it has no
 * `overrideAccess` equivalent, because a browser's raw `<img src>` request is never going through our server code
 * at all. So denying `read` here unconditionally also blocks that endpoint outright, for anyone. That's correct
 * (an anonymous `GET /api/media/file/<filename>` must be refused, per the exploit above), but it means the old
 * approach in `content-media/[mediaId]/route.ts` and `admin-image-field-form.tsx` — delegating byte-serving to
 * Payload's own REST handler, or linking straight at Payload's raw `/api/media/file/...` URL — no longer works for
 * anyone, including legitimate sessions. Both now go through `lib/server/payload-media-serving.ts`, which resolves
 * the file entirely via the Local API (`overrideAccess: true`) and reads the bytes off disk itself, never touching
 * Payload's REST file route. See that file's own doc comment for the local-disk-only caveat this inherits.
 */
export const Media: CollectionConfig = {
  slug: "media",
  upload: true,
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: "businessId", type: "text", required: true, index: true },
    { name: "altText", type: "text" },
  ],
};
