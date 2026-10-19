# Directory Listings in the Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every open-data and surveyed business on the /in directory (37,324 Thane rows today) lives in the platform's Postgres database. The website reads them from the platform instead of from `content/local/thane-listings.json` and `thane-site-phones.json`, so a data change goes live without a website redeploy.

**Architecture:**
- **Platform.**
  - A new `directory_open_listings` table (named apart from the existing `directory_listings`, the paying clients' table from 0053) holds one row per business: name, category, area, address, map point, website, source, and the shown phone with where it came from. Each row is keyed by its permanent place id in `directory_places`.
  - The table already carries the Postgres full-text search column and indexes chosen on 2026-10-01 (tsvector + pg_trgm), so the state-wide plan can query it without another table change.
  - An import (`pnpm directory:import-listings`) loads the dataset build's output into it.
  - Two server-to-server routes, with `LEADS_API_TOKEN`, hand the website the visible listings: a cheap version check and a paged snapshot.
- **Website.**
  - A new loader keeps the snapshot in memory, refreshed at most once a minute and only when the version changes. That is the same pattern as today's platform feed (`lib/server/platform-listings.ts`).
  - `local-listings.ts` and `site-phones.ts` read the snapshot when `DIRECTORY_LISTINGS_SOURCE=platform`, and the JSON files otherwise.
  - Every page, search and lookup keeps working unchanged: the 21 sync call sites, the MiniSearch engine and the merge with the platform feed.
- **Why the snapshot step comes first.** Today every directory lookup is sync over an in-memory array (21 call sites in 12 files). Turning each into an async database query is the state-wide plan's job, where 383k rows make it necessary. This plan moves the data and the source of truth first, with no change to how pages behave.

**Tech Stack:**
- Platform (`directory-ads`): Next 16.3, Drizzle 0.45 + Postgres 16 (14 locally), vitest, pnpm workspaces.
- Website (`website-listing`): Next 16, zod 4, vitest.

**Repos and where work happens**
- **Platform:** `directory-ads`, branch `feat/directory-ads`, clean at `7d3b7c1`. Do Part A in a fresh worktree off it.
- **Website:** the `website-listing` worktree. It holds **uncommitted work from other sessions**: the survey import, location detection, ranking and more. Re-read every file before editing it, and never revert lines you didn't write.
- **No commits.** The user commits on request ([[no-commits-without-ask]]). Each task ends with a checkpoint (run the checks), not `git commit`.

**Migration numbers.**
- 0079 is reserved, for the permanent-id contract migration.
- 0084–0086 are the India-wide plan's PIN-code migrations and 0087 is `0087_business_profile_sections` (both on development).
- This plan uses **0088, 0089 and 0090**. The migrator allows gaps (0079 is one already) but refuses a journal that doesn't match the files, so fix `meta/_journal.json` tags exactly as Task 2 says.

**Overlap with the India-wide plan.** It also edits `lib/server/local-listings.ts` and moves `app/(marketing)/in/mh/**` to `in/[state]/**`. Whichever lands second re-reads those files. This plan touches only `staticListings()`, the `Merged` cache key and `loadPlatformListings()`, never the routes.

**Decisions taken in chat on 2026-10-06, not to be re-asked:**
- Listings belong in the database, not in website files.
- Pages keep their caching. Load stays small: only a version check per minute per server instance, and a full snapshot read only when data changed.
- Postgres full-text search powers search in the **state-wide** step. Thane keeps the in-memory MiniSearch for now.

**Out of scope (separate plans):**
- Staff editing listings in the console.
- Per-request database queries and Postgres search on the website (state-wide plan).
- Moving `thane-places.json` / `thane-taxonomy.json`. Both are small, shipped to the browser for the header search, and change only with the dataset build.
- Maharashtra data.

---

## File map

**Platform: `directory-ads`**

| File | Change | Responsibility |
|---|---|---|
| `packages/db/scripts/import-directory-places.ts` | modify | accept `survey:` source refs (the 2026-10-06 dentist survey added 60) |
| `packages/db/src/directory-place-ledger.ts` (+ `.test.ts`) | create | the ledger's source-ref rule, shared by the import and its test |
| `packages/db/migrations/0088_directory_search_extensions.sql` | custom | `pg_trgm`, `unaccent`, `f_unaccent()` |
| `packages/db/src/schema/directory-open-listings.ts` | create | `directory_open_listings` table |
| `packages/db/src/schema/index.ts` | modify | export it |
| `packages/db/migrations/0089_directory_open_listings.sql` (+ meta) | generate | table DDL |
| `packages/db/migrations/0090_directory_open_listings_grants.sql` | custom | grants + RLS |
| `packages/db/src/directory-listing-file.ts` (+ `.test.ts`) | create | pure: parse the website's listings and phones files into import rows |
| `packages/db/src/queries/directory-open-listings.ts` | create | `syncOpenListings`, `listVisibleOpenListings`, `openListingsVersion` |
| `packages/db/src/directory-open-listings.integration.test.ts` | create | tests against Postgres |
| `packages/db/src/index.ts` | modify | export the queries |
| `packages/db/scripts/import-directory-listings.ts` | create | `pnpm directory:import-listings <listings.json> <site-phones.json>` |
| `packages/db/package.json`, root `package.json` | modify | the script |
| `packages/shared/src/lib/directory/open-listings-contract.ts` | create | wire format, copied verbatim to the website |
| `apps/platform/lib/server/open-listings-api.ts` (+ `.test.ts`) | create | request handling for the two routes |
| `apps/platform/app/api/directory/open-listings/route.ts` | create | `GET` page of listings |
| `apps/platform/app/api/directory/open-listings/version/route.ts` | create | `GET` version |
| `apps/platform/lib/server/db.ts` | modify | list the new routes among the staff connection's uses |

**Website: `website-listing`**

| File | Change | Responsibility |
|---|---|---|
| `lib/open-listings-contract.ts` | create | verbatim copy of the platform contract |
| `lib/open-listings.ts` (+ `.test.ts`) | create | pure: zod parse of a page, snapshot assembly |
| `lib/server/env.ts` (+ test) | modify | `directoryOpenListingsSource()` |
| `lib/server/open-listings.ts` (+ `.test.ts`) | create | fetch + in-memory snapshot |
| `lib/server/platform-listings.ts` | modify | `loadPlatformListings()` also loads the snapshot |
| `lib/server/local-listings.ts` (+ test) | modify | read the snapshot when present; cache key includes it |
| `lib/server/site-phones.ts` | modify | phones from the snapshot when present |
| `app/api/locate/route.ts`, `components/home-options/home-data.ts`, `components/home-options/service-group-page.tsx` | modify | load listings before reading them (three existing gaps) |
| `.env.example` | modify | document `DIRECTORY_LISTINGS_SOURCE` |

---

## Part A: Platform (`directory-ads`)

### Task 1: The place import accepts survey refs

The 2026-10-06 dentist survey gave 60 new businesses ledger entries keyed `survey:0x<hex>:0x<hex>`. Today's import refuses any ledger with them (`SOURCE_REF` allows only `overture:` / `osm:`), which would stop the whole import.

**Files:**
- Create: `packages/db/src/directory-place-ledger.ts`
- Create: `packages/db/src/directory-place-ledger.test.ts`
- Modify: `packages/db/scripts/import-directory-places.ts` (the `SOURCE_REF` constant and its two uses)
- Modify: `packages/db/src/schema/directory-places.ts` (the `sourceRef` doc comment)

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/src/directory-place-ledger.test.ts
import { describe, expect, it } from "vitest";
import { isLedgerSourceRef } from "./directory-place-ledger";

describe("isLedgerSourceRef", () => {
  it("accepts the open datasets' refs", () => {
    expect(isLedgerSourceRef("overture:e41ed420-69eb-44ce-b9ab-6c458e58cea4")).toBe(true);
    expect(isLedgerSourceRef("osm:node/8261403277")).toBe(true);
  });

  it("accepts a Fynix survey ref", () => {
    expect(isLedgerSourceRef("survey:0x3be7b92181d5c545:0x2bdfd32ad6f69f08")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const ref of ["", "survey:", "survey:abc", "google:0x1:0x2", "osm:", "overture:a b", "survey:0x1:0x2:0x3"]) {
      expect(isLedgerSourceRef(ref)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @brandbasket/db test -- directory-place-ledger`
Expected: FAIL, "Failed to resolve import ./directory-place-ledger".

- [ ] **Step 3: Write the module**

```ts
// packages/db/src/directory-place-ledger.ts
/**
 * The source refs the dataset's place ledger (local-directory-data/thane/thane-place-ledger.json) is keyed by:
 * "overture:<id>" and "osm:<type>/<id>" for open-data rows, and "survey:0x<hex>:0x<hex>" for a business the Fynix
 * team surveyed that the open data lacks (local-directory-data/thane/import_survey.py, 2026-10-06).
 */
const OPEN_DATA_REF = /^(overture|osm):[A-Za-z0-9/_.-]{1,120}$/;
const SURVEY_REF = /^survey:0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16}$/;

export function isLedgerSourceRef(ref: string): boolean {
  return OPEN_DATA_REF.test(ref) || SURVEY_REF.test(ref);
}
```

- [ ] **Step 4: Use it in the import script**

In `packages/db/scripts/import-directory-places.ts`:
- Delete the line `const SOURCE_REF = /^(overture|osm):[A-Za-z0-9/_.-]{1,120}$/;`.
- Add `import { isLedgerSourceRef } from "../src/directory-place-ledger";` after the `../src/client` import.
- Replace the two uses:

```ts
function isSourceRefList(value: unknown): boolean {
  return Array.isArray(value) && value.every((ref: unknown) => typeof ref === "string" && isLedgerSourceRef(ref));
}
```

```ts
  if (!isLedgerSourceRef(sourceRef)) throw new LedgerFormatError(`bad source ref ${JSON.stringify(sourceRef)}`);
```

In `packages/db/src/schema/directory-places.ts`, change the `sourceRef` comment to:

```ts
      /**
       * "overture:<id>" / "osm:<type>/<id>" for an open-data business, "survey:0x…:0x…" for one the Fynix team
       * surveyed, from the dataset ledger (directory-place-ledger.ts); null otherwise.
       */
```

Survey businesses are registered as `open_data`. Their ids are letter-first like every ledger id, and they come from the dataset build, not from an owner.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @brandbasket/db test -- directory-place-ledger`
Expected: PASS (3 tests).

Run: `pnpm --filter @brandbasket/db typecheck`
Expected: no errors.

- [ ] **Step 6: Prove it loads the real ledger**

Against a local dev database (migrated), run:

```bash
pnpm directory:import-places ../local-directory-data/thane/thane-place-ledger.json
```

Expected: `Directory places: N created, M unchanged, from 39027 ledger rows.` and no `LedgerFormatError`.

- [ ] **Step 7: Checkpoint.** Run `pnpm --filter @brandbasket/db test` and `pnpm --filter @brandbasket/db typecheck`. Both must pass. No commit.

---

### Task 2: Search extensions and the `directory_open_listings` table

**Files:**
- Create (custom): `packages/db/migrations/0088_directory_search_extensions.sql`
- Create: `packages/db/src/schema/directory-open-listings.ts`
- Modify: `packages/db/src/schema/index.ts`
- Generate: `packages/db/migrations/0089_directory_open_listings.sql` + `meta/0089_snapshot.json`
- Create (custom): `packages/db/migrations/0090_directory_open_listings_grants.sql`
- Modify: `packages/db/migrations/meta/_journal.json` (tags)

- [ ] **Step 1: Empty custom migration for the extensions**

Run: `pnpm --filter @brandbasket/db exec drizzle-kit generate --custom --name=directory_search_extensions`

drizzle-kit numbers it after the last journal entry. Rename the file to `0088_directory_search_extensions.sql`, rename its snapshot to `0088_snapshot.json`, and set its journal `tag` to `0088_directory_search_extensions`. Fill it with:

```sql
-- Postgres search for the /in directory (docs/superpowers/plans/2026-10-06-directory-listings-in-database.md and the
-- 2026-10-01 benchmark, website-listing/docs/superpowers/notes/2026-10-01-postgres-search-benchmark.md). Both
-- extensions are trusted (PG 13+), so the database owner that runs migrations may create them.
-- f_unaccent is unaccent marked IMMUTABLE, which an index or generated column needs; the dictionary is named so the
-- result never depends on search_path.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
```

- [ ] **Step 2: The schema**

```ts
// packages/db/src/schema/directory-open-listings.ts
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";
import { directoryPlaces } from "./directory-places";

const SLUG_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*$";
/** An ordinary Indian number in E.164, as the website shows it (lib/site-phones.ts there). */
const PHONE_REGEX = "^\\+91[1-9][0-9]{9}$";

/** Postgres's full-text document type; read-only here (a generated column). */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/** Which dataset a listing came from: OSM rows need the OpenStreetMap credit; "survey" is the Fynix team's own. */
export const openListingSource = pgEnum("directory_open_listing_source", ["osm", "overture", "survey"]);
export type OpenListingSource = (typeof openListingSource.enumValues)[number];

/**
 * One business the /in directory shows from the dataset build: the open data and the Fynix survey
 * (local-directory-data/thane, loaded by `pnpm directory:import-listings`). Platform businesses (clients, owner-added)
 * are not here; they come from their own tables through the feed. Keyed by the permanent place id, whose URL label
 * lives in directory_places.
 *
 * A business that leaves the dataset is hidden (hidden_at), never deleted: its id, reviews and old links stay valid.
 * The phone is the one the directory may show without the owner confirming it (website-listing lib/site-phones.ts):
 * found on the business's own website (phone_found_on is that page) or confirmed on a survey call ("call").
 * `search` is the Postgres full-text document for the state-wide search; nothing reads it yet. Staff-only (0090).
 */
export const directoryOpenListings = pgTable(
  "directory_open_listings",
  {
    placeId: text("place_id")
      .primaryKey()
      .references(() => directoryPlaces.id),
    name: text("name").notNull(),
    categorySlug: text("category_slug").notNull(),
    citySlug: text("city_slug").notNull(),
    areaSlug: text("area_slug").notNull(),
    address: text("address").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    website: text("website").notNull().default(""),
    source: openListingSource("source").notNull(),
    phone: text("phone"),
    phoneFoundOn: text("phone_found_on"),
    phoneCheckedOn: date("phone_checked_on", { mode: "string" }),
    phoneWhatsapp: boolean("phone_whatsapp").notNull().default(false),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', f_unaccent(coalesce(name, ''))), 'A') || setweight(to_tsvector('simple', replace(category_slug, '-', ' ')), 'B') || setweight(to_tsvector('simple', replace(area_slug || ' ' || city_slug, '-', ' ')), 'C')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("directory_open_listings_name_check", sql`char_length(${table.name}) between 1 and 200`),
    check("directory_open_listings_category_slug_check", sql`${table.categorySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("directory_open_listings_city_slug_check", sql`${table.citySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("directory_open_listings_area_slug_check", sql`${table.areaSlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check("directory_open_listings_point_check", sql`${table.lat} between -90 and 90 and ${table.lon} between -180 and 180`),
    check(
      "directory_open_listings_phone_check",
      sql`(${table.phone} is null and ${table.phoneFoundOn} is null and ${table.phoneCheckedOn} is null)
        or (${table.phone} ~ ${sql.raw(`'${PHONE_REGEX}'`)} and ${table.phoneCheckedOn} is not null
          and (${table.phoneFoundOn} = 'call' or ${table.phoneFoundOn} ~ '^https?://'))`,
    ),
    // Area and category pages.
    index("directory_open_listings_city_area_category_idx").on(table.citySlug, table.areaSlug, table.categorySlug),
    // Full-text and typo search (state-wide plan).
    index("directory_open_listings_search_idx").using("gin", table.search),
    index("directory_open_listings_name_trgm_idx").using("gin", sql`lower(f_unaccent(${table.name})) gin_trgm_ops`),
  ],
);
```

In `packages/db/src/schema/index.ts`, add, in alphabetical order before `./directory-places`:

```ts
export * from "./directory-open-listings";
```

- [ ] **Step 3: Generate the table migration**

Run: `pnpm --filter @brandbasket/db db:generate`

Rename the output to `0089_directory_open_listings.sql` and its snapshot to `0089_snapshot.json`, and set the journal tag to `0089_directory_open_listings`. Add this header above the generated DDL:

```sql
-- The /in directory's open-data and surveyed businesses (docs/superpowers/plans/2026-10-06-directory-listings-in-database.md),
-- loaded by `pnpm directory:import-listings`. Needs f_unaccent from 0088. drizzle-kit's DDL, unchanged; the grants and
-- row-level security are in 0090.
```

Read the generated SQL and check that:
- `"search" tsvector GENERATED ALWAYS AS (...) STORED` is present;
- both GIN indexes say `USING gin`;
- the FK to `directory_places(id)` is present.

If drizzle-kit wrote the trigram index without the operator class, fix that line by hand to `USING gin (lower(f_unaccent("name")) gin_trgm_ops)`, and note the fix in the header.

- [ ] **Step 4: Grants migration**

Run: `pnpm --filter @brandbasket/db exec drizzle-kit generate --custom --name=directory_open_listings_grants`

Rename it to `0090_directory_open_listings_grants.sql` (snapshot `0090_snapshot.json`, tag `0090_directory_open_listings_grants`) and fill it with:

```sql
-- Grants and row-level security for directory_open_listings (0089), the same pattern as 0076. Staff-only: the import
-- (`pnpm directory:import-listings`) and the website's /api/directory/open-listings routes run on the staff connection,
-- so fynix_app and fynix_public get nothing. No DELETE: a business that leaves the dataset is hidden, and its id
-- stays valid for reviews and old links.
GRANT SELECT, INSERT, UPDATE ON directory_open_listings TO fynix_staff;
--> statement-breakpoint
ALTER TABLE directory_open_listings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY directory_open_listings_staff_all ON directory_open_listings FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
```

- [ ] **Step 5: Migrate dev and test databases**

```bash
pnpm db:migrate
```
```bash
pnpm db:migrate:test
```

Expected: both finish with 0088, 0089 and 0090 applied, and no journal/file count error.

Check the table:

```bash
psql "$DATABASE_URL_OWNER" -c '\d directory_open_listings'
```

Expected: the `search` column shows `generated always as (...) stored`, plus the three indexes.

- [ ] **Step 6: Checkpoint.** Run `pnpm --filter @brandbasket/db typecheck` and `pnpm --filter @brandbasket/db test`. No commit.

---

### Task 3: Parse the website's data files (pure)

The import reads exactly what the website reads today: the dataset build's `thane-listings.json` (12-tuples) and `thane-site-phones.json`. That way the database starts identical to the live site.

**Files:**
- Create: `packages/db/src/directory-listing-file.ts`
- Test: `packages/db/src/directory-listing-file.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/src/directory-listing-file.test.ts
import { describe, expect, it } from "vitest";
import { DirectoryFileError, parseListingsFile, parsePhonesFile, toListingInputs } from "./directory-listing-file";

const ROW = [
  "Shiv Drushti dental clinic", "dentists", "thane", "anand-nagar", "27 GBR, Ghodbunder Rd, Anand Nagar 400607",
  19.27003, 72.96437, "", "survey", "z8p6tbs", "thane", "shiv-drushti-dental-clinic",
];
const OSM_ROW = [
  "Smile Dental", "dentists", "thane", "naupada", "Naupada, Thane 400602",
  19.19, 72.97, "https://smile.example/", "osm", "k7m2q9a", "thane", "smile-dental",
];

describe("parseListingsFile", () => {
  it("reads the 12-tuples the dataset build writes", () => {
    const rows = parseListingsFile(JSON.stringify([ROW, OSM_ROW]));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      placeId: "z8p6tbs", name: "Shiv Drushti dental clinic", categorySlug: "dentists", citySlug: "thane",
      areaSlug: "anand-nagar", address: "27 GBR, Ghodbunder Rd, Anand Nagar 400607", lat: 19.27003, lon: 72.96437,
      website: "", source: "survey",
    });
  });

  it("refuses a malformed row, naming it", () => {
    expect(() => parseListingsFile(JSON.stringify([[...ROW.slice(0, 8), "google", ...ROW.slice(9)]]))).toThrow(
      /row 0.*source/,
    );
    expect(() => parseListingsFile(JSON.stringify([[...ROW.slice(0, 9), "not-an-id", ...ROW.slice(10)]]))).toThrow(
      DirectoryFileError,
    );
    expect(() => parseListingsFile(JSON.stringify({}))).toThrow(/array/);
  });

  it("refuses one place id on two rows", () => {
    expect(() => parseListingsFile(JSON.stringify([ROW, ROW]))).toThrow(/z8p6tbs.*twice/);
  });
});

describe("parsePhonesFile", () => {
  it("reads website and call numbers", () => {
    const phones = parsePhonesFile(
      JSON.stringify({
        z8p6tbs: ["+919850004227", "call", "2026-10-05", true],
        k7m2q9a: ["+912225325444", "https://smile.example/contact", "2026-10-01", false],
      }),
    );
    expect(phones.get("z8p6tbs")).toEqual({ e164: "+919850004227", foundOn: "call", checkedOn: "2026-10-05", whatsapp: true });
    expect(phones.get("k7m2q9a")?.foundOn).toBe("https://smile.example/contact");
  });

  it("refuses a bad entry", () => {
    expect(() => parsePhonesFile(JSON.stringify({ z8p6tbs: ["9850004227", "call", "2026-10-05", true] }))).toThrow(/z8p6tbs/);
    expect(() => parsePhonesFile(JSON.stringify({ z8p6tbs: ["+919850004227", "javascript:x", "2026-10-05", true] }))).toThrow(
      /z8p6tbs/,
    );
  });
});

describe("toListingInputs", () => {
  it("gives each listing its phone, or none", () => {
    const rows = parseListingsFile(JSON.stringify([ROW, OSM_ROW]));
    const phones = parsePhonesFile(JSON.stringify({ z8p6tbs: ["+919850004227", "call", "2026-10-05", true] }));
    const inputs = toListingInputs(rows, phones);
    expect(inputs[0]?.phone).toEqual({ e164: "+919850004227", foundOn: "call", checkedOn: "2026-10-05", whatsapp: true });
    expect(inputs[1]?.phone).toBeNull();
  });

  it("refuses a phone for a business the listings file does not have", () => {
    const rows = parseListingsFile(JSON.stringify([OSM_ROW]));
    const phones = parsePhonesFile(JSON.stringify({ z8p6tbs: ["+919850004227", "call", "2026-10-05", true] }));
    expect(() => toListingInputs(rows, phones)).toThrow(/z8p6tbs/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @brandbasket/db test -- directory-listing-file`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the module**

```ts
// packages/db/src/directory-listing-file.ts
import { isPlaceId } from "./place-id";
import type { OpenListingSource } from "./schema/directory-listings";

/*
 * The dataset build's output, as the website reads it today (website-listing/content/local):
 * - thane-listings.json: [name, category, city, area, address, lat, lon, website, source, id, urlCity, urlSlug] per
 *   business (local-directory-data/thane/build_web_data.py). urlCity and urlSlug are the URL label, which
 *   directory_places owns, so they are read past and not stored again.
 * - thane-site-phones.json: { id: [e164, foundOn (page URL or "call"), checkedOn YYYY-MM-DD, whatsapp] }
 *   (build_site_phones.py).
 * Checked the way the database checks them, so a bad file is refused whole before anything is written.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PHONE = /^\+91[1-9][0-9]{9}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: readonly OpenListingSource[] = ["osm", "overture", "survey"];

export class DirectoryFileError extends Error {
  constructor(detail: string) {
    super(`The directory data file is malformed: ${detail}.`);
    this.name = "DirectoryFileError";
  }
}

export interface ListingFileRow {
  readonly placeId: string;
  readonly name: string;
  readonly categorySlug: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly address: string;
  readonly lat: number;
  readonly lon: number;
  readonly website: string;
  readonly source: OpenListingSource;
}

export interface ListingPhone {
  readonly e164: string;
  /** The page the number was found on, or "call". */
  readonly foundOn: string;
  readonly checkedOn: string;
  readonly whatsapp: boolean;
}

export interface OpenListingInput extends ListingFileRow {
  readonly phone: ListingPhone | null;
}

function isSource(value: unknown): value is OpenListingSource {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

function slug(value: unknown, field: string, where: string): string {
  if (typeof value !== "string" || !SLUG.test(value)) throw new DirectoryFileError(`${where}: bad ${field}`);
  return value;
}

function finite(value: unknown, field: string, where: string, limit: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new DirectoryFileError(`${where}: bad ${field}`);
  }
  return value;
}

function parseRow(value: unknown, index: number): ListingFileRow {
  const where = `row ${index}`;
  if (!Array.isArray(value) || value.length !== 12) throw new DirectoryFileError(`${where} is not a 12-item row`);
  const [name, category, city, area, address, lat, lon, website, source, id] = value as unknown[];
  if (typeof name !== "string" || name.length === 0 || name.length > 200) throw new DirectoryFileError(`${where}: bad name`);
  if (typeof address !== "string") throw new DirectoryFileError(`${where}: bad address`);
  if (typeof website !== "string") throw new DirectoryFileError(`${where}: bad website`);
  if (!isSource(source)) throw new DirectoryFileError(`${where}: bad source ${JSON.stringify(source)}`);
  if (typeof id !== "string" || !isPlaceId(id)) throw new DirectoryFileError(`${where}: bad place id`);
  return {
    placeId: id,
    name,
    categorySlug: slug(category, "category", where),
    citySlug: slug(city, "city", where),
    areaSlug: slug(area, "area", where),
    address,
    lat: finite(lat, "lat", where, 90),
    lon: finite(lon, "lon", where, 180),
    website,
    source,
  };
}

export function parseListingsFile(text: string): ListingFileRow[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new DirectoryFileError("the listings file is not an array of rows");
  const rows = raw.map(parseRow);
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.placeId)) throw new DirectoryFileError(`place id ${row.placeId} appears twice`);
    seen.add(row.placeId);
  }
  return rows;
}

export function parsePhonesFile(text: string): ReadonlyMap<string, ListingPhone> {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DirectoryFileError("the phones file is not an object of place id -> entry");
  }
  const phones = new Map<string, ListingPhone>();
  for (const [id, entry] of Object.entries(raw)) {
    if (!isPlaceId(id) || !Array.isArray(entry) || entry.length !== 4) throw new DirectoryFileError(`bad phone entry ${id}`);
    const [e164, foundOn, checkedOn, whatsapp] = entry as unknown[];
    const page = typeof foundOn === "string" && (foundOn === "call" || /^https?:\/\//.test(foundOn));
    if (typeof e164 !== "string" || !PHONE.test(e164) || !page || typeof checkedOn !== "string" || !DAY.test(checkedOn)) {
      throw new DirectoryFileError(`bad phone entry ${id}`);
    }
    if (typeof whatsapp !== "boolean") throw new DirectoryFileError(`bad phone entry ${id}`);
    phones.set(id, { e164, foundOn: foundOn as string, checkedOn, whatsapp });
  }
  return phones;
}

/** Each listing with its shown phone. A phone for a business the listings file lacks means the two files disagree. */
export function toListingInputs(
  rows: readonly ListingFileRow[],
  phones: ReadonlyMap<string, ListingPhone>,
): OpenListingInput[] {
  const ids = new Set(rows.map((row) => row.placeId));
  for (const id of phones.keys()) {
    if (!ids.has(id)) throw new DirectoryFileError(`the phones file has ${id}, which the listings file does not`);
  }
  return rows.map((row) => ({ ...row, phone: phones.get(row.placeId) ?? null }));
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @brandbasket/db test -- directory-listing-file`
Expected: PASS (7 tests).

- [ ] **Step 5: Check it against the real files**

Today the website's `thane-site-phones.json` has numbers only for listed businesses (`build_site_phones.py` skips the rest), so `toListingInputs` must not throw. Run:

```bash
pnpm --filter @brandbasket/db exec tsx -e 'import {readFileSync as r} from "node:fs";import {parseListingsFile as l,parsePhonesFile as p,toListingInputs as t} from "./src/directory-listing-file";const d="../../../website-listing/content/local/";const x=t(l(r(d+"thane-listings.json","utf8")),p(r(d+"thane-site-phones.json","utf8")));console.log(x.length, x.filter(i=>i.phone).length)'
```

Expected: `37324 3229` (or the current counts), and no error.

- [ ] **Step 6: Checkpoint.** Run `pnpm --filter @brandbasket/db test` and `typecheck`. No commit.

---

### Task 4: Queries: sync, snapshot page, version

**Files:**
- Create: `packages/db/src/queries/directory-open-listings.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/directory-open-listings.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/db/src/directory-open-listings.integration.test.ts
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OpenListingInput } from "./directory-listing-file";
import {
  openListingsVersion,
  listVisibleOpenListings,
  syncOpenListings,
  UnknownListingPlaceError,
} from "./queries/directory-open-listings";
import { importOpenDataPlaces, type OpenDataPlaceRow } from "./queries/directory-places";
import { directoryOpenListings } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const LATER = new Date("2026-10-06T11:00:00.000Z");

const PLACES: OpenDataPlaceRow[] = [
  { sourceRef: "osm:node/1", id: "k7m2q9a", citySlug: "thane", urlSlug: "smile-dental", legacyKey: null },
  { sourceRef: "survey:0x1:0x2", id: "z8p6tbs", citySlug: "thane", urlSlug: "shiv-drushti-dental-clinic", legacyKey: null },
  { sourceRef: "overture:abc", id: "b3cdefg", citySlug: "thane", urlSlug: "iron-gym", legacyKey: null },
];

function listing(placeId: string, name: string, extra: Partial<OpenListingInput> = {}): OpenListingInput {
  return {
    placeId, name, categorySlug: "dentists", citySlug: "thane", areaSlug: "naupada", address: "Naupada, Thane 400602",
    lat: 19.19, lon: 72.97, website: "", source: "osm", phone: null, ...extra,
  };
}

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await importOpenDataPlaces(dbs.staff.db, PLACES, NOW);
});

describe("syncOpenListings", () => {
  it("creates, then leaves unchanged rows alone and updates changed ones", async () => {
    const first = await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Dental"), listing("z8p6tbs", "Shiv Drushti")], NOW);
    expect(first).toEqual({ created: 2, updated: 0, unchanged: 0, hidden: 0 });

    const second = await syncOpenListings(
      dbs.staff.db,
      [listing("k7m2q9a", "Smile Dental Care"), listing("z8p6tbs", "Shiv Drushti")],
      LATER,
    );
    expect(second).toEqual({ created: 0, updated: 1, unchanged: 1, hidden: 0 });
  });

  it("stores the shown phone and where it came from", async () => {
    await syncOpenListings(
      dbs.staff.db,
      [listing("z8p6tbs", "Shiv Drushti", { source: "survey", phone: { e164: "+919850004227", foundOn: "call", checkedOn: "2026-10-05", whatsapp: true } })],
      NOW,
    );
    const [row] = await dbs.staff.db.select().from(directoryOpenListings).where(eq(directoryOpenListings.placeId, "z8p6tbs"));
    expect(row).toMatchObject({ phone: "+919850004227", phoneFoundOn: "call", phoneCheckedOn: "2026-10-05", phoneWhatsapp: true, source: "survey" });
  });

  it("hides a business that left the dataset, and shows it again when it returns", async () => {
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Dental"), listing("b3cdefg", "Iron Gym")], NOW);
    expect(await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Dental")], LATER)).toMatchObject({ hidden: 1 });
    expect((await listVisibleOpenListings(dbs.staff.db, { after: null, limit: 10 })).map((r) => r.placeId)).toEqual(["k7m2q9a"]);

    expect(await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Dental"), listing("b3cdefg", "Iron Gym")], LATER)).toMatchObject({
      updated: 1,
      hidden: 0,
    });
    expect(await listVisibleOpenListings(dbs.staff.db, { after: null, limit: 10 })).toHaveLength(2);
  });

  it("refuses a listing whose place is not registered, writing nothing", async () => {
    const text = await captureErrorText(syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile"), listing("q9q9q9q", "Ghost")], NOW));
    expect(text).toMatch(/q9q9q9q/);
    expect(await listVisibleOpenListings(dbs.staff.db, { after: null, limit: 10 })).toHaveLength(0);
    await expect(syncOpenListings(dbs.staff.db, [listing("q9q9q9q", "Ghost")], NOW)).rejects.toBeInstanceOf(UnknownListingPlaceError);
  });

  it("keeps the search document up to date", async () => {
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Café Smile")], NOW);
    const [hit] = await dbs.staff.db
      .select({ id: directoryOpenListings.placeId })
      .from(directoryOpenListings)
      .where(sql`${directoryOpenListings.search} @@ to_tsquery('simple', 'cafe:*')`);
    expect(hit?.id).toBe("k7m2q9a");
  });
});

describe("listVisibleOpenListings", () => {
  it("pages by place id and carries the URL label from directory_places", async () => {
    await syncOpenListings(dbs.staff.db, [listing("z8p6tbs", "Shiv"), listing("k7m2q9a", "Smile"), listing("b3cdefg", "Gym")], NOW);
    const first = await listVisibleOpenListings(dbs.staff.db, { after: null, limit: 2 });
    expect(first.map((r) => r.placeId)).toEqual(["b3cdefg", "k7m2q9a"]);
    expect(first[1]).toMatchObject({ urlCitySlug: "thane", urlSlug: "smile-dental" });
    const second = await listVisibleOpenListings(dbs.staff.db, { after: "k7m2q9a", limit: 2 });
    expect(second.map((r) => r.placeId)).toEqual(["z8p6tbs"]);
  });
});

describe("openListingsVersion", () => {
  it("changes when the visible listings change, and only then", async () => {
    const empty = await openListingsVersion(dbs.staff.db);
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile")], NOW);
    const one = await openListingsVersion(dbs.staff.db);
    expect(one).not.toBe(empty);
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile")], LATER);
    expect(await openListingsVersion(dbs.staff.db)).toBe(one);
    await syncOpenListings(dbs.staff.db, [listing("k7m2q9a", "Smile Care")], LATER);
    expect(await openListingsVersion(dbs.staff.db)).not.toBe(one);
  });
});

describe("row-level security", () => {
  it("gives the app and public roles nothing", async () => {
    await expect(dbs.app.db.select().from(directoryOpenListings)).rejects.toThrow(/permission denied/);
    await expect(dbs.publicRole.db.select().from(directoryOpenListings)).rejects.toThrow(/permission denied/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @brandbasket/db test:integration -- directory-open-listings`
Expected: FAIL, `./queries/directory-listings` not found.

- [ ] **Step 3: Write the queries**

```ts
// packages/db/src/queries/directory-open-listings.ts
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { OpenListingInput, ListingPhone } from "../directory-listing-file";
import { directoryOpenListings, directoryPlaces } from "../schema";

/** Rows per INSERT and per place-existence check: well under Postgres's 65,535 bind parameters (15 per row). */
const BATCH_SIZE = 500;

export interface OpenListingSyncResult {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Businesses that were visible and are no longer in the dataset. */
  readonly hidden: number;
}

/** A visible listing with its URL label, as the website needs it. */
export interface VisibleOpenListing extends OpenListingInput {
  readonly urlCitySlug: string;
  readonly urlSlug: string;
}

/** The dataset has listings whose place id directory_places doesn't know: run `pnpm directory:import-places` first. */
export class UnknownListingPlaceError extends Error {
  constructor(readonly placeIds: readonly string[]) {
    super(
      `${placeIds.length} listings have no registered place (first: ${placeIds.slice(0, 10).join(", ")}). ` +
        "Run `pnpm directory:import-places` with the same build's ledger first.",
    );
    this.name = "UnknownListingPlaceError";
  }
}

export class DuplicateListingError extends Error {
  constructor(readonly placeId: string) {
    super(`Listing ${placeId} appears twice in one import.`);
    this.name = "DuplicateListingError";
  }
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) out.push(items.slice(i, i + BATCH_SIZE));
  return out;
}

function phoneColumns(phone: ListingPhone | null) {
  return {
    phone: phone?.e164 ?? null,
    phoneFoundOn: phone?.foundOn ?? null,
    phoneCheckedOn: phone?.checkedOn ?? null,
    phoneWhatsapp: phone?.whatsapp ?? false,
  };
}

/**
 * Makes directory_open_listings match one dataset build, in one transaction, so the website never sees half an import:
 * every row is created or updated (an unchanged row is not touched, so its updated_at and the version stay put), a
 * hidden row that is back is shown again, and a visible row the build no longer has is hidden (never deleted).
 * Every place id must already be in directory_places.
 */
export async function syncOpenListings(
  db: Database,
  rows: readonly OpenListingInput[],
  now: Date,
): Promise<OpenListingSyncResult> {
  const ids = rows.map((row) => row.placeId);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new DuplicateListingError(id);
    seen.add(id);
  }

  return db.transaction(async (tx) => {
    const unknown: string[] = [];
    for (const batch of chunks(ids)) {
      const known = await tx.select({ id: directoryPlaces.id }).from(directoryPlaces).where(inArray(directoryPlaces.id, batch));
      const knownIds = new Set(known.map((row) => row.id));
      unknown.push(...batch.filter((id) => !knownIds.has(id)));
    }
    if (unknown.length > 0) throw new UnknownListingPlaceError(unknown);

    let created = 0;
    let updated = 0;
    const t = directoryOpenListings;
    for (const batch of chunks(rows)) {
      const written = await tx
        .insert(t)
        .values(
          batch.map((row) => ({
            placeId: row.placeId,
            name: row.name,
            categorySlug: row.categorySlug,
            citySlug: row.citySlug,
            areaSlug: row.areaSlug,
            address: row.address,
            lat: row.lat,
            lon: row.lon,
            website: row.website,
            source: row.source,
            ...phoneColumns(row.phone),
            hiddenAt: null,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: t.placeId,
          set: {
            name: sql`excluded.name`,
            categorySlug: sql`excluded.category_slug`,
            citySlug: sql`excluded.city_slug`,
            areaSlug: sql`excluded.area_slug`,
            address: sql`excluded.address`,
            lat: sql`excluded.lat`,
            lon: sql`excluded.lon`,
            website: sql`excluded.website`,
            source: sql`excluded.source`,
            phone: sql`excluded.phone`,
            phoneFoundOn: sql`excluded.phone_found_on`,
            phoneCheckedOn: sql`excluded.phone_checked_on`,
            phoneWhatsapp: sql`excluded.phone_whatsapp`,
            hiddenAt: sql`null`,
            updatedAt: now,
          },
          // Only a real change (or a hidden row coming back) is written, so the version moves only then.
          setWhere: sql`${t.hiddenAt} is not null or (${t.name}, ${t.categorySlug}, ${t.citySlug}, ${t.areaSlug}, ${t.address},
            ${t.lat}, ${t.lon}, ${t.website}, ${t.source}, ${t.phone}, ${t.phoneFoundOn}, ${t.phoneCheckedOn}, ${t.phoneWhatsapp})
            is distinct from (excluded.name, excluded.category_slug, excluded.city_slug, excluded.area_slug, excluded.address,
            excluded.lat, excluded.lon, excluded.website, excluded.source, excluded.phone, excluded.phone_found_on,
            excluded.phone_checked_on, excluded.phone_whatsapp)`,
        })
        // xmax = 0 marks a freshly inserted row; an updated one has the updating transaction's id.
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const row of written) {
        if (row.inserted) created += 1;
        else updated += 1;
      }
    }

    const hiddenRows = await tx
      .update(t)
      .set({ hiddenAt: now, updatedAt: now })
      .where(and(isNull(t.hiddenAt), sql`not (${t.placeId} = any(${ids}::text[]))`))
      .returning({ placeId: t.placeId });

    return { created, updated, unchanged: rows.length - created - updated, hidden: hiddenRows.length };
  });
}

/** Up to `limit` visible listings after `after` (a place id), in place-id order: one page of the website's snapshot. */
export async function listVisibleOpenListings(
  db: Database,
  page: { readonly after: string | null; readonly limit: number },
): Promise<readonly VisibleOpenListing[]> {
  const t = directoryOpenListings;
  const rows = await db
    .select({
      placeId: t.placeId,
      name: t.name,
      categorySlug: t.categorySlug,
      citySlug: t.citySlug,
      areaSlug: t.areaSlug,
      address: t.address,
      lat: t.lat,
      lon: t.lon,
      website: t.website,
      source: t.source,
      phone: t.phone,
      phoneFoundOn: t.phoneFoundOn,
      phoneCheckedOn: t.phoneCheckedOn,
      phoneWhatsapp: t.phoneWhatsapp,
      urlCitySlug: directoryPlaces.citySlug,
      urlSlug: directoryPlaces.urlSlug,
    })
    .from(t)
    .innerJoin(directoryPlaces, eq(directoryPlaces.id, t.placeId))
    .where(page.after === null ? isNull(t.hiddenAt) : and(isNull(t.hiddenAt), gt(t.placeId, page.after)))
    .orderBy(asc(t.placeId))
    .limit(page.limit);
  return rows.map(({ phone, phoneFoundOn, phoneCheckedOn, phoneWhatsapp, ...rest }) => ({
    ...rest,
    phone:
      phone !== null && phoneFoundOn !== null && phoneCheckedOn !== null
        ? { e164: phone, foundOn: phoneFoundOn, checkedOn: phoneCheckedOn, whatsapp: phoneWhatsapp }
        : null,
  }));
}

/**
 * A string that changes whenever any listing is created, changed, hidden or shown again (every such write moves
 * updated_at), and also when a business's URL label changes. The website compares it before re-reading the snapshot.
 */
export async function openListingsVersion(db: Database): Promise<string> {
  const [row] = await db
    .select({
      visible: sql<number>`count(*) filter (where ${directoryOpenListings.hiddenAt} is null)::int`,
      listings: sql<string>`coalesce(max(${directoryOpenListings.updatedAt}), 'epoch')::text`,
      places: sql<string>`(select coalesce(max(${directoryPlaces.updatedAt}), 'epoch')::text from ${directoryPlaces})`,
    })
    .from(directoryOpenListings);
  return `${row?.visible ?? 0}|${row?.listings ?? "epoch"}|${row?.places ?? "epoch"}`;
}
```

In `packages/db/src/index.ts`, after the `./queries/directory-place-legacy-keys` export line, add:

```ts
export {
  DuplicateListingError,
  openListingsVersion,
  listVisibleOpenListings,
  syncOpenListings,
  UnknownListingPlaceError,
  type OpenListingSyncResult,
  type VisibleOpenListing,
} from "./queries/directory-open-listings";
export {
  DirectoryFileError,
  parseListingsFile,
  parsePhonesFile,
  toListingInputs,
  type OpenListingInput,
  type ListingFileRow,
  type ListingPhone,
} from "./directory-listing-file";
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @brandbasket/db test:integration -- directory-open-listings`
Expected: PASS (8 tests).

If `${ids}::text[]` binds as a record rather than an array in this drizzle version, replace it with `sql\`not (${t.placeId} = any(${sql.param(ids)}::text[]))\`` and re-run.

- [ ] **Step 5: Checkpoint.** Run `pnpm --filter @brandbasket/db test`, `pnpm --filter @brandbasket/db test:integration` and `pnpm --filter @brandbasket/db typecheck`. All must pass. No commit.

---

### Task 5: Import command

**Files:**
- Create: `packages/db/scripts/import-directory-listings.ts`
- Modify: `packages/db/package.json` (scripts), root `package.json` (scripts)

- [ ] **Step 1: Write the script**

```ts
// packages/db/scripts/import-directory-listings.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase } from "../src/client";
import { parseListingsFile, parsePhonesFile, toListingInputs } from "../src/directory-listing-file";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { syncOpenListings } from "../src/queries/directory-open-listings";

/*
 * Makes directory_open_listings match one dataset build, on the staff connection. Takes the two files the build writes
 * into the website (website-listing/content/local): thane-listings.json and thane-site-phones.json. Run it after
 * `pnpm directory:import-places` with the same build's ledger, so every place id exists. Safe to run again: only
 * changed rows are written, and a business the build dropped is hidden, not deleted.
 *
 *   pnpm directory:import-listings <thane-listings.json> <thane-site-phones.json>
 */

async function main(): Promise<void> {
  const [listingsPath, phonesPath] = process.argv.slice(2);
  if (listingsPath === undefined || phonesPath === undefined) {
    throw new Error("Usage: pnpm directory:import-listings <thane-listings.json> <thane-site-phones.json>");
  }
  // pnpm runs the script from packages/db; a relative path means relative to where the command was typed.
  const base = process.env.INIT_CWD ?? process.cwd();
  const rows = toListingInputs(
    parseListingsFile(readFileSync(resolve(base, listingsPath), "utf8")),
    parsePhonesFile(readFileSync(resolve(base, phonesPath), "utf8")),
  );

  loadLocalEnv();
  // directory_open_listings is staff-only (0090), like the routes that read it.
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });
  try {
    const result = await syncOpenListings(db, rows, new Date());
    console.log(
      `Directory listings: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ` +
        `${result.hidden} hidden, from ${rows.length} rows (${rows.filter((row) => row.phone !== null).length} with a phone).`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Register it**

In `packages/db/package.json` `"scripts"`, after `directory:backfill-places`:

```json
    "directory:import-listings": "tsx scripts/import-directory-listings.ts"
```

In the root `package.json` `"scripts"`, after `directory:backfill-places`:

```json
    "directory:import-listings": "pnpm --filter @brandbasket/db directory:import-listings",
```

- [ ] **Step 3: Run it locally twice**

```bash
pnpm directory:import-places ../local-directory-data/thane/thane-place-ledger.json
```
```bash
pnpm directory:import-listings ../website-listing/content/local/thane-listings.json ../website-listing/content/local/thane-site-phones.json
```

Expected first run: `Directory listings: 37324 created, 0 updated, 0 unchanged, 0 hidden, from 37324 rows (3229 with a phone).`, using the current counts.

Run the second command again. Expected: `0 created, 0 updated, 37324 unchanged, 0 hidden`.

Time it. Expected: under 30 s on the Mac.

- [ ] **Step 4: Checkpoint.** Run `pnpm --filter @brandbasket/db typecheck`. No commit.

---

### Task 6: Wire contract (shared, copied to the website)

**Files:**
- Create: `packages/shared/src/lib/directory/open-listings-contract.ts`

- [ ] **Step 1: Write the contract**

```ts
// packages/shared/src/lib/directory/open-listings-contract.ts
/*
 * GET /api/directory/open-listings/version and GET /api/directory/open-listings?after=<place id>&limit=<n>: the
 * directory's open-data and surveyed businesses (directory_open_listings), for the marketing website's server, with
 * LEADS_API_TOKEN. This file is copied verbatim into the website repo (lib/open-listings-contract.ts), like
 * feed-contract.ts. Additive only: never reorder or remove a tuple field; append optional ones at the end.
 */

export const OPEN_LISTINGS_PATH = "/api/directory/open-listings";
export const OPEN_LISTINGS_VERSION_PATH = "/api/directory/open-listings/version";
export const OPEN_LISTINGS_CONTRACT_VERSION = 1;
/** Most rows one page may ask for: about 1.6 MB of JSON. */
export const OPEN_LISTINGS_MAX_PAGE = 5000;

/**
 * One business. The first twelve fields are the same as a row of the website's thane-listings.json, so the website
 * reads both the same way: name, category, city, area, address, lat, lon, website, source, id, urlCity, urlSlug.
 * Then the shown phone, or four nulls/false: e164, foundOn (page URL or "call"), checkedOn (YYYY-MM-DD), whatsapp.
 */
export type OpenListingTuple = readonly [
  name: string,
  category: string,
  city: string,
  area: string,
  address: string,
  lat: number,
  lon: number,
  website: string,
  source: "osm" | "overture" | "survey",
  id: string,
  urlCity: string,
  urlSlug: string,
  phone: string | null,
  phoneFoundOn: string | null,
  phoneCheckedOn: string | null,
  phoneWhatsapp: boolean,
];

export interface OpenListingsVersion {
  readonly contract: typeof OPEN_LISTINGS_CONTRACT_VERSION;
  /** Changes whenever any visible listing does; compare before re-reading. */
  readonly version: string;
}

export interface OpenListingsPage {
  readonly contract: typeof OPEN_LISTINGS_CONTRACT_VERSION;
  /** The version this page was read at; a snapshot whose pages disagree is read again. */
  readonly version: string;
  readonly listings: readonly OpenListingTuple[];
  /** The `after` for the next page, or null on the last. */
  readonly next: string | null;
}
```

- [ ] **Step 2: Checkpoint.** Run `pnpm --filter @brandbasket/shared typecheck`. No commit.

---

### Task 7: The two routes

**Files:**
- Create: `apps/platform/lib/server/open-listings-api.ts`
- Test: `apps/platform/lib/server/open-listings-api.test.ts`
- Create: `apps/platform/app/api/directory/open-listings/route.ts`
- Create: `apps/platform/app/api/directory/open-listings/version/route.ts`
- Modify: `apps/platform/lib/server/db.ts` (doc comment on `getStaffDb`)

Before writing route code, read `apps/platform/node_modules/next/dist/docs/` on route handlers, as `apps/platform/AGENTS.md` asks.

- [ ] **Step 1: Write the failing test**

```ts
// apps/platform/lib/server/open-listings-api.test.ts
import { describe, expect, it, vi } from "vitest";
import type { VisibleOpenListing } from "@brandbasket/db";
import { handleOpenListingsPage, handleOpenListingsVersion, toTuple } from "./open-listings-api";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const LISTING: VisibleOpenListing = {
  placeId: "z8p6tbs", name: "Shiv Drushti", categorySlug: "dentists", citySlug: "thane", areaSlug: "anand-nagar",
  address: "Anand Nagar 400607", lat: 19.27, lon: 72.96, website: "", source: "survey",
  phone: { e164: "+919850004227", foundOn: "call", checkedOn: "2026-10-05", whatsapp: true },
  urlCitySlug: "thane", urlSlug: "shiv-drushti",
};

function get(path: string, token: string | null = TOKEN): Request {
  return new Request(`https://app.fynix.digital${path}`, { headers: token === null ? {} : { authorization: `Bearer ${token}` } });
}

describe("toTuple", () => {
  it("writes the website's row order, then the phone", () => {
    expect(toTuple(LISTING)).toEqual([
      "Shiv Drushti", "dentists", "thane", "anand-nagar", "Anand Nagar 400607", 19.27, 72.96, "", "survey",
      "z8p6tbs", "thane", "shiv-drushti", "+919850004227", "call", "2026-10-05", true,
    ]);
    expect(toTuple({ ...LISTING, phone: null }).slice(12)).toEqual([null, null, null, false]);
  });
});

describe("handleOpenListingsVersion", () => {
  it("answers the version to the website", async () => {
    const res = await handleOpenListingsVersion(get("/api/directory/open-listings/version"), { token: TOKEN, readVersion: async () => "1|a|b" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contract: 1, version: "1|a|b" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses without the token, and when the platform has none", async () => {
    expect((await handleOpenListingsVersion(get("/x", null), { token: TOKEN, readVersion: async () => "v" })).status).toBe(401);
    expect((await handleOpenListingsVersion(get("/x", "wrong".repeat(10)), { token: TOKEN, readVersion: async () => "v" })).status).toBe(401);
    expect((await handleOpenListingsVersion(get("/x"), { token: null, readVersion: async () => "v" })).status).toBe(503);
  });
});

describe("handleOpenListingsPage", () => {
  it("answers one page with the next cursor", async () => {
    const readPage = vi.fn(async () => [LISTING]);
    const res = await handleOpenListingsPage(get("/api/directory/open-listings?limit=1"), {
      token: TOKEN, readVersion: async () => "v1", readPage,
    });
    expect(res.status).toBe(200);
    expect(readPage).toHaveBeenCalledWith({ after: null, limit: 1 });
    expect(await res.json()).toEqual({ contract: 1, version: "v1", listings: [toTuple(LISTING)], next: "z8p6tbs" });
  });

  it("gives no cursor on a short last page", async () => {
    const res = await handleOpenListingsPage(get("/api/directory/open-listings?after=k7m2q9a&limit=5"), {
      token: TOKEN, readVersion: async () => "v1", readPage: async () => [LISTING],
    });
    expect((await res.json()).next).toBeNull();
  });

  it("refuses a bad cursor or limit", async () => {
    const deps = { token: TOKEN, readVersion: async () => "v1", readPage: async () => [] };
    expect((await handleOpenListingsPage(get("/api/directory/open-listings?after=NOPE"), deps)).status).toBe(400);
    expect((await handleOpenListingsPage(get("/api/directory/open-listings?limit=0"), deps)).status).toBe(400);
    expect((await handleOpenListingsPage(get("/api/directory/open-listings?limit=5001"), deps)).status).toBe(400);
  });

  it("answers 503 when the database fails", async () => {
    const res = await handleOpenListingsPage(get("/api/directory/open-listings"), {
      token: TOKEN, readVersion: async () => { throw new Error("down"); }, readPage: async () => [],
    });
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @brandbasket/platform test -- open-listings-api`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the handlers**

```ts
// apps/platform/lib/server/open-listings-api.ts
import "server-only";
import type { VisibleOpenListing } from "@brandbasket/db";
import { isPlaceId } from "@brandbasket/db/place-id";
import {
  OPEN_LISTINGS_CONTRACT_VERSION,
  OPEN_LISTINGS_MAX_PAGE,
  type OpenListingTuple,
  type OpenListingsPage,
  type OpenListingsVersion,
} from "@brandbasket/shared/lib/directory/open-listings-contract";
import { errorLogInfo } from "@/lib/server/error-log";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

/*
 * The directory's open-data and surveyed businesses for the marketing website's server (the contract is
 * packages/shared/src/lib/directory/open-listings-contract.ts). Server-to-server only, with LEADS_API_TOKEN: the rows
 * are public on the directory one page at a time, but the whole set in one go is not for anyone else to copy.
 */

export interface OpenListingsDeps {
  readonly token: string | null;
  readonly readVersion: () => Promise<string>;
}

export interface OpenListingsPageDeps extends OpenListingsDeps {
  readonly readPage: (page: { readonly after: string | null; readonly limit: number }) => Promise<readonly VisibleOpenListing[]>;
}

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function refused(request: Request, token: string | null): Response | null {
  if (token === null) return reply(503, { error: "The directory API is not configured." });
  if (!hasValidWebsiteToken(request, token)) return reply(401, { error: "Unauthorised." });
  return null;
}

export function toTuple(listing: VisibleOpenListing): OpenListingTuple {
  return [
    listing.name, listing.categorySlug, listing.citySlug, listing.areaSlug, listing.address, listing.lat, listing.lon,
    listing.website, listing.source, listing.placeId, listing.urlCitySlug, listing.urlSlug,
    listing.phone?.e164 ?? null, listing.phone?.foundOn ?? null, listing.phone?.checkedOn ?? null,
    listing.phone?.whatsapp ?? false,
  ];
}

export async function handleOpenListingsVersion(request: Request, deps: OpenListingsDeps): Promise<Response> {
  const refusal = refused(request, deps.token);
  if (refusal !== null) return refusal;
  try {
    const body: OpenListingsVersion = { contract: OPEN_LISTINGS_CONTRACT_VERSION, version: await deps.readVersion() };
    return reply(200, body);
  } catch (error) {
    console.error("[fynix:directory] GET /api/directory/open-listings/version failed", errorLogInfo(error));
    return reply(503, { error: "Listings are unavailable right now." });
  }
}

function parsePage(url: URL): { readonly after: string | null; readonly limit: number } | null {
  const after = url.searchParams.get("after");
  const limitText = url.searchParams.get("limit");
  const limit = limitText === null ? OPEN_LISTINGS_MAX_PAGE : Number(limitText);
  if (after !== null && !isPlaceId(after)) return null;
  if (!Number.isInteger(limit) || limit < 1 || limit > OPEN_LISTINGS_MAX_PAGE) return null;
  return { after, limit };
}

export async function handleOpenListingsPage(request: Request, deps: OpenListingsPageDeps): Promise<Response> {
  const refusal = refused(request, deps.token);
  if (refusal !== null) return refusal;
  const page = parsePage(new URL(request.url));
  if (page === null) return reply(400, { error: `after must be a place id and limit 1 to ${OPEN_LISTINGS_MAX_PAGE}.` });
  try {
    const version = await deps.readVersion();
    const rows = await deps.readPage(page);
    const body: OpenListingsPage = {
      contract: OPEN_LISTINGS_CONTRACT_VERSION,
      version,
      listings: rows.map(toTuple),
      next: rows.length === page.limit ? (rows.at(-1)?.placeId ?? null) : null,
    };
    return reply(200, body);
  } catch (error) {
    console.error("[fynix:directory] GET /api/directory/open-listings failed", errorLogInfo(error));
    return reply(503, { error: "Listings are unavailable right now." });
  }
}
```

Check the import path of the shared module against how other platform files import from `@brandbasket/shared` (for example `grep -rn "@brandbasket/shared/lib/directory" apps/platform/lib | head -3`), and use the same form.

- [ ] **Step 4: The routes**

```ts
// apps/platform/app/api/directory/open-listings/version/route.ts
import { openListingsVersion } from "@brandbasket/db";
import { getStaffDb } from "@/lib/server/db";
import { handleOpenListingsVersion } from "@/lib/server/open-listings-api";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/** `GET /api/directory/open-listings/version`: see lib/server/open-listings-api.ts. */
export function GET(request: Request): Promise<Response> {
  return handleOpenListingsVersion(request, {
    token: leadsApiToken(),
    readVersion: () => openListingsVersion(getStaffDb()),
  });
}
```

```ts
// apps/platform/app/api/directory/open-listings/route.ts
import { openListingsVersion, listVisibleOpenListings } from "@brandbasket/db";
import { getStaffDb } from "@/lib/server/db";
import { handleOpenListingsPage } from "@/lib/server/open-listings-api";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/** `GET /api/directory/open-listings?after=<place id>&limit=<n>`: see lib/server/open-listings-api.ts. */
export function GET(request: Request): Promise<Response> {
  return handleOpenListingsPage(request, {
    token: leadsApiToken(),
    readVersion: () => openListingsVersion(getStaffDb()),
    readPage: (page) => listVisibleOpenListings(getStaffDb(), page),
  });
}
```

In `apps/platform/lib/server/db.ts`, extend the `getStaffDb` doc comment's list of the directory's routes. After `app/api/directory/signals/route.ts`, add `app/api/directory/open-listings/route.ts, app/api/directory/open-listings/version/route.ts (lib/server/open-listings-api.ts),`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @brandbasket/platform test -- open-listings-api`
Expected: PASS (8 tests).

- [ ] **Step 6: Try it end to end locally**

Start the platform dev server (launch config `listing-platform`, :3071, or the one this worktree uses). After Task 5's import, run:

```bash
curl -s -H "authorization: Bearer $LEADS_API_TOKEN" http://localhost:3071/api/directory/open-listings/version
```
Expected: `{"contract":1,"version":"37324|…|…"}`.

```bash
curl -s -H "authorization: Bearer $LEADS_API_TOKEN" "http://localhost:3071/api/directory/open-listings?limit=2"
```
Expected: two tuples and a `next` id.

- [ ] **Step 7: Checkpoint.** In `directory-ads`, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and `pnpm build`. All must pass. No commit.

---

## Part B: Website (`website-listing`)

### Task 8: Contract copy and page parsing (pure)

**Files:**
- Create: `lib/open-listings-contract.ts`
- Create: `lib/open-listings.ts`
- Test: `lib/open-listings.test.ts`

- [ ] **Step 1: Copy the contract**

Copy `directory-ads/packages/shared/src/lib/directory/open-listings-contract.ts` verbatim to `lib/open-listings-contract.ts`.

- [ ] **Step 2: Write the failing test**

```ts
// lib/open-listings.test.ts
import { describe, expect, it } from "vitest";
import { assembleSnapshot, parseOpenListingsPage, parseOpenListingsVersion } from "@/lib/open-listings";

const ROW = [
  "Shiv Drushti", "dentists", "thane", "anand-nagar", "Anand Nagar 400607", 19.27, 72.96, "", "survey",
  "z8p6tbs", "thane", "shiv-drushti", "+919850004227", "call", "2026-10-05", true,
] as const;
const NO_PHONE = [
  "Smile Dental", "dentists", "thane", "naupada", "Naupada", 19.19, 72.97, "https://smile.example/", "osm",
  "k7m2q9a", "thane", "smile-dental", null, null, null, false,
] as const;

describe("parseOpenListingsVersion", () => {
  it("reads the version, and nothing else", () => {
    expect(parseOpenListingsVersion({ contract: 1, version: "v1" })).toBe("v1");
    expect(parseOpenListingsVersion({ contract: 2, version: "v1" })).toBeNull();
    expect(parseOpenListingsVersion("nope")).toBeNull();
  });
});

describe("parseOpenListingsPage", () => {
  it("reads a page", () => {
    const page = parseOpenListingsPage({ contract: 1, version: "v1", listings: [ROW, NO_PHONE], next: null });
    expect(page?.listings).toHaveLength(2);
    expect(page?.next).toBeNull();
  });

  it("refuses a page with a bad row", () => {
    expect(parseOpenListingsPage({ contract: 1, version: "v1", listings: [[...ROW.slice(0, 9), "nope", ...ROW.slice(10)]], next: null })).toBeNull();
    expect(parseOpenListingsPage({ contract: 1, version: "v1", listings: [[...ROW.slice(0, 8), "google", ...ROW.slice(9)]], next: null })).toBeNull();
  });
});

describe("assembleSnapshot", () => {
  it("splits rows into the listing tuples and the phone lookup", () => {
    const snap = assembleSnapshot("v1", [ROW, NO_PHONE]);
    expect(snap.version).toBe("v1");
    expect(snap.rows[0]).toEqual(ROW.slice(0, 12));
    expect(snap.phones.get("z8p6tbs")).toEqual({ phone: "+919850004227", foundOn: null, checkedOn: "2026-10-05", whatsapp: true });
    expect(snap.phones.has("k7m2q9a")).toBe(false);
  });

  it("refuses one number on two businesses, as the phones file does", () => {
    const twin = [...NO_PHONE.slice(0, 12), "+919850004227", "https://smile.example/", "2026-10-01", true] as const;
    expect(() => assembleSnapshot("v1", [ROW, twin])).toThrow(/both/);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run lib/open-listings.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the module**

```ts
// lib/open-listings.ts
import { z } from "zod";
import { OPEN_LISTINGS_CONTRACT_VERSION } from "@/lib/open-listings-contract";
import { isPlaceId } from "@/lib/place-id";
import { parseSitePhones, type SitePhone } from "@/lib/site-phones";

/*
 * Reading the platform's /api/directory/open-listings (lib/open-listings-contract.ts) into the shape the directory
 * already uses: the first twelve fields of a row are a thane-listings.json row, and the phone becomes the same
 * lookup thane-site-phones.json gives (lib/site-phones.ts). Pure, so it is tested here; lib/server/open-listings.ts
 * fetches.
 */

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const tupleSchema = z.tuple([
  z.string().min(1),
  slug,
  slug,
  slug,
  z.string(),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.string(),
  z.enum(["osm", "overture", "survey"]),
  z.string().refine(isPlaceId, "not a place id"),
  slug,
  slug,
  z.string().nullable(),
  z.string().nullable(),
  z.string().nullable(),
  z.boolean(),
]);

const versionSchema = z.object({ contract: z.literal(OPEN_LISTINGS_CONTRACT_VERSION), version: z.string().min(1) });
const pageSchema = versionSchema.extend({ listings: z.array(tupleSchema), next: z.string().refine(isPlaceId).nullable() });

export type OpenListingRow = z.output<typeof tupleSchema>;
/** The first twelve fields: exactly a thane-listings.json row. */
export type ListingRowTuple = readonly [
  string, string, string, string, string, number, number, string, "osm" | "overture" | "survey", string, string, string,
];

export interface OpenListingsPageData {
  readonly version: string;
  readonly listings: readonly OpenListingRow[];
  readonly next: string | null;
}

export interface OpenListingsSnapshot {
  readonly version: string;
  readonly rows: readonly ListingRowTuple[];
  readonly phones: ReadonlyMap<string, SitePhone>;
}

export function parseOpenListingsVersion(body: unknown): string | null {
  const parsed = versionSchema.safeParse(body);
  return parsed.success ? parsed.data.version : null;
}

export function parseOpenListingsPage(body: unknown): OpenListingsPageData | null {
  const parsed = pageSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * The snapshot from every page's rows. Phones go through parseSitePhones, so they are checked exactly like the file
 * (E.164, a web page or "call", a date) and one number on two businesses throws.
 */
export function assembleSnapshot(version: string, rows: readonly OpenListingRow[]): OpenListingsSnapshot {
  const phoneEntries: Record<string, [string, string, string, boolean]> = {};
  const tuples: ListingRowTuple[] = [];
  for (const row of rows) {
    const [name, category, city, area, address, lat, lon, website, source, id, urlCity, urlSlug, phone, foundOn, checkedOn, whatsapp] = row;
    tuples.push([name, category, city, area, address, lat, lon, website, source, id, urlCity, urlSlug]);
    if (phone !== null && foundOn !== null && checkedOn !== null) phoneEntries[id] = [phone, foundOn, checkedOn, whatsapp];
  }
  return { version, rows: tuples, phones: parseSitePhones(phoneEntries) };
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run lib/open-listings.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Checkpoint.** Run `pnpm typecheck`. No commit.

---

### Task 9: Where listings come from (env)

**Files:**
- Modify: `lib/server/env.ts`
- Test: `lib/server/env.test.ts` (create it if absent, with `vi.mock("server-only", () => ({}));` at the top)
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```ts
// lib/server/env.test.ts — add (keep any existing tests)
import { describe, expect, it, vi } from "vitest";
import { parseDirectoryListingsSource } from "@/lib/server/env";

vi.mock("server-only", () => ({}));

describe("parseDirectoryListingsSource", () => {
  const platform = { PLATFORM_API_ORIGIN: "https://app.fynix.digital", LEADS_API_TOKEN: "t".repeat(40) };

  it("reads the files unless told otherwise", () => {
    expect(parseDirectoryListingsSource({})).toBe("file");
    expect(parseDirectoryListingsSource({ DIRECTORY_LISTINGS_SOURCE: " file " })).toBe("file");
  });

  it("reads the platform when asked and configured", () => {
    expect(parseDirectoryListingsSource({ ...platform, DIRECTORY_LISTINGS_SOURCE: "platform" })).toBe("platform");
  });

  it("refuses the platform without its connection, and unknown values", () => {
    expect(() => parseDirectoryListingsSource({ DIRECTORY_LISTINGS_SOURCE: "platform" })).toThrow(/PLATFORM_API_ORIGIN/);
    expect(() => parseDirectoryListingsSource({ DIRECTORY_LISTINGS_SOURCE: "db" })).toThrow(/DIRECTORY_LISTINGS_SOURCE/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run lib/server/env.test.ts`
Expected: FAIL, `parseDirectoryListingsSource` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/server/env.ts`:

```ts
/** Where the directory's open-data and surveyed businesses come from: the content/local files, or the platform. */
export type DirectoryListingsSource = "file" | "platform";

/**
 * DIRECTORY_LISTINGS_SOURCE: "file" (the default) reads content/local/thane-listings.json and thane-site-phones.json;
 * "platform" reads the platform's /api/directory/open-listings (lib/server/open-listings.ts) and falls back to the
 * files until the first read succeeds. "platform" needs PLATFORM_API_ORIGIN and LEADS_API_TOKEN.
 */
export function parseDirectoryListingsSource(env: Readonly<Record<string, string | undefined>>): DirectoryListingsSource {
  const value = present(env.DIRECTORY_LISTINGS_SOURCE) ?? "file";
  if (value !== "file" && value !== "platform") {
    throw new Error(`Invalid website configuration: DIRECTORY_LISTINGS_SOURCE must be "file" or "platform", not "${value}".`);
  }
  if (value === "platform" && parsePlatformEnv(env) === null) {
    throw new Error(
      "Invalid website configuration: DIRECTORY_LISTINGS_SOURCE=platform needs PLATFORM_API_ORIGIN and LEADS_API_TOKEN.",
    );
  }
  return value;
}

let cachedSource: DirectoryListingsSource | undefined;

export function directoryOpenListingsSource(): DirectoryListingsSource {
  cachedSource ??= parseDirectoryListingsSource(process.env);
  return cachedSource;
}
```

In `.env.example`, after the `LEADS_API_TOKEN` lines, add:

```bash
# Where the directory's businesses come from: "file" (content/local/thane-listings.json, the default) or "platform"
# (the platform's database, through /api/directory/open-listings; needs the two settings above).
DIRECTORY_LISTINGS_SOURCE=file
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/server/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint.** Run `pnpm typecheck`. No commit.

---

### Task 10: Keep the snapshot in memory

**Files:**
- Create: `lib/server/open-listings.ts`
- Test: `lib/server/open-listings.test.ts`
- Modify: `lib/server/platform-listings.ts` (`loadPlatformListings`)

- [ ] **Step 1: Write the failing test**

Mirror `lib/server/platform-listings.test.ts`: mock `env`, stub `fetch`, use fake timers, and re-import a fresh module each test.

```ts
// lib/server/open-listings.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const env = vi.hoisted(() => ({ source: "platform" as "file" | "platform" }));
vi.mock("@/lib/server/env", () => ({
  directoryOpenListingsSource: () => env.source,
  platformEnv: () => ({ PLATFORM_API_ORIGIN: "https://app.fynix.digital", LEADS_API_TOKEN: "t".repeat(40) }),
}));

const ROW = ["Smile", "dentists", "thane", "naupada", "Naupada", 19.19, 72.97, "", "osm", "k7m2q9a", "thane", "smile", null, null, null, false];
const ROW2 = ["Shiv", "dentists", "thane", "anand-nagar", "Anand Nagar", 19.27, 72.96, "", "survey", "z8p6tbs", "thane", "shiv", "+919850004227", "call", "2026-10-05", true];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function freshModule(): Promise<typeof import("@/lib/server/open-listings")> {
  vi.resetModules();
  return import("@/lib/server/open-listings");
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  env.source = "platform";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("loadOpenListings", () => {
  it("reads every page into one snapshot", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ contract: 1, version: "v1" }))
      .mockResolvedValueOnce(json({ contract: 1, version: "v1", listings: [ROW], next: "k7m2q9a" }))
      .mockResolvedValueOnce(json({ contract: 1, version: "v1", listings: [ROW2], next: null }));
    const mod = await freshModule();
    await mod.loadOpenListings();
    const snap = mod.openListingsSnapshot();
    expect(snap?.rows.map((row) => row[9])).toEqual(["k7m2q9a", "z8p6tbs"]);
    expect(snap?.phones.get("z8p6tbs")?.phone).toBe("+919850004227");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("after=k7m2q9a");
  });

  it("checks only the version while it is unchanged, at most once a minute", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ contract: 1, version: "v1" }))
      .mockResolvedValueOnce(json({ contract: 1, version: "v1", listings: [ROW], next: null }))
      .mockResolvedValueOnce(json({ contract: 1, version: "v1" }));
    const mod = await freshModule();
    await mod.loadOpenListings();
    const first = mod.openListingsSnapshot();
    await mod.loadOpenListings();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(61_000);
    await mod.loadOpenListings();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mod.openListingsSnapshot()).toBe(first);
  });

  it("keeps the last snapshot when a read fails or the version moves mid-read", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ contract: 1, version: "v1" }))
      .mockResolvedValueOnce(json({ contract: 1, version: "v1", listings: [ROW], next: null }))
      .mockResolvedValueOnce(json({ contract: 1, version: "v2" }))
      .mockResolvedValueOnce(json({ contract: 1, version: "v2", listings: [ROW], next: "k7m2q9a" }))
      .mockResolvedValueOnce(json({ contract: 1, version: "v3", listings: [ROW2], next: null }));
    const mod = await freshModule();
    await mod.loadOpenListings();
    const first = mod.openListingsSnapshot();
    vi.advanceTimersByTime(61_000);
    await mod.loadOpenListings();
    expect(mod.openListingsSnapshot()).toBe(first);

    fetchMock.mockRejectedValueOnce(new Error("down"));
    vi.advanceTimersByTime(61_000);
    await mod.loadOpenListings();
    expect(mod.openListingsSnapshot()).toBe(first);
  });

  it("does nothing when the files are the source", async () => {
    env.source = "file";
    const mod = await freshModule();
    await mod.loadOpenListings();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.openListingsSnapshot()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run lib/server/open-listings.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the loader**

```ts
// lib/server/open-listings.ts
import "server-only";
import { LEADS_API_AUTH_HEADER } from "@/lib/leads-api";
import { OPEN_LISTINGS_MAX_PAGE, OPEN_LISTINGS_PATH, OPEN_LISTINGS_VERSION_PATH } from "@/lib/open-listings-contract";
import {
  assembleSnapshot,
  parseOpenListingsPage,
  parseOpenListingsVersion,
  type OpenListingRow,
  type OpenListingsSnapshot,
} from "@/lib/open-listings";
import { directoryOpenListingsSource, platformEnv, type PlatformEnv } from "@/lib/server/env";

/**
 * The directory's open-data and surveyed businesses from the platform's database (DIRECTORY_LISTINGS_SOURCE=platform),
 * kept in memory by this server instance like the platform feed (platform-listings.ts): the directory's lookups are
 * synchronous, so the data is fetched ahead of them. At most once a minute it asks for the version (a few bytes),
 * and reads every page again only when the version changed.
 *
 * Never fails a page: until the first read succeeds the directory uses the content/local files, and after a failed
 * read it keeps the last snapshot and tries again shortly.
 */

const FRESH_MS = 60_000;
const RETRY_MS = 10_000;
const READ_TIMEOUT_MS = 10_000;
/** 37k rows today is 8 pages; a runaway cursor stops here. */
const MAX_PAGES = 200;

let snapshot: OpenListingsSnapshot | null = null;
let nextReadAt = 0;
let reading: Promise<void> | null = null;

async function getJson(env: PlatformEnv, path: string, query: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(path, env.PLATFORM_API_ORIGIN);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { [LEADS_API_AUTH_HEADER]: `Bearer ${env.LEADS_API_TOKEN}` },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`the platform answered ${response.status}`);
  return response.json();
}

async function readAll(env: PlatformEnv, version: string): Promise<OpenListingsSnapshot> {
  const rows: OpenListingRow[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query: Record<string, string> = { limit: String(OPEN_LISTINGS_MAX_PAGE) };
    if (after !== null) query.after = after;
    const parsed = parseOpenListingsPage(await getJson(env, OPEN_LISTINGS_PATH, query));
    if (parsed === null) throw new Error("a page of listings did not match the expected shape");
    if (parsed.version !== version) throw new Error("the listings changed while they were being read");
    rows.push(...parsed.listings);
    if (parsed.next === null) return assembleSnapshot(version, rows);
    after = parsed.next;
  }
  throw new Error(`more than ${MAX_PAGES} pages of listings`);
}

async function read(env: PlatformEnv): Promise<void> {
  try {
    const version = parseOpenListingsVersion(await getJson(env, OPEN_LISTINGS_VERSION_PATH));
    if (version === null) throw new Error("the listings version did not match the expected shape");
    if (snapshot === null || snapshot.version !== version) snapshot = await readAll(env, version);
    nextReadAt = Date.now() + FRESH_MS;
  } catch (error) {
    console.warn(
      snapshot === null
        ? "Showing the directory from its files: could not read the platform's listings."
        : "Showing the directory's last listings: could not read the platform's newest.",
      error instanceof Error ? error.message : error,
    );
    nextReadAt = Date.now() + RETRY_MS;
  }
}

/** Makes sure the platform's listings are in memory and no more than a minute old. Safe to call from every page. */
export async function loadOpenListings(): Promise<void> {
  if (directoryOpenListingsSource() !== "platform" || Date.now() < nextReadAt) return;
  const env = platformEnv();
  if (env === null) return;
  reading ??= read(env).finally(() => {
    reading = null;
  });
  await reading;
}

/** The snapshot as last read (the same object until the data changes), or null: use the content/local files. */
export function openListingsSnapshot(): OpenListingsSnapshot | null {
  return snapshot;
}
```

- [ ] **Step 4: Load it with the feed**

In `lib/server/platform-listings.ts`, import the loader and load both together:

```ts
import { loadOpenListings } from "@/lib/server/open-listings";
```

Replace `loadPlatformListings`:

```ts
/**
 * Makes sure the platform's listings are in memory and no more than a minute old: its own businesses (the feed) and,
 * with DIRECTORY_LISTINGS_SOURCE=platform, the open-data and surveyed ones (open-listings.ts). Safe to call from every
 * page.
 */
export async function loadPlatformListings(): Promise<void> {
  await Promise.all([loadFeed(), loadOpenListings()]);
}

async function loadFeed(): Promise<void> {
  if (Date.now() < nextReadAt) return;
  const env = connection();
  if (env === null) return;
  // One read serves every request that arrives while it is in flight.
  reading ??= read(env).finally(() => {
    reading = null;
  });
  await reading;
}
```

`lib/server/platform-listings.test.ts` must still pass unchanged. Its env mock has no `directoryOpenListingsSource`, so mock the loader there too, adding this beside its other mocks:

```ts
vi.mock("@/lib/server/open-listings", () => ({ loadOpenListings: async () => undefined }));
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run lib/server/open-listings.test.ts lib/server/platform-listings.test.ts`
Expected: PASS.

- [ ] **Step 6: Checkpoint.** Run `pnpm typecheck`. No commit.

---

### Task 11: The directory reads the snapshot

**Files:**
- Modify: `lib/server/local-listings.ts` (`staticListings`, `current`)
- Modify: `lib/server/site-phones.ts`
- Test: `lib/server/local-listings.test.ts`, `lib/site-phones.test.ts` (existing files; add tests)

- [ ] **Step 1: Write the failing tests**

In `lib/server/local-listings.test.ts`, add a hoisted snapshot mock beside the existing `platform` mock:

```ts
const open = vi.hoisted(() => ({ snapshot: null as import("@/lib/open-listings").OpenListingsSnapshot | null }));
vi.mock("@/lib/server/open-listings", () => ({ openListingsSnapshot: () => open.snapshot }));
```

Add `open.snapshot = null;` to every existing `afterEach`. Then add:

```ts
describe("listings from the platform's database", () => {
  afterEach(() => {
    open.snapshot = null;
  });

  it("uses the snapshot instead of the files once it is loaded, and the files again without it", () => {
    const fromFile = allListings().length;
    expect(fromFile).toBeGreaterThan(30_000);
    open.snapshot = {
      version: "v1",
      rows: [["Snapshot Dental", "dentists", "thane", "naupada", "Naupada, Thane", 19.19, 72.97, "", "survey", "q9r8s7t", "thane", "snapshot-dental"]],
      phones: new Map(),
    };
    expect(allListings().map((listing) => listing.name)).toEqual(["Snapshot Dental"]);
    expect(findBusinessById("q9r8s7t")).toMatchObject({ source: "survey", urlSlug: "snapshot-dental" });
    open.snapshot = null;
    expect(allListings()).toHaveLength(fromFile);
  });
});
```

In `lib/site-phones.test.ts` nothing changes: `site-phones.ts` in `lib/server/` is not unit-tested today. Cover it with a new `lib/server/site-phones.test.ts`:

```ts
// lib/server/site-phones.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const open = vi.hoisted(() => ({ snapshot: null as import("@/lib/open-listings").OpenListingsSnapshot | null }));
vi.mock("@/lib/server/open-listings", () => ({ openListingsSnapshot: () => open.snapshot }));

import { sitePhoneFor } from "@/lib/server/site-phones";

afterEach(() => {
  open.snapshot = null;
});

describe("sitePhoneFor", () => {
  it("reads the snapshot's phones when there is a snapshot", () => {
    open.snapshot = {
      version: "v1",
      rows: [],
      phones: new Map([["q9r8s7t", { phone: "+919850004227", foundOn: null, checkedOn: "2026-10-05", whatsapp: true }]]),
    };
    expect(sitePhoneFor("q9r8s7t", new Date("2026-10-06T00:00:00Z"))?.phone).toBe("+919850004227");
  });

  it("reads the file otherwise", () => {
    expect(sitePhoneFor("q9r8s7t", new Date("2026-10-06T00:00:00Z"))).toBeUndefined();
  });
});
```

Add `"lib/server/*.test.ts"` coverage only if `vitest.config.mts` doesn't already include it. Its include is `lib/**/*.test.ts`, which does.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run lib/server/local-listings.test.ts lib/server/site-phones.test.ts`
Expected: the new tests FAIL (the snapshot is ignored).

- [ ] **Step 3: Read the snapshot in `local-listings.ts`**

Re-read the file first; other sessions edit it.

Add the import:

```ts
import { openListingsSnapshot } from "@/lib/server/open-listings";
```

Replace the `let cache: readonly Listing[] | null = null;` + `staticListings()` pair with the following. `rowSchema` and the mapping body are unchanged, only moved into `toListings`:

```ts
type ListingRow = z.output<typeof rowSchema>;

let fileRows: readonly ListingRow[] | null = null;
let cache: { readonly rows: readonly ListingRow[]; readonly listings: readonly Listing[] } | null = null;

/** The open-data and surveyed rows: the platform's snapshot when one is loaded (open-listings.ts), else the file. */
function sourceRows(): readonly ListingRow[] {
  const snapshot = openListingsSnapshot();
  if (snapshot !== null) return snapshot.rows;
  fileRows ??= z.array(rowSchema).parse(JSON.parse(readFileSync(LISTINGS_FILE, "utf8")));
  return fileRows;
}

/** The same array until the rows change, so the merge and the search engine are rebuilt only then. */
function staticListings(): readonly Listing[] {
  const rows = sourceRows();
  if (cache?.rows === rows) return cache.listings;
  const listings = rows.map(([name, service, city, area, address, lat, lon, website, source, id, urlCity, urlSlug]) => ({
    id,
    urlCode: businessUrlCode(id),
    urlCity,
    urlSlug,
    name,
    service,
    city,
    area,
    address,
    lat,
    lon,
    website,
    source,
  }));
  cache = { rows, listings };
  return listings;
}
```

The snapshot's tuples were already checked with zod (`lib/open-listings.ts`) and have the same shape as `rowSchema`'s output, so they are not parsed again. If `tsc` reports that `ListingRowTuple` isn't assignable to `ListingRow`, make `sourceRows` return `readonly (ListingRow | ListingRowTuple)[]` and type the destructuring the same way; don't add a cast.

Make the merged cache notice a changed base. In the `Merged` interface add `readonly base: readonly Listing[];`. In `current()`:
- First line: `const feed = platformFeed();` stays. After it, add `const base = staticListings();`.
- Change `if (merged !== null && merged.feed === feed) return merged;` to `if (merged !== null && merged.feed === feed && merged.base === base) return merged;`.
- Change the content shortcut `if (merged !== null && merged.content === content) {` to `if (merged !== null && merged.content === content && merged.base === base) {`, and add `base` to the object it builds.
- In the two places `staticListings()` is called inside `current()` (the `kept` line), use `base` instead.
- Add `base` to the final `merged = { ... }` object.

- [ ] **Step 4: Phones from the snapshot**

In `lib/server/site-phones.ts`, add the import:

```ts
import { openListingsSnapshot } from "@/lib/server/open-listings";
```

Change `sitePhones()`:

```ts
function sitePhones(): ReadonlyMap<string, SitePhone> {
  const snapshot = openListingsSnapshot();
  if (snapshot !== null) return snapshot.phones;
  cache ??= parseSitePhones(JSON.parse(readFileSync(SITE_PHONES_FILE, "utf8")));
  return cache;
}
```

Update the file's doc comment: "…read once per server instance from content/local/thane-site-phones.json, or from the platform's snapshot when DIRECTORY_LISTINGS_SOURCE=platform (open-listings.ts)…".

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run lib/server/local-listings.test.ts lib/server/site-phones.test.ts`
Expected: PASS, including every existing test.

- [ ] **Step 6: Checkpoint.** Run `pnpm test` (whole suite) and `pnpm typecheck`. No commit.

---

### Task 12: Close the three load gaps

Three readers use the listings without loading them first, so they see whatever the instance last loaded. With the platform as the source, a fresh instance would serve them from the files until another page loads the snapshot.

**Files:**
- Modify: `app/api/locate/route.ts`
- Modify: `components/home-options/service-group-page.tsx`
- Modify: `components/home-options/home-data.ts`

- [ ] **Step 1: `app/api/locate/route.ts`**

The handler is `export function GET(request: NextRequest): Response` (line 37). Make it async and load first:

```ts
import { loadPlatformListings } from "@/lib/server/platform-listings";
```

```ts
export async function GET(request: NextRequest): Promise<Response> {
  await loadPlatformListings();
  // …the existing body, unchanged…
}
```

- [ ] **Step 2: `components/home-options/service-group-page.tsx`**

At the top of `ServiceGroupPage` (line 117), before `serviceCounts(...)` is reached, add:

```ts
  await loadPlatformListings();
```

with `import { loadPlatformListings } from "@/lib/server/platform-listings";`.

- [ ] **Step 3: `components/home-options/home-data.ts`**

As the first statement of `loadHomeData()` (line 39), add `await loadPlatformListings();` and import it.

- [ ] **Step 4: Checkpoint.** Run `pnpm lint`, `pnpm typecheck` and `pnpm test`. No commit.

---

### Task 13: End to end, locally

- [ ] **Step 1: Platform side.** In the `directory-ads` worktree, with its dev database migrated and Tasks 1 and 5 run (places and listings imported), start the platform (e.g. `listing-platform`, :3071).

- [ ] **Step 2: Website side.** Start the website with `DIRECTORY_LISTINGS_SOURCE=platform`, `PLATFORM_API_ORIGIN=http://localhost:3071` and the same `LEADS_API_TOKEN`. Use the `listing-wired-dev` launch config, or add a config beside `listing-website` with those three env values on a free port.

- [ ] **Step 3: Check, with evidence**

1. Open `/in/mh/thane/anand-nagar/dentists`. Shiv Drushti dental clinic is listed. The platform log shows one `GET /api/directory/open-listings/version` and 8 `GET /api/directory/open-listings` page reads.
2. Open its business page. It shows "Number confirmed by phone" and the number.
3. Reload twice within a minute. The platform log shows no new reads.
4. Change one listing in the database:
   ```bash
   psql "$DATABASE_URL_STAFF" -c "update directory_open_listings set name = 'Shiv Drushti Dental Clinic', updated_at = now() where place_id = 'z8p6tbs'"
   ```
   Within about a minute, the area page shows the new name with **no website rebuild**. The platform log shows a version read followed by a full page read.
5. Stop the platform. The website keeps serving the last snapshot; its log shows "could not read the platform's newest".
6. Restart the website with the platform still stopped. It serves from the files ("Showing the directory from its files").
7. Search the header box for "shiv drushti". The clinic is suggested, so MiniSearch was rebuilt from the snapshot.

Take screenshots of 1, 2 and 4.

- [ ] **Step 4: Checkpoint.** In `website-listing`, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`; in `directory-ads`, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and `pnpm build`. All must pass.

---

### Task 14: Rollout (with the user; each step needs their go-ahead)

Production order matters: the database must hold every listing before the website switches.

1. **Platform to main.** The user merges the platform branch with Tasks 1–7. Merging to main deploys the droplet (GitHub Actions, env `Droplet`) and runs migrations 0088–0090. Then check:
   ```bash
   psql "$DATABASE_URL_OWNER" -c "select extname from pg_extension where extname in ('pg_trgm','unaccent')"
   ```
   Expected: both rows. If `CREATE EXTENSION` failed because the owner role lacks rights, a superuser runs the two `CREATE EXTENSION` lines once and the deploy is retried.
2. **Places, then listings, into production.** From a machine with the production staff connection (the user provides it; never print it), using the same dataset build the website currently serves:
   ```bash
   pnpm directory:import-places ../local-directory-data/thane/thane-place-ledger.json
   ```
   ```bash
   pnpm directory:import-listings ../website-listing/content/local/thane-listings.json ../website-listing/content/local/thane-site-phones.json
   ```
   Expected counts match the files: 37,324 listings and 3,229 phones at the time of writing.
3. **Check the API from outside:**
   ```bash
   curl -s -H "authorization: Bearer $LEADS_API_TOKEN" https://app.fynix.digital/api/directory/open-listings/version
   ```
   Expected: the visible count matches.
4. **Website, still on files.** The user merges the website changes (Tasks 8–12) to main with `DIRECTORY_LISTINGS_SOURCE` unset, so nothing changes for visitors.
5. **Switch.** Set `DIRECTORY_LISTINGS_SOURCE=platform` in Vercel → Production and redeploy. Check a survey clinic page, an area page and the header search. Watch the platform's CPU and memory for a day: expect a version read per website instance per minute, and page reads only after imports.
6. **From then on, a data change** (a new survey, a dataset rebuild) is `build_web_data.py` → `build_site_phones.py` → `pnpm directory:import-places` → `pnpm directory:import-listings`, and it is live within a minute, with no website deploy.
7. **Later (a separate change, after a week on the platform):** stop shipping `thane-listings.json` and `thane-site-phones.json` to Vercel (`next.config.ts` `outputFileTracingIncludes`), and make the build scripts write to a data folder instead of the website. Until then the files remain the fallback.

---

## Self-review notes

- **Survey refs.** Task 1 fixes the import refusal found on 2026-10-06. Task 5's integration needs it.
- **Unchanged rows don't bump the version** (`setWhere`), so a re-import with no changes costs the website nothing. Hidden rows bump it, so they disappear within a minute.
- **The phone rules stay the website's.** The 183-day freshness check (`sitePhoneFor`) and the one-number-two-businesses check (`parseSitePhones`) run on snapshot phones exactly as on the file.
- **Load.** Per website instance: one ~60-byte version request a minute. After a change: 8 × ~1.6 MB page reads, then a MiniSearch rebuild (~0.2 s). Database: an indexed `count`/`max` per version check, and keyset page reads only after imports.
- **What this plan does not do:** staff editing, per-request queries, and Postgres search on the website. The `search` column and indexes are built and tested (Task 4, "keeps the search document up to date") for the state-wide plan.
