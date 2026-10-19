# India-wide Business Profiles (PIN code) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any business anywhere in India can make its free Business profile page. The owner gives a 6-digit PIN code instead of picking a Thane area, and the page goes live at `fynix.digital/in/{state}/business/{name}/{code}`.

**Architecture:**
- A new `india_pincodes` table holds India Post's PIN code directory: state, district and post-office localities per code. It is imported once from the public CSV.
- The Listing tab asks for the PIN code first:
  - A PIN in an **opened** district (only Thane today) keeps the existing area picker.
  - Any other PIN picks a locality from that PIN's post offices. It is saved as an "elsewhere" claim whose listing key is `<category>/<state>-<district>/<locality>/<slug>`.
  - The place records its real state code.
- The feed sends a new optional `postal` block. The website keeps these businesses **out of** the Thane listing pool, so they get no area or category pages, no ads and no ranking. They are indexed by URL code and rendered on a simpler business page under a now state-aware `/in/[state]/...` route tree.

**Tech Stack:**
- Platform: Next 16, Drizzle + Postgres, vitest, pnpm workspaces.
- Website: Next 16, zod, vitest.

**Repos and where work happens**
- Platform: `directory-ads`, branch `feat/directory-ads`, clean at `7d3b7c1`. Do Part A and Part B in a fresh worktree off it.
- Website: the `website-listing` worktree, which holds **uncommitted work from other sessions** in `lib/server/local-listings.ts`, the `in/mh/**` pages, `lib/local-directory.ts` and more. Re-read every file before editing it, and never revert lines you didn't write.
- **No commits.** The user commits on request ([[no-commits-without-ask]]). Each task ends with a checkpoint (run the checks), not `git commit`.

**Decisions taken in chat on 2026-10-06, not to be re-asked:**
- Any business in India can list.
- No area list is needed. The PIN code gives the state and district; the locality comes from the post offices.
- Districts we have not opened get only the business's own page. There are no area or category pages there and no ads, until we open the district.
- Reviews, enquiries, search beyond Thane and browse pages for other states are **out of scope**. They come with the state-wide plan (`statewide-directory`).

**Before Task 3 (the user does this):** download India Post's "All India Pincode Directory" CSV from data.gov.in (GODL-India licence: attribution required). Save it as `local-directory-data/india/pincode-directory.csv`. Downloading needs the user's go-ahead, so ask and don't fetch it yourself. The expected header (Task 2 checks it) is:
`circlename,regionname,divisionname,officename,pincode,officetype,delivery,district,statename,latitude,longitude`

---

## File map

**Platform: `directory-ads`**

| File | Change | Responsibility |
|---|---|---|
| `packages/shared/src/lib/directory/india-states.ts` | create | ISO 3166-2:IN codes, mapping India Post state names to codes, state names |
| `packages/shared/src/lib/directory/india-states.test.ts` | create | tests |
| `packages/db/src/india-post.ts` | create | pure CSV parser: rows → one `PincodeRecord` per PIN |
| `packages/db/src/india-post.test.ts` | create | tests |
| `packages/db/src/schema/india-pincodes.ts` | create | `india_pincodes` table |
| `packages/db/src/schema/index.ts` | modify | export it |
| `packages/db/src/schema/directory-ads.ts` | modify | `directory_claims.pincode`, `locality_name` |
| `packages/db/migrations/0084_india_pincodes.sql` (+ meta) | generate | table |
| `packages/db/migrations/0085_india_pincodes_grants.sql` | hand-write | grants |
| `packages/db/migrations/0086_claims_postal.sql` (+ meta) | generate | claim columns |
| `packages/db/src/queries/india-pincodes.ts` | create | `findPincode`, `upsertPincodes` |
| `packages/db/src/queries/india-pincodes.integration.test.ts` | create | tests |
| `packages/db/scripts/import-india-pincodes.ts` | create | `pnpm directory:import-pincodes <csv>` |
| `packages/db/src/queries/directory-places.ts` | modify | `createPlatformPlace` takes `stateCode` |
| `packages/db/src/queries/directory-ads.ts` | modify | `NewBusinessListing` + postal; added-business reads carry state and postal |
| `packages/shared/src/lib/directory/feed-contract.ts` | modify | optional `postal` on added entries |
| `packages/shared/src/lib/directory/feed.ts` | modify | state from the place, `postal` block |
| `apps/platform/lib/listing-location.ts` | create | pure: opened districts, elsewhere key parts, the PIN lookup's public shape |
| `apps/platform/lib/business-listing-form.ts` | modify | PIN-first parse, two outcomes |
| `apps/platform/lib/server/business-profile.ts` | modify | `saveOwnListing` checks the PIN, saves either kind |
| `apps/platform/app/app-host/(protected)/business/actions.ts` | modify | `lookupPincodeAction` |
| `apps/platform/components/panel/business/listing-form.tsx` | modify | PIN step, locality list, URL preview |
| `apps/platform/app/app-host/(protected)/business/page.tsx` | modify | saved picks for both kinds; "View your page" address |
| `apps/admin/app/(protected)/ads/page.tsx` | modify | claim row shows PIN and locality |

**Website: `website-listing`**

| File | Change | Responsibility |
|---|---|---|
| `lib/india-states.ts` (+ test) | create | copy of the platform's state codes (same vectors) |
| `app/(marketing)/in/mh/**` → `app/(marketing)/in/[state]/**` | move | state-aware routes |
| `lib/directory-routes.ts` | modify | `isDirectoryState` guard |
| `lib/place-id.ts` | modify | `businessPath` takes an optional `stateCode` |
| `lib/directory-feed.ts` (+ test) | modify | parse `postal`; merge sends elsewhere businesses to their own list |
| `lib/server/local-listings.ts` (+ test) | modify | index elsewhere businesses by URL code |
| `components/local/elsewhere-business.tsx` | create | the page for a business outside opened districts |
| `app/sitemap.ts` | modify | list those pages |

---

## Part A: PIN code data (platform)

### Task 1: State codes

**Files:**
- Create: `packages/shared/src/lib/directory/india-states.ts`
- Test: `packages/shared/src/lib/directory/india-states.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { INDIA_STATES, isIndiaStateCode, stateCodeOfIndiaPostName, stateName } from "./india-states";

describe("india states", () => {
  it("has the 36 states and union territories, codes unique and lower-case", () => {
    expect(INDIA_STATES).toHaveLength(36);
    expect(new Set(INDIA_STATES.map((s) => s.code)).size).toBe(36);
    for (const state of INDIA_STATES) expect(state.code).toMatch(/^[a-z]{2}$/);
  });

  it.each([
    ["MAHARASHTRA", "mh"],
    ["WEST BENGAL", "wb"],
    ["  West  Bengal ", "wb"],
    ["THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "dh"],
    ["DELHI", "dl"],
    ["ODISHA", "od"],
    ["TELANGANA", "tg"],
    ["JAMMU AND KASHMIR", "jk"],
    ["ANDAMAN AND NICOBAR ISLANDS", "an"],
    ["Andaman & Nicobar Islands", "an"],
  ])("reads India Post's %j as %s", (name, code) => {
    expect(stateCodeOfIndiaPostName(name)).toBe(code);
  });

  it("returns null for a name it does not know", () => {
    expect(stateCodeOfIndiaPostName("ATLANTIS")).toBeNull();
  });

  it("names a state by code", () => {
    expect(stateName("wb")).toBe("West Bengal");
    expect(stateName("xx")).toBeNull();
    expect(isIndiaStateCode("mh")).toBe(true);
    expect(isIndiaStateCode("xx")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @brandbasket/shared test -- india-states`
Expected: FAIL, "Cannot find module './india-states'".

- [ ] **Step 3: Implement**

```ts
/*
 * India's states and union territories by their ISO 3166-2:IN code, lower-cased: the second segment of every
 * directory URL (/in/mh/..., /in/wb/...). Codes follow the 2023 ISO update (od, tg, cg, uk, dh). The website keeps a
 * copy (website-listing lib/india-states.ts); the two test files hold the same vectors so the copies stay in step.
 * Pure and browser-safe.
 */

export interface IndiaState {
  readonly code: string;
  readonly name: string;
  /** Other spellings India Post's directory uses, upper-cased and normalised as `normaliseName` does. */
  readonly aliases?: readonly string[];
}

export const INDIA_STATES: readonly IndiaState[] = [
  { code: "an", name: "Andaman and Nicobar Islands" },
  { code: "ap", name: "Andhra Pradesh" },
  { code: "ar", name: "Arunachal Pradesh" },
  { code: "as", name: "Assam" },
  { code: "br", name: "Bihar" },
  { code: "ch", name: "Chandigarh" },
  { code: "cg", name: "Chhattisgarh" },
  {
    code: "dh",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    aliases: ["THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "DADRA AND NAGAR HAVELI", "DAMAN AND DIU"],
  },
  { code: "dl", name: "Delhi", aliases: ["NCT OF DELHI"] },
  { code: "ga", name: "Goa" },
  { code: "gj", name: "Gujarat" },
  { code: "hr", name: "Haryana" },
  { code: "hp", name: "Himachal Pradesh" },
  { code: "jk", name: "Jammu and Kashmir" },
  { code: "jh", name: "Jharkhand" },
  { code: "ka", name: "Karnataka" },
  { code: "kl", name: "Kerala" },
  { code: "la", name: "Ladakh" },
  { code: "ld", name: "Lakshadweep" },
  { code: "mp", name: "Madhya Pradesh" },
  { code: "mh", name: "Maharashtra" },
  { code: "mn", name: "Manipur" },
  { code: "ml", name: "Meghalaya" },
  { code: "mz", name: "Mizoram" },
  { code: "nl", name: "Nagaland" },
  { code: "od", name: "Odisha", aliases: ["ORISSA"] },
  { code: "py", name: "Puducherry", aliases: ["PONDICHERRY"] },
  { code: "pb", name: "Punjab" },
  { code: "rj", name: "Rajasthan" },
  { code: "sk", name: "Sikkim" },
  { code: "tn", name: "Tamil Nadu" },
  { code: "tg", name: "Telangana" },
  { code: "tr", name: "Tripura" },
  { code: "up", name: "Uttar Pradesh" },
  { code: "uk", name: "Uttarakhand", aliases: ["UTTARANCHAL"] },
  { code: "wb", name: "West Bengal" },
];

/** "  Andaman & Nicobar  islands " -> "ANDAMAN AND NICOBAR ISLANDS". */
function normaliseName(name: string): string {
  return name.replace(/&/g, " and ").replace(/\s+/g, " ").trim().toUpperCase();
}

const byName = new Map<string, string>();
for (const state of INDIA_STATES) {
  byName.set(normaliseName(state.name), state.code);
  for (const alias of state.aliases ?? []) byName.set(normaliseName(alias), state.code);
}
const byCode = new Map(INDIA_STATES.map((state) => [state.code, state]));

/** The state code for a state name as India Post's directory writes it, or null for a name it does not know. */
export function stateCodeOfIndiaPostName(name: string): string | null {
  return byName.get(normaliseName(name)) ?? null;
}

export function isIndiaStateCode(code: string): boolean {
  return byCode.has(code);
}

export function stateName(code: string): string | null {
  return byCode.get(code)?.name ?? null;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @brandbasket/shared test -- india-states`
Expected: PASS (13 tests).

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @brandbasket/shared typecheck`. Expected: 0 errors. Don't commit.

---

### Task 2: India Post CSV parser

**Files:**
- Create: `packages/db/src/india-post.ts`
- Test: `packages/db/src/india-post.test.ts`

The directory has about 165k post-office rows and about 19k PIN codes. One PIN can list several offices, and very rarely two districts. In that case we keep the district with the most offices and report the PIN.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { cleanOfficeName, parseIndiaPostCsv, toSlug } from "./india-post";

const HEADER = "circlename,regionname,divisionname,officename,pincode,officetype,delivery,district,statename,latitude,longitude";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("cleanOfficeName", () => {
  it.each([
    ["Salt Lake Sector V S.O", "Salt Lake Sector V"],
    ["Bidhannagar CK Market S.O", "Bidhannagar CK Market"],
    ["Naupada B.O", "Naupada"],
    ["Thane H.O", "Thane"],
    ["Kalyan  SO", "Kalyan"],
  ])("%j -> %j", (raw, clean) => expect(cleanOfficeName(raw)).toBe(clean));
});

describe("toSlug", () => {
  it("kebab-cases and drops punctuation", () => {
    expect(toSlug("North 24 Parganas")).toBe("north-24-parganas");
    expect(toSlug("Bidhannagar C.K. Market")).toBe("bidhannagar-c-k-market");
  });
});

describe("parseIndiaPostCsv", () => {
  it("groups offices by PIN, with state code, district and A-Z localities", () => {
    const result = parseIndiaPostCsv(
      csv(
        "West Bengal Circle,Kolkata,Salt Lake,Salt Lake Sector V S.O,700091,S.O,Delivery,NORTH 24 PARGANAS,WEST BENGAL,22.57,88.43",
        "West Bengal Circle,Kolkata,Salt Lake,Bidhannagar CK Market S.O,700091,S.O,Non Delivery,NORTH 24 PARGANAS,WEST BENGAL,NA,NA",
      ),
    );
    expect(result.records).toEqual([
      {
        pincode: "700091",
        stateCode: "wb",
        districtSlug: "north-24-parganas",
        districtName: "North 24 Parganas",
        localities: [
          { slug: "bidhannagar-ck-market", name: "Bidhannagar CK Market" },
          { slug: "salt-lake-sector-v", name: "Salt Lake Sector V" },
        ],
      },
    ]);
    expect(result.problems).toEqual([]);
  });

  it("keeps the district with most offices when a PIN spans two, and reports it", () => {
    const result = parseIndiaPostCsv(
      csv(
        "c,r,d,A B.O,421302,B.O,Delivery,THANE,MAHARASHTRA,NA,NA",
        "c,r,d,B B.O,421302,B.O,Delivery,THANE,MAHARASHTRA,NA,NA",
        "c,r,d,C B.O,421302,B.O,Delivery,PALGHAR,MAHARASHTRA,NA,NA",
      ),
    );
    expect(result.records[0]?.districtSlug).toBe("thane");
    expect(result.records[0]?.localities.map((l) => l.slug)).toEqual(["a", "b"]);
    expect(result.problems).toEqual(["421302: offices in 2 districts (thane, palghar); kept thane"]);
  });

  it("skips a row with a bad PIN or an unknown state, and reports it", () => {
    const result = parseIndiaPostCsv(csv("c,r,d,X B.O,12345,B.O,Delivery,D,MAHARASHTRA,NA,NA", "c,r,d,Y B.O,400001,B.O,Delivery,D,ATLANTIS,NA,NA"));
    expect(result.records).toEqual([]);
    expect(result.problems).toEqual(["line 2: bad PIN \"12345\"", "line 3: unknown state \"ATLANTIS\""]);
  });

  it("refuses a file whose header is not India Post's", () => {
    expect(() => parseIndiaPostCsv("pincode,office\n400001,Fort")).toThrow(/header/);
  });

  it("drops duplicate office names within one PIN", () => {
    const result = parseIndiaPostCsv(csv("c,r,d,Fort S.O,400001,S.O,Delivery,MUMBAI,MAHARASHTRA,NA,NA", "c,r,d,Fort H.O,400001,H.O,Delivery,MUMBAI,MAHARASHTRA,NA,NA"));
    expect(result.records[0]?.localities).toEqual([{ slug: "fort", name: "Fort" }]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter @brandbasket/db test -- india-post`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { stateCodeOfIndiaPostName } from "@brandbasket/shared/lib/directory/india-states";

/*
 * India Post's "All India Pincode Directory" (data.gov.in, GODL-India) turned into one record per PIN code: its state,
 * its district and the post offices in it, which the Listing tab offers as localities. Pure: the import script
 * (scripts/import-india-pincodes.ts) reads the file and writes the records. The directory's own fields are plain
 * comma-separated values with no quoting.
 */

export const INDIA_POST_HEADER = [
  "circlename",
  "regionname",
  "divisionname",
  "officename",
  "pincode",
  "officetype",
  "delivery",
  "district",
  "statename",
  "latitude",
  "longitude",
] as const;

export interface PincodeLocality {
  readonly slug: string;
  readonly name: string;
}

export interface PincodeRecord {
  readonly pincode: string;
  readonly stateCode: string;
  readonly districtSlug: string;
  readonly districtName: string;
  /** A to Z by name; never empty. */
  readonly localities: readonly PincodeLocality[];
}

export interface IndiaPostParse {
  readonly records: readonly PincodeRecord[];
  /** Rows skipped and PINs settled by a choice, one line each, for the import to print. */
  readonly problems: readonly string[];
}

const PIN = /^[1-9][0-9]{5}$/;
const OFFICE_SUFFIX = /\s+(?:[BSH]\.?\s?O\.?|G\.?P\.?O\.?)$/i;

/** "Salt Lake Sector V S.O" -> "Salt Lake Sector V": the office type is not part of the place's name. */
export function cleanOfficeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().replace(OFFICE_SUFFIX, "").trim();
}

/** "North 24 Parganas" -> "north-24-parganas". */
export function toSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "NORTH 24 PARGANAS" -> "North 24 Parganas". */
function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(-])([a-z])/g, (_match, before: string, letter: string) => before + letter.toUpperCase());
}

interface Office {
  readonly stateCode: string;
  readonly districtSlug: string;
  readonly districtName: string;
  readonly name: string;
}

export function parseIndiaPostCsv(text: string): IndiaPostParse {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((cell) => cell.trim().toLowerCase());
  if (header.join(",") !== INDIA_POST_HEADER.join(",")) {
    throw new Error(`Not India Post's pincode directory: the header is "${lines[0] ?? ""}", expected "${INDIA_POST_HEADER.join(",")}"`);
  }
  const problems: string[] = [];
  const offices = new Map<string, Office[]>();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === "") continue;
    const cells = line.split(",");
    const pincode = (cells[4] ?? "").trim();
    const state = (cells[8] ?? "").trim();
    const district = (cells[7] ?? "").trim();
    const name = cleanOfficeName(cells[3] ?? "");
    if (!PIN.test(pincode)) {
      problems.push(`line ${index + 1}: bad PIN ${JSON.stringify(pincode)}`);
      continue;
    }
    const stateCode = stateCodeOfIndiaPostName(state);
    if (stateCode === null) {
      problems.push(`line ${index + 1}: unknown state ${JSON.stringify(state)}`);
      continue;
    }
    if (district === "" || toSlug(name) === "") {
      problems.push(`line ${index + 1}: no district or office name`);
      continue;
    }
    const list = offices.get(pincode) ?? [];
    list.push({ stateCode, districtSlug: toSlug(district), districtName: titleCase(district), name });
    offices.set(pincode, list);
  }

  const records: PincodeRecord[] = [];
  for (const [pincode, list] of [...offices].sort(([a], [b]) => a.localeCompare(b))) {
    const byDistrict = new Map<string, Office[]>();
    for (const office of list) byDistrict.set(office.districtSlug, [...(byDistrict.get(office.districtSlug) ?? []), office]);
    const ranked = [...byDistrict.values()].sort((a, b) => b.length - a.length);
    const kept = ranked[0];
    if (kept === undefined) continue;
    const first = kept[0];
    if (first === undefined) continue;
    if (ranked.length > 1) {
      problems.push(`${pincode}: offices in ${ranked.length} districts (${[...byDistrict.keys()].join(", ")}); kept ${first.districtSlug}`);
    }
    const localities = new Map<string, PincodeLocality>();
    for (const office of kept) {
      const slug = toSlug(office.name);
      if (!localities.has(slug)) localities.set(slug, { slug, name: office.name });
    }
    records.push({
      pincode,
      stateCode: first.stateCode,
      districtSlug: first.districtSlug,
      districtName: first.districtName,
      localities: [...localities.values()].sort((a, b) => a.name.localeCompare(b.name, "en-IN")),
    });
  }
  return { records, problems };
}
```

`@brandbasket/db` must be able to import `@brandbasket/shared/lib/directory/india-states`. Check `packages/db/package.json` dependencies. If `@brandbasket/shared` is not a dependency there (adding it could create a cycle, since shared depends on db), move `india-states.ts` into `packages/db/src/india-states.ts`, export it as `@brandbasket/db/india-states`, and re-export it from `packages/shared/src/lib/directory/india-states.ts` the way `place-id.ts` is re-exported. Then update Task 1's import paths to match.

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm --filter @brandbasket/db test -- india-post`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `pnpm --filter @brandbasket/db typecheck`. Expected: 0 errors.

---

### Task 3: `india_pincodes` table, grants and queries

**Files:**
- Create: `packages/db/src/schema/india-pincodes.ts`
- Modify: `packages/db/src/schema/index.ts` (add `export * from "./india-pincodes";`)
- Create: `packages/db/src/queries/india-pincodes.ts`, plus an export line in `packages/db/src/index.ts` next to the other `queries/*` exports
- Generate: `packages/db/migrations/0084_india_pincodes.sql`
- Create: `packages/db/migrations/0085_india_pincodes_grants.sql`
- Test: `packages/db/src/queries/india-pincodes.integration.test.ts`

- [ ] **Step 1: Schema**

```ts
import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";

/**
 * India Post's PIN code directory, one row per PIN (src/india-post.ts): which state and district a business is in, and
 * the post-office localities the owner picks from. Reference data, the same for everyone: the import writes it, the
 * platform only reads it.
 */
export const indiaPincodes = pgTable(
  "india_pincodes",
  {
    pincode: text("pincode").primaryKey(),
    stateCode: text("state_code").notNull(),
    districtSlug: text("district_slug").notNull(),
    districtName: text("district_name").notNull(),
    /** [{ slug, name }], A to Z, never empty. */
    localities: jsonb("localities").$type<readonly { readonly slug: string; readonly name: string }[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("india_pincodes_pincode_check", sql`${table.pincode} ~ '^[1-9][0-9]{5}$'`),
    check("india_pincodes_state_code_check", sql`${table.stateCode} ~ '^[a-z]{2}$'`),
    check("india_pincodes_district_slug_check", sql`${table.districtSlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("india_pincodes_localities_check", sql`jsonb_typeof(${table.localities}) = 'array' and jsonb_array_length(${table.localities}) > 0`),
  ],
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @brandbasket/db db:generate`
Expected: a new `migrations/0084_*.sql` with `CREATE TABLE "india_pincodes"` and the four checks. Rename it to `0084_india_pincodes.sql`, and update the tag in `meta/_journal.json` to match, as earlier migrations do.

- [ ] **Step 3: Grants (hand-written, same pattern as `0081`)**

`packages/db/migrations/0085_india_pincodes_grants.sql`:

```sql
-- Grants for India Post's PIN code directory (0084). Public reference data, the same for every business, so there is
-- no row-level security: the customer's connection reads it (the Listing tab's PIN lookup), the staff connection
-- reads it and the import writes it. Nobody deletes: a re-import upserts.

GRANT SELECT ON india_pincodes TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON india_pincodes TO fynix_staff;
```

Then add its journal entry the way `0081` was added. Copy the shape of the `0081` entry and bump `idx` and `when`.

- [ ] **Step 4: Write the failing integration test**

Copy the setup of `packages/db/src/queries/directory-business-profiles.integration.test.ts` (how it gets a test DB and a staff runner).

```ts
import { describe, expect, it } from "vitest";
import { findPincode, upsertPincodes } from "./india-pincodes";
// test DB helpers: copy the imports used by directory-business-profiles.integration.test.ts

describe("india_pincodes", () => {
  it("upserts records and finds one by PIN", async () => {
    const db = staffTestDb();
    await upsertPincodes(db, [
      {
        pincode: "700091",
        stateCode: "wb",
        districtSlug: "north-24-parganas",
        districtName: "North 24 Parganas",
        localities: [{ slug: "salt-lake-sector-v", name: "Salt Lake Sector V" }],
      },
    ], new Date("2026-10-06T00:00:00Z"));
    expect(await findPincode(db, "700091")).toEqual({
      pincode: "700091",
      stateCode: "wb",
      districtSlug: "north-24-parganas",
      districtName: "North 24 Parganas",
      localities: [{ slug: "salt-lake-sector-v", name: "Salt Lake Sector V" }],
    });
  });

  it("a re-import replaces the localities", async () => {
    const db = staffTestDb();
    const base = { pincode: "400001", stateCode: "mh", districtSlug: "mumbai", districtName: "Mumbai" };
    await upsertPincodes(db, [{ ...base, localities: [{ slug: "fort", name: "Fort" }] }], new Date());
    await upsertPincodes(db, [{ ...base, localities: [{ slug: "fort", name: "Fort" }, { slug: "kalbadevi", name: "Kalbadevi" }] }], new Date());
    expect((await findPincode(db, "400001"))?.localities).toHaveLength(2);
  });

  it("returns null for an unknown or malformed PIN without querying junk", async () => {
    const db = staffTestDb();
    expect(await findPincode(db, "999999")).toBeNull();
    expect(await findPincode(db, "12ab")).toBeNull();
  });
});
```

- [ ] **Step 5: Run it and see it fail**

Run: `pnpm db:migrate:test && pnpm --filter @brandbasket/db test:integration -- india-pincodes`
Expected: FAIL, `upsertPincodes` not found.

- [ ] **Step 6: Implement the queries**

```ts
import { eq, sql } from "drizzle-orm";
import type { PincodeRecord } from "../india-post";
import { indiaPincodes } from "../schema/india-pincodes";
import type { Runner } from "./runner"; // use the Runner type directory-places.ts imports

const PIN = /^[1-9][0-9]{5}$/;
/** Rows per INSERT: about 19k PINs in all, so roughly 40 statements. */
const UPSERT_BATCH = 500;

/** One PIN's state, district and localities, or null for a PIN India Post's directory does not have. */
export async function findPincode(db: Runner, pincode: string): Promise<PincodeRecord | null> {
  if (!PIN.test(pincode)) return null;
  const rows = await db
    .select({
      pincode: indiaPincodes.pincode,
      stateCode: indiaPincodes.stateCode,
      districtSlug: indiaPincodes.districtSlug,
      districtName: indiaPincodes.districtName,
      localities: indiaPincodes.localities,
    })
    .from(indiaPincodes)
    .where(eq(indiaPincodes.pincode, pincode))
    .limit(1);
  return rows[0] ?? null;
}

/** Writes the directory's records, replacing a PIN's row when it is already there. Returns how many were written. */
export async function upsertPincodes(db: Runner, records: readonly PincodeRecord[], now: Date): Promise<number> {
  let written = 0;
  for (let start = 0; start < records.length; start += UPSERT_BATCH) {
    const batch = records.slice(start, start + UPSERT_BATCH);
    await db
      .insert(indiaPincodes)
      .values(batch.map((record) => ({ ...record, createdAt: now, updatedAt: now })))
      .onConflictDoUpdate({
        target: indiaPincodes.pincode,
        set: {
          stateCode: sql`excluded.state_code`,
          districtSlug: sql`excluded.district_slug`,
          districtName: sql`excluded.district_name`,
          localities: sql`excluded.localities`,
          updatedAt: now,
        },
      });
    written += batch.length;
  }
  return written;
}
```

- [ ] **Step 7: Run it and see it pass**

Run: `pnpm --filter @brandbasket/db test:integration -- india-pincodes`
Expected: PASS (3 tests).

- [ ] **Step 8: Checkpoint**

Run: `pnpm --filter @brandbasket/db typecheck`. Expected: 0 errors.

---

### Task 4: Import script

**Files:**
- Create: `packages/db/scripts/import-india-pincodes.ts`
- Modify: `packages/db/package.json` (script `"directory:import-pincodes": "tsx scripts/import-india-pincodes.ts"`) and the root `package.json` (a matching pass-through, if root has one for `directory:import-places`)

- [ ] **Step 1: Write the script**

Copy the connection setup (`loadLocalEnv`, `requireEnv`, `createDatabase`, closing) from `scripts/import-directory-places.ts`.

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase } from "../src/client";
import { parseIndiaPostCsv } from "../src/india-post";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { upsertPincodes } from "../src/queries/india-pincodes";

/*
 * Loads India Post's PIN code directory (data.gov.in, GODL-India) into india_pincodes on the staff connection. Safe to
 * run again: every PIN is upserted.
 *
 *   pnpm directory:import-pincodes <path to pincode-directory.csv>
 */

async function main(): Promise<void> {
  const path = process.argv[2];
  if (path === undefined) throw new Error("Usage: pnpm directory:import-pincodes <path to pincode-directory.csv>");
  const { records, problems } = parseIndiaPostCsv(readFileSync(resolve(path), "utf8"));
  for (const problem of problems) console.warn(problem);
  if (records.length < 15_000) throw new Error(`Only ${records.length} PIN codes read; India has about 19,000. Is this the full directory?`);
  loadLocalEnv();
  // Same staff URL variable import-directory-places.ts uses.
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"));
  try {
    const written = await upsertPincodes(db, records, new Date());
    console.log(`Wrote ${written} PIN codes (${problems.length} problems above).`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
```

Match the env variable name and the `createDatabase` return shape to `import-directory-places.ts` exactly. Don't guess them.

- [ ] **Step 2: Run against the local DB**

Run: `pnpm db:migrate && pnpm --filter @brandbasket/db directory:import-pincodes ../../../local-directory-data/india/pincode-directory.csv`
Expected: `Wrote 19xxx PIN codes`, plus a few hundred "offices in 2 districts" lines.
Spot check: `psql "$DATABASE_URL" -c "select district_slug, jsonb_array_length(localities) from india_pincodes where pincode in ('400601','700091','560001')"`. Expect thane, north-24-parganas and bengaluru (or bangalore).

- [ ] **Step 3: Checkpoint**

Run: `pnpm --filter @brandbasket/db typecheck && pnpm --filter @brandbasket/db test`. Expected: green.

---

## Part B: Listing from anywhere (platform)

### Task 5: Listing location rules (pure)

**Files:**
- Create: `apps/platform/lib/listing-location.ts`
- Test: `apps/platform/lib/listing-location.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { elsewhereCitySlug, isOpenedDistrict, pinLookupOf, publicPinLookup } from "./listing-location";

const KOLKATA_PIN = {
  pincode: "700091",
  stateCode: "wb",
  districtSlug: "north-24-parganas",
  districtName: "North 24 Parganas",
  localities: [{ slug: "salt-lake-sector-v", name: "Salt Lake Sector V" }],
};

describe("listing location", () => {
  it("only Thane, Maharashtra is opened", () => {
    expect(isOpenedDistrict("mh", "thane")).toBe(true);
    expect(isOpenedDistrict("mh", "mumbai")).toBe(false);
    expect(isOpenedDistrict("wb", "kolkata")).toBe(false);
  });

  it("an elsewhere business's key city is <state>-<district>", () => {
    expect(elsewhereCitySlug("wb", "north-24-parganas")).toBe("wb-north-24-parganas");
  });

  it("tells the form which question comes next", () => {
    expect(pinLookupOf(KOLKATA_PIN)).toEqual({
      kind: "elsewhere",
      pincode: "700091",
      stateCode: "wb",
      stateName: "West Bengal",
      districtName: "North 24 Parganas",
      localities: [{ value: "salt-lake-sector-v", label: "Salt Lake Sector V" }],
    });
    expect(pinLookupOf({ ...KOLKATA_PIN, pincode: "400601", stateCode: "mh", districtSlug: "thane", districtName: "Thane" }).kind).toBe("opened");
  });

  it("publicPinLookup answers not-found for null", () => {
    expect(publicPinLookup(null)).toEqual({ kind: "not-found" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter platform test -- listing-location` (use the package name from `apps/platform/package.json`)
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import type { PincodeRecord } from "@brandbasket/db";
import { stateName } from "@brandbasket/shared/lib/directory/india-states";
import type { PickOption } from "@/lib/listing-address";

/*
 * Where a business is listed, from its PIN code. A district we have opened (Thane so far) has the directory's own
 * areas, category pages and ads, so the owner picks an area there as before. Anywhere else the business gets its own
 * page only, under its state (/in/<state>/business/<name>/<code>), and the owner picks the post-office locality its
 * PIN covers. Its listing key is then <category>/<state>-<district>/<locality>/<name>: the four-part shape the database
 * checks, with a city part no Thane town can have, so the two kinds never share an address. Pure and browser-safe.
 */

interface OpenedDistrict {
  readonly stateCode: string;
  readonly districtSlug: string;
}

/** Districts with areas, category pages and ads. Add one here only when its areas are in places.json. */
export const OPENED_DISTRICTS: readonly OpenedDistrict[] = [{ stateCode: "mh", districtSlug: "thane" }];

export function isOpenedDistrict(stateCode: string, districtSlug: string): boolean {
  return OPENED_DISTRICTS.some((district) => district.stateCode === stateCode && district.districtSlug === districtSlug);
}

/** The listing key's city part for a business outside the opened districts: "wb-north-24-parganas". */
export function elsewhereCitySlug(stateCode: string, districtSlug: string): string {
  return `${stateCode}-${districtSlug}`;
}

/** What the Listing tab learns from a PIN code: everything here is safe to send to the browser. */
export type PinLookup =
  | { readonly kind: "not-found" }
  | { readonly kind: "opened"; readonly pincode: string; readonly stateCode: string; readonly districtSlug: string; readonly districtName: string }
  | {
      readonly kind: "elsewhere";
      readonly pincode: string;
      readonly stateCode: string;
      readonly stateName: string;
      readonly districtName: string;
      readonly localities: readonly PickOption[];
    };

export function pinLookupOf(record: PincodeRecord): Exclude<PinLookup, { kind: "not-found" }> {
  if (isOpenedDistrict(record.stateCode, record.districtSlug)) {
    return { kind: "opened", pincode: record.pincode, stateCode: record.stateCode, districtSlug: record.districtSlug, districtName: record.districtName };
  }
  return {
    kind: "elsewhere",
    pincode: record.pincode,
    stateCode: record.stateCode,
    stateName: stateName(record.stateCode) ?? record.stateCode.toUpperCase(),
    districtName: record.districtName,
    localities: record.localities.map((locality) => ({ value: locality.slug, label: locality.name })),
  };
}

export function publicPinLookup(record: PincodeRecord | null): PinLookup {
  return record === null ? { kind: "not-found" } : pinLookupOf(record);
}
```

Check the actual `PickOption` field names in `apps/platform/lib/listing-address.ts` and use those. The test assumes `{ value, label }`, which is what `listing-form.tsx` uses.

- [ ] **Step 4: Run it and see it pass**, then typecheck: `pnpm --filter platform test -- listing-location && pnpm --filter platform typecheck`.

---

### Task 6: Claims carry the PIN, and places carry their state

**Files:**
- Modify: `packages/db/src/schema/directory-ads.ts` (two columns on `directoryClaims`)
- Generate: `packages/db/migrations/0086_claims_postal.sql`
- Modify: `packages/db/src/queries/directory-places.ts:46,386-411`
- Modify: `packages/db/src/queries/directory-ads.ts:310-321, 415-447, 855-886` and `updateAddedBusinessListing`
- Test: the existing `packages/db/src/queries/directory-ads*.integration.test.ts` that covers `addBusinessListing` (find it with `grep -rln "addBusinessListing" packages/db/src --include=*.integration.test.ts`)

- [ ] **Step 1: Schema columns.** Add to `directoryClaims` after `streetAddress`:

```ts
    /**
     * The PIN code an owner-added business outside the opened districts gave (india_pincodes), and the post-office
     * locality it picked there. Null for a business in an opened district (its area is in the listing key) and for a
     * claimed listing.
     */
    pincode: text("pincode"),
    localityName: text("locality_name"),
```

Add these to the table's checks:

```ts
    check("directory_claims_pincode_check", sql`${table.pincode} is null or ${table.pincode} ~ '^[1-9][0-9]{5}$'`),
    check(
      "directory_claims_postal_check",
      sql`(${table.pincode} is null) = (${table.localityName} is null) and (${table.pincode} is null or ${table.origin} = 'added')`,
    ),
```

Run `pnpm --filter @brandbasket/db db:generate`, rename the output to `0086_claims_postal.sql` and fix the journal tag. No new grants are needed: the columns sit on an existing table.

- [ ] **Step 2: Write the failing integration test.** Add it next to the existing `addBusinessListing` tests, reusing their fixture for a listing-kind business:

```ts
it("adds a business outside the opened districts under its own state, with its PIN and locality", async () => {
  const { businessId } = await newListingAccount(db); // the existing fixture helper in this file
  const outcome = await addBusinessListing(
    db,
    {
      businessId,
      stateCode: "wb",
      categorySlug: "dentists",
      citySlug: "wb-north-24-parganas",
      areaSlug: "salt-lake-sector-v",
      slug: "smile-dental",
      businessName: "Smile Dental",
      streetAddress: "AB-12, Sector V",
      phone: "+919830000000",
      postal: { pincode: "700091", localityName: "Salt Lake Sector V" },
    },
    new Date(),
  );
  expect(outcome).toMatchObject({ kind: "added", listingKey: "dentists/wb-north-24-parganas/salt-lake-sector-v/smile-dental" });
  const claim = await findClaimForBusiness(db, businessId);
  expect(claim).toMatchObject({ pincode: "700091", localityName: "Salt Lake Sector V" });
  const places = await findPlaces(db, [claim!.placeId!]);
  expect(places.get(claim!.placeId!)).toMatchObject({ stateCode: "wb" });
});

it("a Thane business keeps mh and no postal fields", async () => {
  const { businessId } = await newListingAccount(db);
  await addBusinessListing(db, { ...THANE_LISTING, businessId, stateCode: "mh", postal: null }, new Date());
  const claim = await findClaimForBusiness(db, businessId);
  expect(claim).toMatchObject({ pincode: null, localityName: null });
});
```

`THANE_LISTING` is this file's existing Thane `NewBusinessListing` literal. Add `stateCode: "mh", postal: null` to it and to every other literal in the file. If `findClaimForBusiness` and `findPlaces` don't return those fields, extend their `select`s in Step 3.

- [ ] **Step 3: Implement**

In `directory-places.ts`:
- Delete the `const STATE_CODE = "mh";` line, but keep a local `const OPEN_DATA_STATE_CODE = "mh";` for `importOpenDataPlaces`, since the Thane ledger is Maharashtra.
- Change `createPlatformPlace`'s input to `PlaceUrl & { readonly origin: …; readonly stateCode: string }`.
- Insert `stateCode: input.stateCode`.
- Add a guard before the insert: `if (!/^[a-z]{2}$/.test(input.stateCode)) throw new Error(\`createPlatformPlace: bad state code ${input.stateCode}\`);`

In `directory-ads.ts`:

```ts
export interface NewBusinessListing {
  readonly businessId: string;
  /** The place's state: "mh" for an opened district, else the PIN's state. */
  readonly stateCode: string;
  readonly categorySlug: string;
  /** A town in an opened district, or elsewhereCitySlug(state, district) outside them. */
  readonly citySlug: string;
  /** An area in an opened district, or the PIN's locality slug outside them. */
  readonly areaSlug: string;
  readonly slug: string;
  readonly businessName: string;
  readonly streetAddress: string;
  readonly phone: string;
  /** Outside the opened districts only: the PIN and the locality's name as India Post writes it. */
  readonly postal: { readonly pincode: string; readonly localityName: string } | null;
}
```

- `addBusinessListing`: pass `stateCode: listing.stateCode` to `createPlatformPlace`, and add `pincode: listing.postal?.pincode ?? null, localityName: listing.postal?.localityName ?? null` to the claim insert.
- `updateAddedBusinessListing`: set the same two columns in its claim `update`.
- When the state changes (an owner corrects their PIN from Kolkata to Thane), also update `directory_places.state_code`. `updatePendingPlaceUrl` takes the URL; add a `stateCode` to its `set`, guarded by `isNull(urlLockedAt)` like the rest.

`ConfirmedAddedBusiness` and `listConfirmedAddedBusinesses`:

```ts
export interface ConfirmedAddedBusiness {
  // ...existing fields...
  /** Its place's state ("mh" before it has a place). */
  readonly stateCode: string;
  /** Outside the opened districts: where India Post puts its PIN. Null in an opened district. */
  readonly postal: {
    readonly pincode: string;
    readonly localityName: string;
    readonly districtName: string;
  } | null;
}
```

Left-join `directoryPlaces` on `directoryClaims.placeId`, and `indiaPincodes` on `directoryClaims.pincode`. Select `stateCode: directoryPlaces.stateCode`, `pincode`, `localityName`, `districtName: indiaPincodes.districtName`. Map the rows:

```ts
  return rows.flatMap(({ decidedAt, stateCode, pincode, localityName, districtName, ...row }) =>
    decidedAt === null
      ? []
      : [{
          ...row,
          confirmedAt: decidedAt,
          stateCode: stateCode ?? "mh",
          postal: pincode !== null && localityName !== null && districtName !== null ? { pincode, localityName, districtName } : null,
        }],
  );
```

- [ ] **Step 4: Run the tests**

Run: `pnpm db:migrate:test && pnpm --filter @brandbasket/db test:integration -- directory-ads && pnpm --filter @brandbasket/db typecheck`
Expected: PASS. Typecheck errors in callers (`business-profile.ts`) are fixed in Task 8. Only this package must be clean here.

---

### Task 7: The feed sends state and `postal`

**Files:**
- Modify: `packages/shared/src/lib/directory/feed-contract.ts:85-98`
- Modify: `packages/shared/src/lib/directory/feed.ts:136-160`
- Test: `packages/shared/src/lib/directory/feed.test.ts`

- [ ] **Step 1: Contract (additive, version stays 1)**

```ts
/** Where India Post puts an added business outside the opened districts (added 2026-10-06). */
export interface DirectoryFeedPostal {
  readonly pincode: string;
  /** The post-office locality its owner picked, "Salt Lake Sector V". */
  readonly locality: string;
  readonly district: string;
  readonly state: string;
}

export interface DirectoryFeedAddedListing extends DirectoryFeedPlace {
  // ...existing fields...
  /**
   * Present only for a business outside the districts the directory has opened: it has a page of its own and nothing
   * else, and `address.city`/`address.area` are then `<state>-<district>` and the locality's slug, not directory places.
   */
  readonly postal?: DirectoryFeedPostal;
}
```

- [ ] **Step 2: Write the failing tests** in `feed.test.ts`. Reuse that file's `ConfirmedAddedBusiness` fixture and add `stateCode: "mh", postal: null` to it.

```ts
it("sends an elsewhere business with its own state and its postal block", () => {
  const entry = buildAddedFeedListing(
    {
      ...ADDED_FIXTURE,
      listingKey: "dentists/wb-north-24-parganas/salt-lake-sector-v/smile-dental",
      stateCode: "wb",
      postal: { pincode: "700091", localityName: "Salt Lake Sector V", districtName: "North 24 Parganas" },
    },
    null,
    null,
  );
  expect(entry?.address.state).toBe("wb");
  expect(entry?.postal).toEqual({ pincode: "700091", locality: "Salt Lake Sector V", district: "North 24 Parganas", state: "West Bengal" });
});

it("a Thane business has no postal block and state mh", () => {
  const entry = buildAddedFeedListing({ ...ADDED_FIXTURE, stateCode: "mh", postal: null }, null, null);
  expect(entry?.address.state).toBe("mh");
  expect(entry).not.toHaveProperty("postal");
});
```

- [ ] **Step 3: Implement.** In `feed.ts`, delete `ADDED_STATE_CODE`, import `stateName` from `./india-states`, and in `buildAddedFeedListing`:

```ts
  const postal = business.postal;
  return {
    address: { category, state: business.stateCode, city, area, slug },
    ...placeFields(place),
    name: business.businessName,
    streetAddress: business.streetAddress ?? "",
    phone: business.phone,
    confirmedAt: business.confirmedAt.toISOString(),
    photo,
    ...(website === null ? {} : { website }),
    ...(postal === null
      ? {}
      : {
          postal: {
            pincode: postal.pincode,
            locality: postal.localityName,
            district: postal.districtName,
            state: stateName(business.stateCode) ?? business.stateCode.toUpperCase(),
          },
        }),
  };
```

- [ ] **Step 4: Run** `pnpm --filter @brandbasket/shared test -- feed && pnpm --filter platform test -- directory-feed`. Expected: PASS. Fix `directory-feed.test.ts` fixtures by adding `stateCode`/`postal`.

---

### Task 8: Listing tab: parse and save either kind

**Files:**
- Modify: `apps/platform/lib/business-listing-form.ts`
- Modify: `apps/platform/lib/business-listing-form.test.ts`
- Modify: `apps/platform/lib/server/business-profile.ts:133-190`
- Modify: `apps/platform/app/app-host/(protected)/business/actions.ts` (add `lookupPincodeAction`)

The form posts `pincode`, `category`, and then `area` (opened district) or `locality` (elsewhere). Shape checks stay pure. Whether the PIN exists, and whether the locality belongs to it, is checked on the server against `india_pincodes`.

- [ ] **Step 1: Write the failing tests** (replace the district-based tests; keep the category and area ones, adapted):

```ts
import { describe, expect, it } from "vitest";
import { parseBusinessListingForm } from "./business-listing-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseBusinessListingForm", () => {
  it("asks for a 6-digit PIN first", () => {
    expect(parseBusinessListingForm(form({ pincode: "4006", area: "", locality: "", category: "dentists" }))).toEqual({
      success: false,
      field: "pincode",
      message: "Enter your 6-digit PIN code.",
    });
  });

  it("an opened-district pick: an area of the directory", () => {
    expect(parseBusinessListingForm(form({ pincode: "400602", area: "naupada", locality: "", category: "dentists" }))).toEqual({
      success: true,
      data: { pincode: "400602", place: { kind: "area", citySlug: "thane", areaSlug: "naupada" }, categorySlug: "dentists" },
    });
  });

  it("an elsewhere pick: a locality slug, checked against the PIN on the server", () => {
    expect(parseBusinessListingForm(form({ pincode: "700091", area: "", locality: "salt-lake-sector-v", category: "dentists" }))).toEqual({
      success: true,
      data: { pincode: "700091", place: { kind: "locality", localitySlug: "salt-lake-sector-v" }, categorySlug: "dentists" },
    });
  });

  it("needs an area or a locality", () => {
    expect(parseBusinessListingForm(form({ pincode: "700091", area: "", locality: "", category: "dentists" }))).toMatchObject({
      success: false,
      field: "area",
    });
  });
});
```

- [ ] **Step 2: Run them and see them fail.** Run: `pnpm --filter platform test -- business-listing-form`.

- [ ] **Step 3: Implement the parse.** Replace `BUSINESS_LISTING_FIELDS`, `BusinessListingInput` and `parseBusinessListingForm`. Keep `DIRECTORY_DISTRICTS`, `districtAreaOptions` and `listingCategoryOptions` for the opened-district area list.

```ts
export const BUSINESS_LISTING_FIELDS = ["pincode", "area", "locality", "category"] as const;

const PIN = /^[1-9][0-9]{5}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface BusinessListingInput {
  readonly pincode: string;
  /** An area of an opened district, or a locality the server checks belongs to the PIN. */
  readonly place:
    | { readonly kind: "area"; readonly citySlug: string; readonly areaSlug: string }
    | { readonly kind: "locality"; readonly localitySlug: string };
  readonly categorySlug: string;
}

export function parseBusinessListingForm(formData: FormData): BusinessListingParseResult {
  if (!isListingForm(formData)) return { success: false, field: null, message: OWNER_FORM_FIELDS_MESSAGE };

  const pincode = textValue(formData, "pincode").replace(/\s+/g, "");
  if (!PIN.test(pincode)) return { success: false, field: "pincode", message: "Enter your 6-digit PIN code." };

  const areaSlug = textValue(formData, "area");
  const localitySlug = textValue(formData, "locality");
  let place: BusinessListingInput["place"];
  if (areaSlug !== "") {
    const citySlug = cityOfArea(areaSlug);
    if (citySlug === null || !isDirectoryArea(citySlug, areaSlug)) return { success: false, field: "area", message: "Choose your area." };
    place = { kind: "area", citySlug, areaSlug };
  } else if (SLUG.test(localitySlug)) {
    place = { kind: "locality", localitySlug };
  } else {
    return { success: false, field: "area", message: "Choose your area." };
  }

  const categorySlug = textValue(formData, "category");
  if (!isDirectoryCategory(categorySlug)) return { success: false, field: "category", message: "Choose your business category." };

  return { success: true, data: { pincode, place, categorySlug } };
}
```

Update the file's header comment, which says the order is district, area, category, to: PIN code, then area or locality, then category.

- [ ] **Step 4: Server side: resolve the picks against the PIN.** In `business-profile.ts`, add before `saveOwnListing`:

```ts
const PIN_UNKNOWN_MESSAGE = "We couldn't find that PIN code. Check it, or email us and we'll add your business.";
const PIN_MISMATCH_MESSAGE = "That area isn't in this PIN code. Pick it again.";

type Resolved =
  | { readonly ok: true; readonly where: Pick<NewBusinessListing, "stateCode" | "citySlug" | "areaSlug" | "postal"> }
  | { readonly ok: false; readonly message: string };

/** The picks checked against India Post's directory: an area needs a PIN in its opened district, a locality its own PIN. */
async function resolveListingPlace(picks: BusinessListingInput): Promise<Resolved> {
  const record = await findPincode(getStaffDb(), picks.pincode);
  if (record === null) return { ok: false, message: PIN_UNKNOWN_MESSAGE };
  const opened = isOpenedDistrict(record.stateCode, record.districtSlug);
  if (picks.place.kind === "area") {
    if (!opened) return { ok: false, message: PIN_MISMATCH_MESSAGE };
    return { ok: true, where: { stateCode: record.stateCode, citySlug: picks.place.citySlug, areaSlug: picks.place.areaSlug, postal: null } };
  }
  if (opened) return { ok: false, message: PIN_MISMATCH_MESSAGE };
  const { localitySlug } = picks.place;
  const locality = record.localities.find((item) => item.slug === localitySlug);
  if (locality === undefined) return { ok: false, message: PIN_MISMATCH_MESSAGE };
  return {
    ok: true,
    where: {
      stateCode: record.stateCode,
      citySlug: elsewhereCitySlug(record.stateCode, record.districtSlug),
      areaSlug: locality.slug,
      postal: { pincode: record.pincode, localityName: locality.name },
    },
  };
}
```

In `saveOwnListing`, right after the `profile === null` check:

```ts
  const resolved = await resolveListingPlace(picks);
  if (!resolved.ok) return { kind: "refused", reason: "pin", message: resolved.message };
```

Add `"pin"` to `SaveListingOutcome`'s reason union. In both the `addBusinessListing` and `updateAddedBusinessListing` calls, replace `citySlug: picks.citySlug, areaSlug: picks.areaSlug` with `...resolved.where`. The action maps `refused` to an error state on `field: "pincode"`. Check how `saveListingAction` maps refusals today and add the `"pin"` case there.

- [ ] **Step 5: PIN lookup action.** In `business/actions.ts`:

```ts
const PIN_PATTERN = /^[1-9][0-9]{5}$/;

/** The Listing tab's PIN step: which district the PIN is in and what to ask next. Signed-in customers only. */
export async function lookupPincodeAction(pincode: string): Promise<PinLookup> {
  await requireCustomerAccess({ listingAccount: "allow" });
  const pin = pincode.replace(/\s+/g, "");
  if (!PIN_PATTERN.test(pin)) return { kind: "not-found" };
  return publicPinLookup(await findPincode(getStaffDb(), pin));
}
```

- [ ] **Step 6: Run the checks.** Run: `pnpm --filter platform test -- business-listing-form business-profile && pnpm --filter platform typecheck`
Expected: PASS. The remaining type errors are only in `listing-form.tsx` and `business/page.tsx` (Task 9).

---

### Task 9: Listing tab UI: PIN first

**Files:**
- Modify: `apps/platform/components/panel/business/listing-form.tsx`
- Modify: `apps/platform/lib/business-listing-form.ts` (`listedAtAddress` variants)
- Modify: `apps/platform/app/app-host/(protected)/business/page.tsx:47,105-109,137-152`
- Test: `apps/platform/lib/business-listing-form.test.ts` (address variants)

- [ ] **Step 1: Write the failing test** for the preview address:

```ts
import { listedAtAddress } from "./business-listing-form";

it("an opened-district business previews its category page", () => {
  expect(listedAtAddress({ kind: "opened", districtSlug: "thane", areaSlug: "naupada", categorySlug: null }).map((s) => s.text)).toEqual([
    "in", "mh", "thane", "naupada", "category",
  ]);
});

it("an elsewhere business previews its own page under its state", () => {
  expect(listedAtAddress({ kind: "elsewhere", stateCode: "wb", nameSlug: "smile-dental" }).map((s) => s.text)).toEqual([
    "in", "wb", "business", "smile-dental", "…",
  ]);
});
```

- [ ] **Step 2: Implement `listedAtAddress`.**

```ts
export type ListedAtPart = "fixed" | "district" | "area" | "category" | "state" | "name";

export type ListedAtPicks =
  | { readonly kind: "opened"; readonly districtSlug: string | null; readonly areaSlug: string | null; readonly categorySlug: string | null }
  | { readonly kind: "elsewhere"; readonly stateCode: string; readonly nameSlug: string };

/**
 * The page the business will be on, part by part. In an opened district: its category page,
 * /in/mh/<district>/<area>/<category>. Anywhere else: its own page, /in/<state>/business/<name>/<code>, where the
 * code is made when it is saved (shown as an ellipsis until then).
 */
export function listedAtAddress(picks: ListedAtPicks): readonly ListedAtSegment[] {
  if (picks.kind === "elsewhere") {
    return [
      { part: "fixed", text: "in", chosen: true },
      { part: "state", text: picks.stateCode, chosen: true },
      { part: "fixed", text: "business", chosen: true },
      { part: "name", text: picks.nameSlug, chosen: true },
      { part: "fixed", text: "…", chosen: true },
    ];
  }
  return [
    { part: "fixed", text: "in", chosen: true },
    { part: "fixed", text: DIRECTORY_STATE.code, chosen: true },
    segment("district", picks.districtSlug, "district"),
    segment("area", picks.areaSlug, "area"),
    segment("category", picks.categorySlug, "category"),
  ];
}
```

- [ ] **Step 3: The form.** Rewrite `ListingForm`'s steps as **PIN code → (Area | Locality) → Category**:
- `SavedListing` becomes `{ pincode: string; area: string | null; locality: string | null; categorySlug: string }`.
- Add a new prop: `nameSlug: string` (`slugifyBusinessName(tenant.businessName)`, for the preview).
- **PIN step:** a `<input inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} name="pincode" autoComplete="postal-code">` labelled "PIN code". When it reaches 6 digits, call `lookupPincodeAction` inside `startTransition`, and store the `PinLookup` in state.
  - Under the input, show `"{districtName}, {stateName}"`, or "We couldn't find that PIN code." for `not-found`.
  - Ignore a stale answer: keep the PIN the request was for, and drop the answer if the input has changed since.
- **opened:** show the existing area `OptionList` (`districtAreaOptions("thane")`). The hidden `area` input carries the pick; `locality` is empty.
- **elsewhere:** show an `OptionList` of `lookup.localities`, titled "Your locality". The hidden `locality` input carries the pick; `area` is empty. If there is exactly one locality, pick it automatically and open the category step.
- **Category step:** unchanged.
- **Preview:** `listedAtAddress` gets `{kind:"opened", districtSlug:"thane", …}` or `{kind:"elsewhere", stateCode, nameSlug}`.
- When the lookup is `elsewhere`, add one line of copy under the preview: "Your business gets its own page now. We'll add {districtName} area pages when we open your district."
- Keep the existing patterns: `Step`, `OptionList`, focus on Save, and the `supportEmail` link for "my area isn't listed".
- Short labels, no boxes ([[dashboard-ui-no-boxes-no-text]]).

- [ ] **Step 4: The page.** In `business/page.tsx`:
- Build `saved` from the claim. Get the PIN from `claim.pincode` if set. For an opened-district claim there is no stored PIN, so leave `pincode` empty: the owner re-enters it only to change the listing.
- Better: to avoid asking a Thane owner who added before this change, have the form skip the PIN step when `saved.area !== null && saved.pincode === ""`. It shows the area step as answered, with a "Change" link that opens the PIN step.
- `websiteAddressOf(claim)` already uses `placeUrlPath(place)` once the claim has a place. That gives `/in/wb/business/...` as soon as `directory_places.state_code` is `wb` (Task 6). For an elsewhere claim, never fall back to `directoryCategoryPath`.

- [ ] **Step 5: Check it in the browser.** Start the platform preview (`.claude/launch.json` in directory-ads; see [[local-dev-servers]] for ports) and sign in as a free listing test account from the project's seed.
1. PIN `700091` should show "North 24 Parganas, West Bengal", the localities, then the categories. Save it. The preview reads `fynix.digital/in/wb/business/<name>/…`, and after saving, the real code.
2. PIN `400602` should show the Thane areas, as before.
3. PIN `999999` should show "We couldn't find that PIN code."
Take a screenshot of each for the report.

- [ ] **Step 6: Checkpoint.** Run: `pnpm --filter platform lint && pnpm --filter platform typecheck && pnpm --filter platform test`. Expected: all green.

---

### Task 10: Staff console shows where the business is

**Files:**
- Modify: `packages/db/src/queries/directory-ads.ts` (`listDirectoryClaimsForStaff` selects `pincode`, `localityName`)
- Modify: `apps/admin/app/(protected)/ads/page.tsx:119-160` (`ClaimRow`)

- [ ] **Step 1:** Add `pincode` and `localityName` to `listDirectoryClaimsForStaff`'s select and its row type.
- [ ] **Step 2:** In `ClaimRow`, for `origin === "added"` with a `pincode`, show `"{localityName} · PIN {pincode}"` under the street address. The listing key's city part (`wb-north-24-parganas`) already names the state and district. Show it as is: staff read keys today.
- [ ] **Step 3: Checkpoint.** Run: `pnpm --filter admin lint && pnpm --filter admin typecheck && pnpm --filter admin test`. Expected: green.

---

## Part C: State-aware website (`website-listing`)

### Task 11: State codes copy

**Files:**
- Create: `lib/india-states.ts`, `lib/india-states.test.ts`

- [ ] **Step 1:** Copy `packages/shared/src/lib/directory/india-states.ts` and its test from Task 1 verbatim. Change only the header comment, so it names the platform file as the original. Run `npx vitest run lib/india-states.test.ts`. Expected: PASS (13 tests).

---

### Task 12: Routes become `/in/[state]/...`

**Files:**
- Move: `app/(marketing)/in/mh/` → `app/(marketing)/in/[state]/`. Use `git mv`, so other sessions' edits to these files move with them.
- Modify: each moved `page.tsx` (5 pages) and `lib/directory-routes.ts`
- Test: `lib/directory-routes.test.ts`

Next can't have both a static `mh` and a dynamic `[state]` folder holding a `business` child: `/in/mh/business/...` would match only the static tree. So the whole tree becomes dynamic. Maharashtra is the only state with district pages. Every state code can have business pages.

- [ ] **Step 1: Write the failing test** in `lib/directory-routes.test.ts`:

```ts
import { hasDistrictPages, isDirectoryState } from "@/lib/directory-routes";

describe("states", () => {
  it("any Indian state code is a directory state; only mh has district pages so far", () => {
    expect(isDirectoryState("wb")).toBe(true);
    expect(isDirectoryState("xx")).toBe(false);
    expect(hasDistrictPages("mh")).toBe(true);
    expect(hasDistrictPages("wb")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement** in `lib/directory-routes.ts`:

```ts
import { isIndiaStateCode } from "@/lib/india-states";
import { STATE_CODE } from "@/lib/local-directory";

/** A state segment the directory answers to: any Indian state code; its businesses may have pages. */
export function isDirectoryState(state: string): boolean {
  return isIndiaStateCode(state);
}

/** Whether a state has district, area and category pages: only the one whose places this site ships (Maharashtra). */
export function hasDistrictPages(state: string): boolean {
  return state === STATE_CODE;
}
```

- [ ] **Step 3: Move the tree and guard each page.** Run `git mv "app/(marketing)/in/mh" "app/(marketing)/in/[state]"`. Then:
- `PageProps<"/in/mh/...">` becomes `PageProps<"/in/[state]/...">` everywhere (run `npm run typecheck`; `next typegen` regenerates the route types).
- `in/[state]/page.tsx` (the old `/in/mh` landing): read `state`. If `!hasDistrictPages(state)`, call `notFound()`. Otherwise keep the redirect.
- `in/[state]/business/page.tsx`: if `!isDirectoryState(state)`, call `notFound()`. Otherwise redirect permanently to `directoryPath()` for `mh`; for any other state, call `notFound()`.
- `in/[state]/[district]/page.tsx`, `[district]/[place]/page.tsx` and `[place]/[category]/page.tsx`: at the top of both `generateMetadata` and the page, if `!hasDistrictPages(state)`, return `{}` and `notFound()` respectively. The rest is unchanged.
- `in/[state]/business/[name]/[code]/page.tsx` is done in Task 15.

Update the doc comments that say `/in/mh/...` to `/in/<state>/...` only where they describe the route tree. Leave `lib/local-directory.ts`'s Thane URL rules alone.

- [ ] **Step 4: Check that Maharashtra URLs are unchanged.** Run: `npm run typecheck && npx vitest run lib/directory-routes.test.ts lib/local-directory.test.ts`
Expected: PASS, and the existing URL tests still produce `/in/mh/thane/...`.

---

### Task 13: Feed: parse `postal`, keep elsewhere businesses apart

**Files:**
- Modify: `lib/directory-feed.ts`
- Test: `lib/directory-feed.test.ts`

- [ ] **Step 1: Write the failing tests** (use this file's existing added-entry fixture, `ADDED` or similar):

```ts
const ELSEWHERE = {
  ...ADDED_ENTRY,
  id: "3k7m2q9",
  url: { city: "wb-north-24-parganas", slug: "smile-dental" },
  address: { category: "dentists", state: "wb", city: "wb-north-24-parganas", area: "salt-lake-sector-v", slug: "smile-dental" },
  postal: { pincode: "700091", locality: "Salt Lake Sector V", district: "North 24 Parganas", state: "West Bengal" },
};

it("an added business with a postal block goes to `elsewhere`, never into the Thane listings", () => {
  const merged = mergeFeed({ listings: [], added: [ELSEWHERE] }, PLACES);
  expect(merged.listings).toEqual([]);
  expect(merged.elsewhere).toEqual([
    {
      id: "3k7m2q9",
      stateCode: "wb",
      urlSlug: "smile-dental",
      name: ELSEWHERE.name,
      service: "dentists",
      address: ELSEWHERE.streetAddress,
      postal: ELSEWHERE.postal,
      phone: ELSEWHERE.phone,
      verifiedAt: ELSEWHERE.confirmedAt,
      photo: null,
      website: "",
    },
  ]);
  expect(merged.skipped).toEqual([]);
});

it("an elsewhere business in a category the site doesn't know is still shown (its page needs no category page)", () => {
  const merged = mergeFeed({ listings: [], added: [{ ...ELSEWHERE, address: { ...ELSEWHERE.address, category: "space-agencies" } }] }, PLACES);
  expect(merged.elsewhere).toHaveLength(1);
});

it("a postal block claiming an unknown state is malformed", () => {
  const merged = mergeFeed({ listings: [], added: [{ ...ELSEWHERE, address: { ...ELSEWHERE.address, state: "xx" } }] }, PLACES);
  expect(merged.elsewhere).toEqual([]);
  expect(merged.malformed).toHaveLength(1);
});

it("a Thane added business (no postal) is merged exactly as before", () => {
  const merged = mergeFeed({ listings: [], added: [ADDED_ENTRY] }, PLACES);
  expect(merged.listings).toHaveLength(1);
  expect(merged.elsewhere).toEqual([]);
});
```

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run lib/directory-feed.test.ts`.

- [ ] **Step 3: Implement.**

```ts
const feedPostalSchema = z.object({
  pincode: z.string().regex(/^[1-9][0-9]{5}$/),
  locality: z.string().min(1).max(120),
  district: z.string().min(1).max(120),
  state: z.string().min(1).max(120),
});
export type FeedPostal = z.infer<typeof feedPostalSchema>;
```

Add `postal: feedPostalSchema.optional(),` to `feedAddedListingSchema`.

```ts
/**
 * A confirmed business outside the districts this site has places for: it has a page of its own, under its state,
 * and nothing else (no area or category page, no ads, not in the Thane search). lib/server/local-listings.ts gives it
 * its URL code.
 */
export interface ElsewhereBusiness {
  readonly id: string;
  readonly stateCode: string;
  readonly urlSlug: string;
  readonly name: string;
  /** Its category's slug; it may have no page on this site. */
  readonly service: string;
  readonly address: string;
  readonly postal: FeedPostal;
  readonly phone: string;
  readonly verifiedAt: string;
  readonly photo: string | null;
  readonly website: string;
}
```

Add `readonly elsewhere: readonly ElsewhereBusiness[];` to `FeedMerge`, and `elsewhere: []` to `NO_MERGE`.

In `mergeFeed`'s `for (const entry of feed.added)` loop, before `place(entry, "added")`:

```ts
    if (entry.postal !== undefined) {
      const placed = admitElsewhere(entry);
      if (typeof placed === "string") {
        refused[placed].push(labelOf(entry));
      } else if (taken.has(placed.id)) {
        refused.skipped.push(labelOf(entry));
      } else {
        taken.add(placed.id);
        elsewhere.push(placed);
      }
      continue;
    }
```

```ts
/** An added business outside the opened districts, when its id, URL and state are sound. */
function admitElsewhere(entry: FeedAddedListing & { readonly postal: FeedPostal }): ElsewhereBusiness | Refusal {
  const { id, url, postal } = entry;
  if (id === undefined) return "unplaced";
  const { state, category } = entry.address;
  if (!isPlaceId(id) || url === undefined || !isPlaceUrlSlug(url.slug) || !isIndiaStateCode(state)) return "malformed";
  return {
    id,
    stateCode: state,
    urlSlug: url.slug,
    name: entry.name,
    service: category,
    address: entry.streetAddress,
    postal,
    phone: entry.phone,
    verifiedAt: entry.confirmedAt,
    photo: entry.photo ?? null,
    website: (entry.website === undefined ? null : safeWebsite(entry.website)) ?? "",
  };
}
```

Declare `const elsewhere: ElsewhereBusiness[] = [];` at the top of `mergeFeed`, and return it. Update the file's header comment with a line about the third kind.

- [ ] **Step 4: Run** `npx vitest run lib/directory-feed.test.ts`. Expected: PASS.

---

### Task 14: Index elsewhere businesses by URL code

**Files:**
- Modify: `lib/server/local-listings.ts` (`current()`, `indexByUrlCode`, new finders)
- Modify: `lib/place-id.ts` (`businessPath`)
- Test: `lib/server/local-listings.test.ts`, `lib/place-id.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/place-id.test.ts`:

```ts
it("a business path carries its own state when it has one", () => {
  expect(businessPath({ urlSlug: "smile-dental", urlCode: "abcdefgh23", stateCode: "wb" })).toBe("/in/wb/business/smile-dental/abcdefgh23");
  expect(businessPath({ urlSlug: "smile-dental", urlCode: "abcdefgh23" })).toBe("/in/mh/business/smile-dental/abcdefgh23");
});
```

`lib/server/local-listings.test.ts`: follow how this file stubs the platform feed today (see `platform-listings.test.ts` and the existing merge tests in it).

```ts
it("finds an elsewhere business by its URL code, and keeps it out of allListings()", async () => {
  await useFeed({ listings: [], added: [ELSEWHERE_ENTRY] }); // the file's existing feed stub helper
  const code = businessUrlCodeWith(TEST_KEY, "3k7m2q9");
  expect(findElsewhereByUrlCode(code)).toMatchObject({ id: "3k7m2q9", stateCode: "wb", urlCode: code });
  expect(findBusinessByUrlCode(code)).toBeUndefined();
  expect(allListings().some((listing) => listing.id === "3k7m2q9")).toBe(false);
  expect(allElsewhere()).toHaveLength(1);
});
```

- [ ] **Step 2: Implement**

`lib/place-id.ts`:

```ts
export interface BusinessUrlParts {
  readonly urlCode: string;
  readonly urlSlug: string;
  /** The state in the URL; Thane's businesses leave it out (Maharashtra). */
  readonly stateCode?: string;
}

/** /in/<state>/business/<name>/<code>. The code finds the business; the name is a label frozen at go-live. */
export function businessPath({ urlCode, urlSlug, stateCode = STATE_CODE }: BusinessUrlParts): string {
  return `${DIRECTORY_ROOT}/${stateCode}/${BUSINESS_SEGMENT}/${urlSlug}/${urlCode}`;
}
```

In `lib/server/local-listings.ts`:

```ts
/** An elsewhere business with the code in its URL. */
export interface ElsewhereListing extends ElsewhereBusiness {
  readonly urlCode: string;
}
```

Inside `current()`, where the merged listings get their `urlCode`, also map `merge.elsewhere` to `ElsewhereListing` with `urlCode: businessUrlCode(entry.id)`. Build `elsewhereByUrlCode`. Before building either map, check for clashes **across both** lists: change `indexByUrlCode` to take `readonly { id: string; urlCode: string }[]` and run it once over `[...all, ...elsewhere]` purely for the check (it throws on a clash), then build the two lookups.

```ts
/** A business outside the opened districts by the code in its URL, or undefined. */
export function findElsewhereByUrlCode(code: string): ElsewhereListing | undefined {
  return current().elsewhereByUrlCode.get(code);
}

/** Every business outside the opened districts, for the sitemap. */
export function allElsewhere(): readonly ElsewhereListing[] {
  return current().elsewhere;
}
```

- [ ] **Step 3: Run** `npx vitest run lib/place-id.test.ts lib/server/local-listings.test.ts`. Expected: PASS, with no new failures against the file's pre-existing baseline.

---

### Task 15: The business page for anywhere

**Files:**
- Create: `components/local/elsewhere-business.tsx`
- Modify: `app/(marketing)/in/[state]/business/[name]/[code]/page.tsx`
- Modify: `lib/directory-routes.ts` (`businessRedirect` keeps the state)
- Test: `components/local/elsewhere-business.render.test.tsx` (follow `lib/other-districts.render.test.ts` for how the repo render-tests server components)

- [ ] **Step 1: Write the failing render test**

```tsx
import { describe, expect, it } from "vitest";
import { elsewhereMetadata, ElsewhereBusinessView } from "@/components/local/elsewhere-business";
// render helper: as lib/other-districts.render.test.ts

const BUSINESS = {
  id: "3k7m2q9",
  urlCode: "abcdefgh23",
  stateCode: "wb",
  urlSlug: "smile-dental",
  name: "Smile Dental",
  service: "dentists",
  address: "AB-12, Sector V",
  postal: { pincode: "700091", locality: "Salt Lake Sector V", district: "North 24 Parganas", state: "West Bengal" },
  phone: "+919830000000",
  verifiedAt: "2026-10-06T10:00:00.000Z",
  photo: null,
  website: "",
};

describe("elsewhere business page", () => {
  it("titles it with locality and district, and lets search engines index it", () => {
    expect(elsewhereMetadata(BUSINESS, "Dentist")).toMatchObject({
      title: "Smile Dental, Salt Lake Sector V, North 24 Parganas",
      alternates: { canonical: "/in/wb/business/smile-dental/abcdefgh23" },
      robots: { index: true, follow: true },
    });
  });

  it("shows the address with PIN, a call button, and no ads or nearby lists", async () => {
    const html = await renderToString(<ElsewhereBusinessView business={BUSINESS} singular="Dentist" />);
    expect(html).toContain("Salt Lake Sector V, North 24 Parganas, West Bengal 700091");
    expect(html).toContain('href="tel:+919830000000"');
    expect(html).not.toContain("Sponsored");
    expect(html).toContain("India Post");
  });
});
```

- [ ] **Step 2: Implement the component.** Reuse what `BusinessView` uses for the header, photo, Verified badge, call/WhatsApp buttons and website link: import those pieces from `components/local/pages.tsx` / `components/listing/reach-buttons.tsx`. Don't copy them. Leave out the rating form, enquiry, nearby and ad spots.

```tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { businessPath } from "@/lib/place-id";
import type { ElsewhereListing } from "@/lib/server/local-listings";

/**
 * /in/<state>/business/<name>/<code> for a business outside the districts this site has places for: its own page and
 * nothing around it. No area or category links (those pages don't exist there yet), no ads, no reviews or enquiries.
 * Its locality and district come from India Post's PIN code directory, credited in the footer line.
 */

export function elsewhereMetadata(business: ElsewhereListing, singular: string): Metadata {
  const { locality, district } = business.postal;
  return {
    title: `${business.name}, ${locality}, ${district}`,
    description: `${business.name}: ${singular.toLocaleLowerCase("en-IN")} in ${locality}, ${district}. ${business.address}`,
    alternates: { canonical: businessPath(business) },
    // Confirmed by its owner (or on a call), as every platform business is.
    robots: { index: true, follow: true },
  };
}

interface ElsewhereBusinessViewProps {
  readonly business: ElsewhereListing;
  readonly singular: string;
}

export function ElsewhereBusinessView({ business, singular }: ElsewhereBusinessViewProps): ReactElement {
  const { locality, district, state, pincode } = business.postal;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {/* Header, photo and Verified badge: the same components BusinessView renders, given these fields. */}
      <h1 className="font-display text-3xl text-ink">{business.name}</h1>
      <p className="mt-1 text-ink-soft">{singular} · {locality}</p>
      <p className="mt-6 text-ink">{business.address}</p>
      <p className="text-ink-soft">{`${locality}, ${district}, ${state} ${pincode}`}</p>
      {/* Reach buttons: the existing component, with call and WhatsApp on business.phone and the website when set. */}
      <p className="mt-10 text-xs text-ink-soft">Locality from India Post's PIN code directory (data.gov.in).</p>
    </main>
  );
}
```

The two JSX comments mark where the existing header and reach components go. Look up their exact props in `pages.tsx` and `reach-buttons.tsx` and render them there. Don't leave the comments in the final code.

- [ ] **Step 3: Route.** In `in/[state]/business/[name]/[code]/page.tsx`:

```ts
type Found =
  | { readonly kind: "directory"; readonly listing: Listing; readonly category: BusinessCategory; readonly area: LocalArea }
  | { readonly kind: "elsewhere"; readonly business: ElsewhereListing; readonly singular: string };

function resolve(rawCode: string): Found | null {
  const code = rawCode.toLowerCase();
  if (!isBusinessUrlCode(code)) return null;
  const listing = findBusinessByUrlCode(code);
  if (listing !== undefined) {
    const category = findBusinessCategory(listing.service);
    const area = findArea(listing.area);
    return category && area ? { kind: "directory", listing, category, area } : null;
  }
  const business = findElsewhereByUrlCode(code);
  if (business === undefined) return null;
  // A category this site has no taxonomy entry for still names the business: its slug, spaced and capitalised.
  const singular = findBusinessCategory(business.service)?.singular ?? business.service.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  return { kind: "elsewhere", business, singular };
}
```

In the page:
1. Read `state` too.
2. After resolving, compute the canonical path: `businessPath(found.listing)` (mh) or `businessPath(found.business)` (its state).
3. Change `businessRedirect` so it takes the canonical `BusinessUrlParts` (with `stateCode`) plus the asked-for `state`, `name` and `code`. It then redirects a wrong state segment too (`/in/mh/business/x/<wb-code>` → `/in/wb/...`):

```ts
export function businessRedirect(listing: BusinessUrlParts, asked: { readonly state: string; readonly name: string; readonly code: string }, search: QueryParams): string | null {
  const canonical = businessPath(listing);
  const askedPath = `${DIRECTORY_ROOT}/${asked.state}/${BUSINESS_SEGMENT}/${asked.name}/${asked.code}`;
  return canonical === askedPath ? null : withQuery(canonical, search);
}
```

Add a test to `lib/directory-routes.test.ts`: a `wb` business asked for under `mh` redirects to `/in/wb/business/...`, and the exact path returns null. Update the existing `businessRedirect` tests to the new signature.

4. Render `BusinessView` or `ElsewhereBusinessView` by `found.kind`. `generateMetadata` picks `businessMetadata` or `elsewhereMetadata` the same way.

- [ ] **Step 4: Run** `npx vitest run components/local lib/directory-routes.test.ts && npm run typecheck`. Expected: PASS, with no new tsc errors.

---

### Task 16: Sitemap

**Files:**
- Modify: `app/sitemap.ts`, and `lib/directory-sitemap.ts` (+ its test) if the paths are built there

- [ ] **Step 1: Failing test** in `lib/directory-sitemap.test.ts`: `directorySitemapPaths({ areas, listings, elsewhere: [ELSEWHERE_LISTING] })` includes `/in/wb/business/smile-dental/abcdefgh23`.
- [ ] **Step 2: Implement.** Add an `elsewhere: readonly BusinessUrlParts[]` input, push `businessPath(item)` for each, and pass `allElsewhere()` from `app/sitemap.ts`.
- [ ] **Step 3: Run** `npx vitest run lib/directory-sitemap.test.ts`. Expected: PASS.

---

### Task 17: Full checks and end-to-end

- [ ] **Step 1: Platform**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build
```

Expected: all green.

- [ ] **Step 2: Website**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: no new failures against the baseline. Record the pre-existing failure count before Task 11, and name any that remain.

- [ ] **Step 3: End-to-end, both apps wired** (platform on its dev port, website pointed at it with the same `DIRECTORY_URL_KEY`; see [[local-dev-servers]])
1. Make a new free listing account. Fill in Details, then on the Listing tab enter PIN `700091`, pick "Salt Lake Sector V" and "Dentists", and save. The preview shows `/in/wb/business/<name>/<code>`.
2. Publish it from the Review tab, or approve it in the staff console. The staff row shows "Salt Lake Sector V · PIN 700091".
3. `curl -s localhost:<platform>/api/directory/listings | jq '.added[] | select(.postal)'` shows `address.state: "wb"` and the postal block.
4. On the website, `/in/wb/business/<name>/<code>` renders with the address line `…, North 24 Parganas, West Bengal 700091` and no ads. `/in/mh/business/<name>/<code>` gives a 301 to the `wb` URL. `/in/wb` and `/in/wb/kolkata` give 404. `/in/mh/thane/naupada/dentists` doesn't list it.
5. Regression: a Thane add with PIN `400602` and area Naupada still lands on `/in/mh/thane/naupada/dentists`, with its business page at `/in/mh/business/...`.
6. `/sitemap.xml` contains the `wb` business URL.
Take a screenshot of each page for the report.

- [ ] **Step 4: Rollout notes for the user** (not to be done here)
1. Platform first: migrations 0084–0086, then `pnpm directory:import-pincodes` on the droplet.
2. Then the website.
Before step 2 the website would receive `postal` entries it ignores and skips harmlessly, because the field is optional.

---

## Out of scope (separate plans)
- **Opening a district** (e.g. Kolkata): its areas in places.json and the website places, and moving its elsewhere claims into areas using their PIN and locality. That plan also covers rewriting `<state>-<district>` listing keys and registering the old keys as legacy keys.
- Search for elsewhere businesses (the state-wide Postgres FTS plan).
- Reviews, enquiries and ads for elsewhere businesses.
- State and district browse pages: `/in/wb` and `/in/wb/kolkata` stay 404.
- Bengali or other state languages ([[website-languages]]).
- Generalising `lib/local-directory.ts` (one district, `STATE_CODE`) to many states.
