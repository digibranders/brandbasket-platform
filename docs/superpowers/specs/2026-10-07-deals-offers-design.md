# Deals and offers: design (2026-10-07)

Owners post deals from the customer dashboard; the website shows them. Today the website's deals section (home option B, design D "poster stories") shows only marked samples, and nothing in the dashboard can create a deal.

## Decisions (user, 2026-10-07)

- **Who posts:** every owner with a listing, free or Premium.
- **Approval:** none. A deal is live on save; staff can take it down afterwards.
- **Fields:** title, badge (e.g. "20% off"), terms line, optional photo, start date, end date.
- **Shown on:** the home deals section (by area), the business's own profile page ("Current offers"), and an "Offer" tag on category/area listing cards.

## Data

Migration `0095_directory_deals.sql` (table, grants and RLS in one file, like `0094`). Drizzle schema `packages/db/src/schema/directory-deals.ts`.

`directory_deals`: `id`, `business_id` (owner's business; its place comes from its claim), `title` (<= 60), `badge` (<= 20), `terms` (<= 90), `starts_on`, `ends_on` (date; `ends_on >= starts_on`), `status` enum `live | taken_down`, `taken_down_reason`, `created_at`, `updated_at`.

"Active" = `status = 'live'` and today within `starts_on..ends_on`. Expiry is derived at read time; no job needed.

Limits (guards abuse, no approval step): max 5 live deals per business; max 90 days span.

## Platform (apps/platform)

- Page `app/app-host/(protected)/deals/page.tsx`, components in `components/panel/deals/`, path const `lib/deals.ts` (pattern: leads).
- Nav: add "Deals" to `LISTING_ACCOUNT_NAV` (`listing-account-shell.tsx`) and, for Premium, a `deals` key in `lib/listing-sections.ts` + `LISTING_NAV` in `customer-shell.tsx`. Check `proxy.ts` / `proxy.test.ts` for the route.
- Server `lib/server/deals.ts`: `listOwnDeals`, `createDeal`, `updateDeal`, `endDeal`; owner resolved by `requireCustomerAccess()` and `withTenantScope`. Validation with zod at the boundary.
- Photo: reuse the picture upload/crop flow (`listing-pictures.ts`, `image-cropper`); new slot `deal` goes live at once (like `listing`/`banner`).
- Feed: `app/api/directory/deals/route.ts` + `lib/server/directory-deals-feed.ts` returning active deals (area, category, place id), cached ~60s like the listings feed.

## Admin (apps/admin)

A "Deals" list (live ones, newest first) with a Take down action + reason, next to the Ads page. `takeDownDirectoryDeal` in `packages/db`.

## Website (website-listing)

- `lib/server/directory-client.ts`: `fetchDeals`.
- `dealsOf(data)` in `components/home-options/shared.tsx` returns real active deals for the visitor's area; samples only when the demo switch is on; invitation (`DealsInvite`) when none.
- Business profile page (`app/(marketing)/in/mh/business/[name]/[code]/page.tsx`): "Current offers" strip.
- Listing cards (`components/local/*`): small "Offer" tag.

## Built differently from the first draft

- A deal is shown only once the business's claim is **approved** (an unverified owner cannot put an offer on a listing).
- The poster shows the offer line and photo only; the stamp (badge) appears on the business page card.
- Deal photo upload is **not built yet** (posters use the category photo).

## Out of scope

Claim codes and redemption counts, staff pre-approval, push/WhatsApp notices of new deals.

## Build order

1. Migrations + schema + db helpers (tests).
2. Platform server + Deals page + nav.
3. Feed route.
4. Admin take-down.
5. Website: home, profile strip, card tag.
6. End-to-end test: create as free owner, see on all three places, take down in admin, expiry.
