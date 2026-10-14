-- Read-only pre-flight for the place_id backfill (migration 0077, `pnpm directory:backfill-places`; Task 6 of
-- docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md). Run it on production with psql as any role
-- that can read the directory tables, and paste the output into the PR:
--
--   psql "$DATABASE_URL_STAFF" -f packages/db/scripts/preflight-directory-place-ids.sql
--
-- It writes nothing: the whole file runs in a READ ONLY transaction that is rolled back. Part 1 works before
-- anything is deployed; part 2 needs 0075 to 0077 and `pnpm directory:import-places`. Part 2 lists what will make the
-- backfill refuse (two client listings, or two approved claims, on one business), the client addresses that belong to
-- another business, and how many reviews, daily counts and verifications it will merge. The merge counts use the
-- open-data keys alone, so client takeovers can add a few; the backfill script prints the exact numbers.

BEGIN TRANSACTION READ ONLY;

-- Part 1: before the deploy.
SELECT 'reviews from one phone on more than one key (may meet on one place)' AS check, count(*) AS rows FROM (
  SELECT phone FROM directory_reviews GROUP BY phone HAVING count(DISTINCT listing_key) > 1) x
UNION ALL SELECT 'client listings with replaces_source_path', count(*) FROM directory_listings WHERE replaces_source_path IS NOT NULL
UNION ALL SELECT 'client listings with previous paths', count(*) FROM directory_listings WHERE cardinality(previous_paths) > 0
UNION ALL SELECT 'approved claims', count(*) FROM directory_claims WHERE status = 'approved'
UNION ALL SELECT 'owner-added claims', count(*) FROM directory_claims WHERE origin = 'added';

-- Part 2: after 0077 and directory:import-places, before directory:backfill-places. A client listing's place is the
-- business its replaces_source_path names; elsewhere a row's place is the one its listing key names.

-- Two client listings replacing one business: the backfill refuses (DuplicateClientListingsError). Must be empty.
SELECT k.place_id, array_agg(l.business_id ORDER BY l.business_id) AS business_ids
FROM directory_listings l
JOIN directory_place_legacy_keys k
  ON k.listing_key = regexp_replace(l.replaces_source_path, '^/in/([^/]+)/[^/]+/([^/]+)/([^/]+)/([^/]+)$', '\1/\2/\3/\4')
GROUP BY k.place_id
HAVING count(*) > 1;

-- Client listings whose own address belongs to a different directory business than the one they replace (or than
-- the place they already have). One that replaces nothing takes over an open-data business at its own address,
-- unless another listing takes that business; otherwise the address and its reviews stay with the other business.
-- Check each is meant.
SELECT l.business_id, l.category_slug || '/' || l.city_slug || '/' || l.area_slug || '/' || l.slug AS address, k.place_id AS owned_by
FROM directory_listings l
JOIN directory_place_legacy_keys k ON k.listing_key = l.category_slug || '/' || l.city_slug || '/' || l.area_slug || '/' || l.slug
LEFT JOIN directory_place_legacy_keys replaced
  ON replaced.listing_key = regexp_replace(l.replaces_source_path, '^/in/([^/]+)/[^/]+/([^/]+)/([^/]+)/([^/]+)$', '\1/\2/\3/\4')
WHERE replaced.place_id IS DISTINCT FROM k.place_id
  AND k.place_id IS DISTINCT FROM l.place_id;

-- Two approved claims on one place, counting the client takeovers: the backfill refuses
-- (DuplicateApprovedClaimsError). Must be empty; staff reject all but one claim per place first.
WITH key_places AS (
  SELECT listing_key, place_id FROM directory_place_legacy_keys
  UNION
  SELECT l.category_slug || '/' || l.city_slug || '/' || l.area_slug || '/' || l.slug, replaced.place_id
  FROM directory_listings l
  JOIN directory_place_legacy_keys replaced
    ON replaced.listing_key = regexp_replace(l.replaces_source_path, '^/in/([^/]+)/[^/]+/([^/]+)/([^/]+)/([^/]+)$', '\1/\2/\3/\4')
)
SELECT kp.place_id, array_agg(c.id ORDER BY c.id) AS claim_ids
FROM directory_claims c
JOIN key_places kp ON kp.listing_key = c.listing_key
WHERE c.status = 'approved'
GROUP BY kp.place_id
HAVING count(*) > 1;

-- What the backfill will merge (by the open-data keys alone; client takeovers can add a few more).
SELECT 'published reviews to hide (same phone, same place)' AS check, coalesce(sum(n - 1), 0) AS rows FROM (
  SELECT count(*) AS n FROM directory_reviews r JOIN directory_place_legacy_keys k ON k.listing_key = r.listing_key
  WHERE r.status = 'published' GROUP BY k.place_id, r.phone HAVING count(*) > 1) x
UNION ALL SELECT 'daily count rows to add up (same place, day, kind)', coalesce(sum(n - 1), 0) FROM (
  SELECT count(*) AS n FROM directory_daily_counts d JOIN directory_place_legacy_keys k ON k.listing_key = d.listing_key
  GROUP BY k.place_id, d.day, d.kind HAVING count(*) > 1) x
UNION ALL SELECT 'verifications to remove (same place)', coalesce(sum(n - 1), 0) FROM (
  SELECT count(*) AS n FROM directory_verifications v JOIN directory_place_legacy_keys k ON k.listing_key = v.listing_key
  GROUP BY k.place_id HAVING count(*) > 1) x;

-- Keys no place knows yet (a dead or renumbered open-data URL, a client's own address, an owner-added business). The
-- backfill registers client and owner-added addresses; anything else here stays NULL and is reported by the script.
SELECT listing_key, count(*) AS rows FROM (
  SELECT listing_key FROM directory_reviews
  UNION ALL SELECT listing_key FROM directory_review_otps
  UNION ALL SELECT listing_key FROM directory_enquiries WHERE listing_key IS NOT NULL
  UNION ALL SELECT listing_key FROM directory_verifications
  UNION ALL SELECT listing_key FROM directory_daily_counts
  UNION ALL SELECT listing_key FROM directory_claims
  UNION ALL SELECT listing_key FROM directory_staff_ads
  UNION ALL SELECT listing_key FROM directory_ad_bids
  UNION ALL SELECT listing_key FROM directory_ad_wins
) keyed
WHERE NOT EXISTS (SELECT 1 FROM directory_place_legacy_keys k WHERE k.listing_key = keyed.listing_key)
GROUP BY listing_key
ORDER BY listing_key
LIMIT 50;

ROLLBACK;
