# Listing pictures: upload, crop to the layout, staff check

Follows `2026-09-30-directory-ads-auction-design.md` and `2026-09-30-add-my-business-design.md`, which both left
pictures out. Until now a listing had no picture of its own: list rows and the business page show the category's line
drawing, and the side ad cards show a stock photo of the category's family.

The user's ask (2026-09-30): "when someone is listing their business, the images of it: they have the option to
resize and crop it according to our layout". Chosen scope: **listing photo + ad picture**.

## What the owner does

A free listing account gets a **Photos** page in its dashboard.

1. **Listing photo** (square). Shows beside the name on list rows, on the sponsored first row and on the business
   page, in place of the line drawing.
2. **Ad picture**. One photo, cropped twice: **tall** for side spot 1 and **wide** for side spot 2, in place of the
   stock photo. Which spot a business wins is decided by the auction, so both shapes are always made.

Choosing a photo opens the crop window before anything is sent. The frame has the slot's shape and cannot be changed.
The owner drags the photo to move it and zooms with the slider, the wheel, a pinch or the keyboard. "Preview" shows the finished picture and its size, and "Upload" sends
it; the ad picture asks for the tall crop, then the wide one.

A new picture waits for a staff check. Until it is approved the website keeps showing what it showed before: the
previous approved picture if there is one, otherwise the drawing or stock photo. The owner sees "Waiting for our
check", "Showing" or "Not accepted" on each picture, and can replace or remove it at any time.

## Shapes

The three slots and the size each is stored at. The browser crops to the shape; the server re-encodes to exactly this
size whatever it is sent, so a picture that reaches the website always fits its slot.

| Slot | Shape | Stored | Where it shows |
| --- | --- | --- | --- |
| `listing` | 1 : 1 | 640 × 640 | list row, sponsored row, business page |
| `ad_tall` | 8 : 9 | 960 × 1080 | side ad spot 1 |
| `ad_wide` | 8 : 5 | 960 × 600 | side ad spot 2 |

The crop may be enlarged at most 2×: the zoom stops where the cropped area would be under half the stored size, and a
photo too small for even the unzoomed crop is refused with its minimum size.

## Rules

- Only a listing account with a claim that is pending or approved may upload. No claim sends the owner to `/business`;
  a rejected claim is refused.
- One live (approved) picture and at most one waiting or refused picture per business and slot. A new upload replaces
  the waiting one. Approving a picture replaces the live one. Removing takes down both.
- A picture shows on the website only while it is approved, not removed, and its business's claim is approved.
- The customer writes nothing directly, as with claims and bids: uploads, removals and decisions run on the staff
  connection after the platform has checked who is asking. The customer reads its own rows through row-level security.
- Files go through the same checks as onboarding uploads: real image signature, 4 MB, pixel ceiling, decode queue,
  hourly budget, metadata stripped by re-encoding to WebP.
- An `added` business has no page on firstfold.io yet, so its pictures have nowhere to show; the Photos page says so.

## How the website gets them

- `GET /api/directory/status` entries gain `photo` (a picture id or null).
- `GET /api/directory/ads` entries gain `pictures: { photo, tall, wide }` (ids or null).
- `GET /api/directory/pictures/<id>` (new, same bearer token) streams an approved picture.
- The website serves it to browsers from its own origin at `/api/directory-picture/<id>` (its CSP allows images from
  `self` only). An id names one file for ever and a new upload gets a new id, so a cached copy is never stale;
  browsers keep it for a day and the CDN for an hour, which bounds how long a picture staff took down can still be
  fetched by someone who kept its address.

All three contract changes are additive and optional, so an older website or platform keeps working.

## Known limits

- For up to two minutes after an approved picture is replaced or taken down, a page may still name the old picture
  (the feeds are cached for a minute on each side). A visitor whose browser has not kept the old file sees the empty
  slot, not a broken page, until the cache turns over.
- The listing photo travels with the verified status, so it shows on list rows and the business page only while the
  listing is verified. Approving a claimed listing verifies it; if staff later remove the verification, the photo
  goes with the tick.
- The two ad shapes are two uploads. If the second fails, the Photos page says one shape is missing and asks for the
  photo again.
- The server does not refuse a picture smaller than the crop window's minimum: it enlarges it to the slot's size.
  The crop window is what holds owners to the 2× limit; staff see every picture before it shows.

## Out of scope

- Pictures for ads placed by staff and for paying clients' Featured listings (the table is keyed by business, so both
  can use it later).
- A photo gallery on the business page.
- Free-form crops, rotation, filters.

## Pieces

| Piece | Where |
| --- | --- |
| Slots, shapes, labels | `packages/shared/src/lib/directory/pictures.ts` |
| Table, enums | `packages/db/src/schema/directory-pictures.ts`, migrations 0069 (DDL), 0070 (grants) |
| Queries | `packages/db/src/queries/directory-pictures.ts` |
| Crop geometry (pure) | `apps/platform/lib/uploads/crop-geometry.ts` |
| Crop to a file (browser) | `apps/platform/lib/uploads/crop-image.ts` |
| Crop window | `apps/platform/components/panel/pictures/image-cropper.tsx` |
| Photos page | `apps/platform/app/app-host/(protected)/photos`, `components/panel/pictures/picture-slots.tsx` |
| Upload route | `apps/platform/app/api/listing-pictures`, `lib/server/listing-picture-request.ts`, `lib/server/listing-pictures.ts` |
| Exact-size re-encode | `apps/platform/lib/server/media-upload.ts` (`processUpload` takes a size) |
| Owner's own picture | `apps/platform/app/app-host/listing-pictures/[pictureId]` |
| Website feed | `apps/platform/lib/directory-api.ts`, `lib/server/directory-intake.ts`, `app/api/directory/pictures/[pictureId]` |
| Staff check | `apps/admin/app/(protected)/ads` (Pictures section), `apps/admin/app/directory-pictures/[pictureId]` |
| Website | `website-ads`: contract copy, `lib/server/directory-client.ts`, `app/api/directory-picture/[id]`, list row, sponsored row, business page, ad cards |

## Tests

Unit: crop geometry (cover fit, zoom limits, clamping, pan, too-small photos), upload request checks, exact-size
re-encode, staff view parsing, website ad and status mapping. Integration (test database): one waiting picture per
slot, approval replaces the live one, removal, row-level security, only approved pictures of approved claims are
served. Browser: choose a photo → crop → upload → staff approve → shows on the website.
