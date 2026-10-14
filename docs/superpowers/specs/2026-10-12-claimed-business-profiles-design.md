# Claimed businesses get their owner's profile on the page (2026-10-12)

## The problem

An owner who claims a business the directory already had (a claim, `directory_claims.origin = 'claimed'`) could edit about 17 Business profile fields in the dashboard, and none reached the public page. Only an owner who *added* a business (origin `added`) had a path (`feed.added[].profile`). Found by the dashboard-to-website check of 2026-10-12.

## What changes

- **Feed** (`GET /api/directory/listings`): a new additive `claimed[]`, one `{ id: <place id>, profile }` per approved claim with a place, built with the same `buildAddedProfile` as an added business (about, hours, closures, services, products, FAQ, socials, year, payment methods, licences, page tabs, gallery). `listApprovedClaimedBusinesses` (db) picks them; closing accounts and claims with no place are left out.
- **Website**: `mergeFeed` returns `profiles` by id; `current()` in `lib/server/local-listings.ts` lays each over the open-data row with that id. The row keeps its name, address, place, URL and source. A client's listing or an added business holding the same id wins, and the claimed profile is ignored.
- **What stays the directory's**: name, address and phone. Staff checked them when they approved the claim, and the security audit (2026-10-08) flagged self-verification, so a claimed owner cannot change what Fynix vouches for. The Identity form shows name and number read-only, drops the address and directions-link fields, and the save keeps the claim's number and name whatever is posted (`saveBusinessDetails`).
- **Ads**: a claimed page keeps its ad spots. `carriesAds` is now "no profile, or not a business the platform sent", so only a Premium member's or added business's page is ad-free, as before.
- **Migration 0133** (folded in, unreleased): `directory_business_profiles.street_address` becomes nullable, because a claimed profile has no address of its own. `findDirectoryProfile` still reads it as `""`.

## Freshness

The website re-reads the feed once a minute, so an edit shows in about a minute (measured 37–45 s). No tag-based refresh is added.

## Not done

- Claimed owners' dead fields (email, directions note, payment methods, licence text, Contact options) are still dead for every kind of business.
- The sitemap and `noindex` rule still keep claimed pages out of search (lib/directory-sitemap.ts, pages.tsx).
- A claim with no place id yet gets no profile on the page until the place backfill reaches it.
