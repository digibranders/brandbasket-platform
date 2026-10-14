# Business profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the free listing account's Listing and Photos pages into one **Business profile** page with Details / Photos / Listing / Review tabs. The Listing tab gives the business its Business ID, and Publish puts it live as "Claimed" with no call from us.

**Architecture:**
- The Details fields live in a new `directory_business_profiles` row, the single home of what the owner types.
- The directory claim (created on the Listing tab, with its place id from `createPlatformPlace`) mirrors name, address, phone and website, which the feed reads.
- Publish approves the owner's own added claim through the same place-approval path staff use.
- All writes go through the staff connection after `requireCustomerAccess`. Reads go through the tenant scope.

**Tech Stack:** Next 16 (app router, server actions, `useActionState`), Drizzle + Postgres (RLS roles `webfold_app` / `webfold_staff`), Vitest (unit, plus integration against `webfold_ads_test`), Tailwind tokens from `packages/shared/src/styles/theme.css`.

Spec: `docs/superpowers/specs/2026-10-01-business-profile-design.md`. The checkout is `directory-ads`, chosen by the user over `login-logo`, because place ids already live here. login-logo's new look was ported in on 2026-10-01.

**Rules for every task:**
- Never commit (the user's standing rule).
- Owner forms post only the fields they show (`ownerFormCheck`).
- No `any`. Explicit return types.
- Migrations 0080/0081 are reserved with the "Search bar length reduction" session, and 0079 stays free.

---

## File map

**DB**
- Create `packages/db/src/schema/directory-business-profiles.ts`, the `directoryBusinessProfiles` table, and export it from `schema/index.ts`.
- Modify `packages/db/src/schema/directory-ads.ts` to add `publishedAt` on `directoryClaims`.
- Create `packages/db/migrations/0080_business_profiles.sql` (DDL) and `0081_business_profiles_grants.sql` (grants and RLS), plus their journal entries and snapshots via `pnpm --filter @firstfold/db db:generate`, renamed.
- Create `packages/db/src/queries/directory-business-profiles.ts`:
  - `findBusinessProfile`
  - `saveBusinessDetails` (profile upsert, plus mirroring to the claim and to `businesses.name`)
  - `setFeaturedVideo`
- Modify `packages/db/src/queries/directory-ads.ts`:
  - add `publishAddedBusiness`
  - add `publishedAt` to `DirectoryClaim`
  - `addBusinessListing` and `updateAddedBusinessListing` stay as they are
- Modify `packages/db/src/queries/directory-pictures.ts`:
  - `recordDirectoryPicture` allows a listing account with no claim
  - the `listing` slot is recorded as approved, replacing the live one
- Create the integration test `packages/db/src/directory-business-profiles.integration.test.ts`.

**Platform: pure (unit-tested)**
- `apps/platform/lib/maps-link.ts`: `parseMapsLink(text)` → `{ ok, url, pin }`.
- `apps/platform/lib/youtube-video.ts`: `youtubeVideoId(text)` → the id or null; `youtubeThumbnail(id)`.
- `apps/platform/lib/business-details-form.ts`: `parseBusinessDetailsForm(formData)` → `BusinessDetailsInput` or a field error. It reuses the name rules from `add-business-form.ts` (export `readBusinessName`), and `parseListingWebsite`.
- `apps/platform/lib/business-listing-form.ts`:
  - `DISTRICTS`, `districtAreaOptions()` (label "Naupada · Thane", value = area slug), `cityOfArea(slug)`
  - `listedAtAddress({areaSlug, categorySlug})` segments for `/in/mh/thane/{area}/{category}`
  - `parseBusinessListingForm(formData)`
- `apps/platform/lib/business-profile.ts`:
  - `PROFILE_TABS`
  - `profileProgress(state)` → which tabs are complete, `missingForPublish`, `canPublish`
  - `openingTab(state, asked)`
  - `displayBusinessId(id)` (upper-cases it)

**Platform: server**
- `apps/platform/lib/server/business-profile.ts`:
  - `getBusinessProfilePage(customer)`: claim, profile, hours, pictures
  - `saveOwnDetails`, `saveOwnListing` (adds or updates the claim from the profile and the picks), `setOwnVideo`, `publishOwnBusiness`
- `apps/platform/lib/server/google-business.ts`:
  - `googleBusinessConfigured()`, `googleAuthUrl(state)`
  - `exchangeCode(code)`, `fetchLocations(token)`
  - `toImportedDetails(location)`
- `apps/platform/lib/server/google-import-cookie.ts`: seals and opens the imported-locations cookie (AES-256-GCM, key from `BETTER_AUTH_SECRET` through HKDF).
- `apps/platform/app/api/google-business/connect/route.ts` and `callback/route.ts`.
- `apps/platform/lib/server/env.ts`: optional `GOOGLE_BUSINESS_CLIENT_ID` and `GOOGLE_BUSINESS_CLIENT_SECRET`.

**Platform: UI**
- `apps/platform/app/app-host/(protected)/business/page.tsx` is rewritten as the tabbed page, and `actions.ts` gets the new actions.
- `apps/platform/components/panel/business/` gains:
  - `profile-tabs.tsx`
  - `details-form.tsx` (client), `google-import.tsx`
  - `photos-tab.tsx`, `video-form.tsx`
  - `listing-form.tsx` (client: district → area → category)
  - `review-tab.tsx`
- `listing-account-shell.tsx`: the nav becomes Business profile · Advertise · Billing · Premium.
- `app/app-host/(protected)/photos/page.tsx` redirects to `/business?tab=photos`.
- The advertise page shows the ad picture card, moved from Photos.

---

### Task 1: DB schema and migrations

- [ ] Add `directory_business_profiles` with these columns, checks and FK:

  | Column | Type | Check |
  | --- | --- | --- |
  | `business_id` | uuid, PK | FK businesses |
  | `street_address` | text | 1–200 characters, trimmed, no newline |
  | `phone` | text | `^\+[0-9]{8,15}$` |
  | `whatsapp` | text | same pattern, null allowed |
  | `maps_url` | text | `^https://` and ≤ 500 |
  | `latitude`, `longitude` | double precision | both or neither |
  | `website_url` | text | the same check as the claim's |
  | `about` | text | 1–500 characters, trimmed |
  | `youtube_video_id` | text | `^[A-Za-z0-9_-]{11}$` |
  | `created_at`, `updated_at` | | |

- [ ] Add `directory_claims.published_at timestamptz` with the check `published_at is null or status <> 'pending'`.
- [ ] Generate with drizzle-kit, rename to `0080_business_profiles`, and write `0081_business_profiles_grants.sql` by hand:
  - `GRANT SELECT` to `webfold_app`, and `SELECT, INSERT, UPDATE` to `webfold_staff`
  - enable RLS
  - add a tenant-read policy and a staff-all policy, the same as 0070
- [ ] Run `pnpm db:migrate` and `pnpm db:migrate:test` (both `webfold_ads` databases).

### Task 2: DB queries (TDD, integration)

- [ ] Tests first, in `directory-business-profiles.integration.test.ts`:
  - saving details with no claim writes only the profile and `businesses.name`
  - with a pending added claim it also updates the claim's name, address, phone and website
  - with a rejected claim it is refused
  - `publishAddedBusiness`:
    - approves, sets `published_at` and locks the place URL
    - refuses `claimed`, `rejected`, already-published, and an unconfirmed owner
  - pictures:
    - the `listing` slot records as approved and retires the old live one
    - an upload with no claim is allowed for a listing account
- [ ] Implement, then run `pnpm --filter @firstfold/db test:integration -- directory-business-profiles`.

### Task 3: Pure platform libs (TDD, unit)

- [ ] `maps-link.test.ts` covers:
  - full links with `@19.19,72.97,17z`
  - `?q=19.19,72.97`
  - `!3d19.19!4d72.97`
  - `maps.app.goo.gl/x`, which gives no pin
  - a non-Google host is refused
  - `http` is upgraded to `https`
  - a pin outside India is dropped
- [ ] `youtube-video.test.ts` covers the watch, youtu.be, shorts, embed and m. forms, plus junk.
- [ ] `business-details-form.test.ts` covers:
  - required name, address and phone
  - WhatsApp "same" vs a typed number
  - extra fields refused
  - about > 500
- [ ] `business-listing-form.test.ts` covers an unknown district, area or category, and that `cityOfArea` is right.
- [ ] `business-profile.test.ts` covers tab completeness, the publish blockers, and the opening tab.

### Task 4: Server layer and actions

- [ ] `lib/server/business-profile.ts`, wiring the queries with `getStaffDb()` / `withTenantScope(getAppDb())`.
- [ ] `business/actions.ts`: `saveDetailsAction`, `saveListingAction`, `saveVideoAction`, `removeVideoAction`, `publishAction`, `useImportAction` / `discardImportAction`. Each one:
  1. calls `requireCustomerAccess({ listingAccount: "allow" })`
  2. parses the form
  3. calls the server function
  4. revalidates and redirects to `/business?tab=…&notice=…`

### Task 5: UI

- [ ] Tabs, the four tab bodies, the nav change, the `/photos` redirect, and the ad picture moved to Advertise.

### Task 6: Google import

- [ ] The env vars, the cookie sealing (unit test: a round trip, plus tampering refused), the routes, and the import UI. Without keys the button is disabled with "Not connected yet".

### Task 7: Verify

- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, the platform build, and the db integration tests.
- [ ] Point the `logo-platform` launch entry (:3131) at directory-ads.
- [ ] Browser e2e on a fresh free listing account: Details → Photos → Listing (Business ID shown) → Review → Publish → status "Live · Claimed" → the feed contains the business.
