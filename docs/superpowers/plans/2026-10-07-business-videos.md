# Business videos Implementation Plan

> **Changed 2026-10-08:** videos go live on upload with no staff approval (Task 2 `recordDirectoryVideo` writes them approved and replaces the slot's old video; `decideDirectoryVideo`, `countWaitingDirectoryVideos` and the Approve/Refuse screens were removed; Task 8 is now a live list with Take down). Wherever the tasks below say "waiting", "pending" or "approve", read it that way.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No commits: the owner commits only when asked.

**Goal:** Premium members add up to three 16-second videos to their business page; staff approve them; they show in the page's photos and videos gallery, hosted on Cloudflare R2.

**Architecture:** A new `directory_videos` table beside `directory_pictures`, with the same live/waiting/removed rules. A platform route takes the raw clip, compresses it with ffmpeg (one at a time), stores the video and a poster through `MediaStorage` (local disk now, R2 adapter), and records a pending row. Staff approve in the admin app. A token-protected gallery endpoint tells the website what to show; approved videos are served publicly with Range support.

**Tech Stack:** Next 16, Drizzle + Postgres (RLS, three DB roles), vitest, sharp, ffmpeg/ffprobe, `@aws-sdk/client-s3` for R2. Spec: `docs/superpowers/specs/2026-10-07-business-videos-design.md`.

Test commands (run from the named directory):
- Unit: `pnpm vitest run <file>` in `apps/platform`, `apps/admin`, `packages/shared`, `packages/db`.
- DB integration: `pnpm vitest run --config vitest.integration.config.ts <file>` in `packages/db` (local Postgres, already migrated with `pnpm db:migrate:test` from the repo root after a new migration).
- Final: `pnpm lint`, `pnpm typecheck`, `pnpm build` from the repo root.

---

### Task 1: Shared video rules (`packages/shared/src/lib/directory/videos.ts`)

Browser-safe constants and one pure checker, used by the page, the route and the tests.

**Files:** Create `packages/shared/src/lib/directory/videos.ts` and `videos.test.ts` beside it.

Interface:
```ts
export const VIDEO_SLOTS = [1, 2, 3] as const;
export type VideoSlot = (typeof VIDEO_SLOTS)[number];
export const VIDEO_MAX_SECONDS = 16;
export const VIDEO_SECONDS_TOLERANCE = 0.5;          // server accepts up to 16.5 s
export const VIDEO_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const VIDEO_OUTPUT_MAX_SIDE = 1280;
export const VIDEO_UPLOAD_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export function parseVideoSlot(value: unknown): VideoSlot | null;   // accepts "1".."3" or 1..3
export function videoTooLongMessage(seconds: number): string;       // "That video is 23 seconds. The limit is 16."
export const VIDEO_PREMIUM_MESSAGE: string;
export const VIDEO_TOO_LARGE_MESSAGE: string;
```

Tests: `parseVideoSlot("2")` is 2; `"0"`, `"4"`, `"x"`, `null`, `2.5` are null; `videoTooLongMessage(23.4)` names 23 seconds and the limit 16.

- [ ] Write the tests, run to see them fail, implement, run to see them pass.

### Task 2: Database (`packages/db`)

**Files:** Create `src/schema/directory-videos.ts` (export from `src/schema/index.ts`), `src/queries/directory-videos.ts` (export from the package index the way `directory-pictures` is), migrations `0092_directory_videos.sql` (drizzle-kit) and `0093_directory_videos_grants.sql` (custom), `src/directory-videos.integration.test.ts`.

Table `directory_videos`: `id uuid pk`, `business_id uuid fk`, `slot smallint check 1..3`, `video_key text`, `poster_key text` (both checked equal to `t/{business_id}/{id}/video` and `/poster`), `video_mime text`, `poster_mime text`, `bytes int`, `poster_bytes int`, `width int`, `height int`, `duration_ms int`, `sha256 text`, `poster_sha256 text`, `status directory_picture_status` (reused enum), `decided_at`, `decided_by_user_id`, `uploaded_by_user_id`, `created_at`, `removed_at`. Same three partial unique/index rules as pictures (one live per business+slot, one waiting per business+slot, staff queue index). Grants like 0070: `fynix_app` SELECT with the tenant policy, `fynix_staff` SELECT/INSERT/UPDATE with an all policy, no DELETE.

Queries (all mirror `directory-pictures.ts`; the staff-connection ones take `Database`):
```ts
newDirectoryVideoId(): string
listDirectoryVideos(db, businessId): DirectoryVideo[]
findOwnDirectoryVideoFile(db, businessId, videoId, part): DirectoryVideoFile | null   // part: "video" | "poster"
recordDirectoryVideo(db, input): { kind: "recorded"; video; replacedKeys: string[] } | { kind: "no-claim" } | { kind: "not-member" }
removeDirectoryVideo(db, { businessId, slot, now }): string[]                          // keys, both files
decideDirectoryVideo(db, { videoId, approve, staffId, now }): { kind: "decided"; replacedKeys } | { kind: "not-found" }
takeDownDirectoryVideo(db, videoId, now): string[]
listDirectoryVideosForStaff(db, { status, limit, offset }): { videos; total }
countWaitingDirectoryVideos(db): number
findDirectoryVideoFileForStaff(db, videoId, part): DirectoryVideoFile | null
findLiveDirectoryVideoFile(db, videoId, part): DirectoryVideoFile | null               // approved + claim approved + business kind 'website'
readLiveDirectoryVideos(db, lookup): Map<businessKey, LiveDirectoryVideo[]>            // slot order
```
`recordDirectoryVideo` takes the claim lock first, returns `not-member` unless `businesses.kind = 'website'`, and `no-claim` without a non-rejected claim.

Integration tests (each is its own `it`): record stores a pending video; a free listing account gets `not-member`; no claim gets `no-claim`; a second upload for the slot replaces the waiting one and returns its keys; approving makes it live and returns the replaced live keys; rejecting keeps it for the owner; removal returns both keys; a tenant reads only its own rows (RLS) and cannot write; the live read hides unapproved, removed, claim-not-approved and non-member businesses; staff list is oldest first for pending; slot 4 is refused by the check constraint.

- [ ] Write schema, run `pnpm db:generate` from `packages/db`, check the SQL is only the new table, then `pnpm db:generate --custom --name=directory_videos_grants` and write the grants.
- [ ] Write the failing integration tests, run `pnpm db:migrate:test` (repo root), run to see them fail, implement queries, run to see them pass.

### Task 3: Storage (`packages/shared/src/server/media-storage.ts`)

**Files:** Modify `media-storage.ts` and its test; create `r2-media-storage.ts` and test; modify `media-serving.ts` and its test.

- `MEDIA_VARIANTS` becomes `["display", "video", "poster"]`.
- `MediaStorage` gains `publicUrl(key: string): string | null` (local returns null).
- `createR2MediaStorage({ accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl })` over `@aws-sdk/client-s3`, same key validation as local; `getMediaStorage()` picks R2 when `R2_BUCKET` is set, else local.
- `rangedMediaResponse(storage, asset, { ifNoneMatch, range })` in `media-serving.ts`: 200, or 206 with `Content-Range`, or 416, with `Accept-Ranges: bytes`; `storedMediaResponse` keeps its behaviour.

Tests: a key with variant `video` builds; `parse range`: `bytes=0-99`, `bytes=100-`, `bytes=-50`, invalid and out-of-range cases; 206 body is the slice and `Content-Length` is its length; R2 `put` sends `PutObjectCommand` with bucket, key, content type (tested against an injected fake client); `publicUrl` joins base and key.

- [ ] Add `@aws-sdk/client-s3` (`pnpm --filter @brandbasket/shared add @aws-sdk/client-s3`), tests first, then code.

### Task 4: Video processing (`apps/platform/lib/server/video-process.ts`)

**Files:** Create `video-process.ts`, `video-process.test.ts`.

```ts
export class VideoRejectedError extends Error { reason: "empty"|"too-large"|"unsupported-type"|"unreadable"|"too-long"|"no-video"|"busy"; retryAfterSeconds: number|null }
export function detectVideoContainer(head: Uint8Array): "mov" | "matroska" | null   // ftyp box -> mov, EBML 1A45DFA3 -> matroska
export function hasVideoCapacity(): boolean
export async function processVideoFile(inputPath: string): Promise<ProcessedVideo>
export interface ProcessedVideo { video: Uint8Array; poster: Uint8Array; width; height; durationMs; sha256; posterSha256 }
```
Env `FFMPEG_PATH` / `FFPROBE_PATH` default to `ffmpeg` / `ffprobe`. Flags: `-nostdin -protocol_whitelist file -f <container> -i in -t 16.5? (no: refuse long first) -vf scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2 -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -profile:v main -threads 1 -c:a aac -b:a 96k -ac 2 -movflags +faststart -fs 12000000`. Poster: one frame at 0.5 s (or 0 if shorter), through sharp to WebP.

Tests (real ffmpeg, generated clips with `-f lavfi -i testsrc`, skipped with `describe.skipIf(!ffmpegAvailable)`): a 3 s 1080p clip comes out H.264 at most 1280 wide with a WebP poster and `durationMs` near 3000; a 20 s clip is `too-long`; a text file is `unsupported-type`; a truncated mp4 is `unreadable`; an audio-only file is `no-video`; a 1920x1080 portrait-rotated clip keeps its aspect; `detectVideoContainer` for mp4, mov and webm headers and garbage.

- [ ] Tests first (generate fixtures in a temp dir inside the test), then code.

### Task 5: Upload route (`apps/platform`)

**Files:** Create `lib/server/listing-videos.ts`, `lib/server/listing-video-request.ts` and test, `lib/server/stream-to-file.ts` and test, `app/api/listing-videos/route.ts`. Modify `lib/uploads/limits.ts` only to import video limits (images stay 4 MB).

- `streamBodyToFile(body, path, maxBytes)`: writes while counting, deletes the partial file and throws `BodyTooLargeError` when over.
- `handleListingVideoRequest(request, deps)`: the same order as `handleListingPictureRequest` (Host, Origin, declared length against 50 MB, `?slot=`, session, `canAddVideos`, capacity, hourly allowance, body to temp file, store). 402 is not used: not a member answers 403 with `VIDEO_PREMIUM_MESSAGE`; no listing is 409.
- `storeListingVideo(deps, tenant, slot, tempPath, now)`: process, put `video` and `poster` under fresh ids, record, delete both files again if the record fails or is refused, delete replaced files after commit.
- `canAddVideos`: not awaiting membership, entry kind is `website`.

Tests (injected deps, no database, like `listing-picture-request.test.ts`): wrong Host 403; wrong Origin 403; no length 411; over 50 MB declared 413; bad slot 400; no session 401; not a member 403 with the Premium message and the body never read; busy 503 with Retry-After and no allowance spent; allowance spent 429; body over limit 413 and temp file gone; success 201 with `{ video: { id, slot, status } }`; a rejected video (too long) answers 422 with its message; the temp file is deleted in every case.

- [ ] Tests first, then code.

### Task 6: Owner page and preview

**Files:** Create `components/panel/business/videos-section.tsx`, `lib/video-upload-client.ts` and test, `app/app-host/listing-videos/[videoId]/route.ts`. Modify `components/panel/business/photos-tab.tsx` (renders the section), `app/app-host/(protected)/business/page.tsx` and `actions.ts` (read videos, `removeVideoAction`), `lib/server/listing-videos.ts` (`getVideosPage`).

- Premium: three tiles (slot 1 to 3). Empty tile: "Add video" button (file input `video/mp4,video/quicktime,video/webm`). Choosing a file checks size and, through a hidden `<video>` element's metadata, the length, before sending; a clear message otherwise. Upload uses `XMLHttpRequest` for a progress bar and a "Making it web-ready…" line once the bytes are sent. A filled tile shows the poster, duration, status ("Waiting for our check", "Live", "We couldn't use this one"), Replace and Remove.
- Free listing account: one locked card: "Videos are part of Premium", short line, button to `/premium`.
- Owner preview route serves the video or poster (`?part=poster`) to the owner only, with Range.

Tests: `video-upload-client` maps each response status to its message (413, 403, 422 with server message, 429/503 with Retry-After, network error); the page view model (`videoTiles(videos, isMember)`) returns locked for a free account, three tiles for a member, and the right status per row.

- [ ] Tests for the pure pieces first; then the components; verify in the browser pane at the end.

### Task 7: Public serving and gallery contract

**Files:** Create `app/api/directory/videos/[videoId]/route.ts`, `app/api/directory/gallery/route.ts`, `lib/server/directory-gallery.ts` and test. Modify `lib/directory-api.ts` (schema: `galleryResponseSchema`, `DIRECTORY_GALLERY_PATH`, `DIRECTORY_VIDEOS_PATH`), `lib/server/directory-intake.ts` (`handleGalleryRequest`).

`directory-gallery.ts` builds the answer: for each asked id/key `{ photos, videos }`, URLs from `storage.publicUrl(key) ?? `${APP_ORIGIN}/api/directory/videos/${id}``. `handleGalleryRequest` follows `handleStatusRequest` (token, at most 50 asked, malformed 400).

Tests: gallery answer lists approved videos in slot order with absolute URLs, falls back to the platform route when the storage has no public URL, leaves unapproved ones out, caps photos to the six gallery slots in order; the intake refuses without a token (401), with a malformed id (400), with more than 50 (400); the videos route answers 200/206/416/404 and sets `Cross-Origin-Resource-Policy: cross-origin`.

- [ ] Tests first, then code.

### Task 8: Staff approval (`apps/admin`) — delegated

Files in `apps/admin` only. The Ads page already reviews pictures (`app/(protected)/ads/page.tsx`, `actions.ts`, `app/directory-pictures/[pictureId]/route.ts`); add a **Videos** section there: waiting videos oldest first with an inline player (poster, controls, Range-capable admin route `app/directory-videos/[videoId]/route.ts`), Approve and Refuse buttons (`decideDirectoryVideo`, delete replaced files after commit), and a Take down button for live ones; the count of waiting videos joins the existing waiting-pictures count where the console shows it. Mirrors the pictures code and tests.

### Task 9: Public page (`website-ads`) — delegated

Files in `/Users/siddiqueahmed/Desktop/AI/fynix-platform/website-ads` only. Add `DIRECTORY_GALLERY_PATH` and the schema to the website's copy of `lib/directory-api.ts`, a cached fetch of the gallery for the business page, and in `components/local/business-page.tsx` / `pages.tsx` extend the gallery: the owner's gallery photos join the mosaic, and video tiles (poster, play icon, duration) open a viewer (`<dialog>`, `<video controls playsInline preload="none" poster>`, Escape closes, focus returns). Nothing for a business with no gallery. Tests for the mapping and rendering helpers.

### Task 10: Deploy notes and examples

- `.env.example`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `FFMPEG_PATH`, `FFPROBE_PATH`.
- `docs/deployment/digitalocean.md`: the `apt install ffmpeg` step, nginx `location /api/listing-videos { client_max_body_size 55m; proxy_read_timeout 120s; }`, the R2 bucket and custom domain steps.
- [ ] Final checks: `pnpm lint`, `pnpm typecheck`, `pnpm build`, all touched test files, and a browser run on :3081.

## Self-review

- Spec coverage: Premium-only (Task 2 `not-member`, Task 5 403, Task 6 locked card); 3 videos (slot check); 16 s (Task 1, Task 4); size (Task 5); approval (Tasks 2, 8); R2 (Task 3); gallery on the page (Tasks 7, 9); Range (Tasks 3, 7); safety (Task 4); deploy (Task 10).
- Names used across tasks: `parseVideoSlot`, `VIDEO_*`, `recordDirectoryVideo`, `processVideoFile`, `storeListingVideo`, `handleListingVideoRequest`, `readLiveDirectoryVideos`, `findLiveDirectoryVideoFile`, `DIRECTORY_GALLERY_PATH`.
