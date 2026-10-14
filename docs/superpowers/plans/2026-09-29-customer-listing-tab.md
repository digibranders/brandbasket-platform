# Customer Listing Tab (Phase 1, platform) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give paying clients a **Listing** section in the customer dashboard, give staff a Listing section on the
client page, and publish every live listing as a public JSON feed the `/in` directory will read.

**Architecture:** Two new tables split by who writes them: `directory_listings` (staff-owned placement: category,
city, area, slug, pin, links) and `listing_content` (client-owned: about, tags, button switches, visible). Grants and
row-level security enforce the split. Pure logic (places list, validators, stage, feed shaping) lives in
`packages/shared`; queries in `packages/db`; pages and actions in the two apps. The feed is a cached public route like
`/api/pricing`.

**Tech Stack:** Next.js 16 server actions, Drizzle 0.45 + Postgres 16 (RLS), zod 4, Vitest (unit + integration),
Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-29-customer-listing-tab-design.md`.

**Out of this plan (own plans later):** the `/in` merge in the website repo (Phase 1b; needs `feat/global-search`
committed first), numbers (Phase 2), Google import (Phase 3).

**House rules for whoever executes this:**
- **Do not commit or push.** The user's standing rule: leave everything uncommitted for their review. Wherever a
  step would commit, stop at "tests pass" instead.
- Work in this worktree: `/Users/siddiqueahmed/Desktop/AI/fynix-platform/listing-tab-spec` (branch
  `docs/listing-tab-spec`, off `origin/development`). Rename the branch to `feat/listing-tab` before starting.
- Run `pnpm install` once in the worktree, and `pnpm env:init` only if `apps/platform/.env.local` is missing.
- Match the surrounding code: comment density, naming, explicit return types, no `any`.

## Deviations from the spec (decided while planning; tell the user)

1. **Linking the unconfirmed row:** the platform does not hold the 32k directory rows, so there is no search box.
   Staff paste the unconfirmed page's `/in/...` path; it is stored as `replaces_source_path`.
2. **Previous addresses** are a `text[]` (`previous_paths`), not jsonb. Coordinates are `double precision`.
3. **Paused (lapsed) listings are read-only in the tab.** The existing rule that every write needs a paid plan
   (`paidCustomerOrNull`) wins over the spec's "rows editable while paused". The tab says so.
4. The announcement is edited only on Your details; the Listing tab shows it with its end date and links there.

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/lib/directory/places.json` | Copy of the directory's state, cities, areas and categories (from the website repo) |
| `packages/shared/src/lib/directory/places.ts` | Typed access to that list, slug checks, `slugifyBusinessName` |
| `packages/shared/src/lib/directory/listing-content.ts` | Client field rules and form parsers (about, tags, buttons, visible) |
| `packages/shared/src/lib/directory/placement-form.ts` | Staff placement form parser |
| `packages/shared/src/lib/directory/stage.ts` | Building / live / hidden / paused |
| `packages/shared/src/lib/directory/feed-contract.ts` | The feed's JSON shape (copied to the website repo later; additive-only) |
| `packages/shared/src/lib/directory/feed.ts` | Pure shaping of one listing into the feed |
| `packages/db/src/schema/directory.ts` | The two tables |
| `packages/db/migrations/0052_directory_listings.sql` | Generated DDL |
| `packages/db/migrations/0053_directory_listings_grants.sql` | Hand-written grants and RLS |
| `packages/db/src/queries/directory-listings.ts` | Staff, tenant and system queries |
| `packages/db/src/directory-listings.integration.test.ts` | Queries + RLS against real Postgres |
| `apps/platform/lib/server/directory-feed.ts` | Gathers rows and facts into the feed |
| `apps/platform/app/api/directory/listings/route.ts` | `GET /api/directory/listings` |
| `apps/platform/lib/server/listing.ts` | `hasOwnListing()` for the nav |
| `apps/platform/app/app-host/(protected)/listing/{page,actions,errors}.ts(x)` | The customer tab |
| `apps/platform/components/panel/listing/*.tsx` | The tab's client components |
| `apps/platform/components/panel/customer-shell.tsx` | Nav item |
| `apps/admin/components/client-listing.tsx` | Staff Listing section |
| `apps/admin/app/(protected)/clients/[businessId]/{actions.ts,page.tsx}` | Staff action and section wiring |

---

### Task 0: Branch

- [ ] **Step 1: Rename the branch**

Run: `git -C /Users/siddiqueahmed/Desktop/AI/fynix-platform/listing-tab-spec branch -m docs/listing-tab-spec feat/listing-tab`
Expected: no output. `git branch --show-current` prints `feat/listing-tab`.

---

### Task 1: Directory places in shared

**Files:**
- Create: `packages/shared/src/lib/directory/places.json`
- Create: `packages/shared/src/lib/directory/places.ts`
- Test: `packages/shared/src/lib/directory/places.test.ts`

- [ ] **Step 1: Generate the places copy** (state, cities, areas and categories only; no businesses, counts or
  coordinates)

```bash
node -e '
const src = require("/Users/siddiqueahmed/Desktop/AI/fynix-platform/fynix-website-search/content/local/thane-places.json");
const out = {
  source: "fynix-website content/local/thane-places.json, 2026-09-29. Keep in step with the website repo.",
  state: src.state,
  cities: src.cities.map(({ slug, name }) => ({ slug, name })),
  areas: src.areas.map(({ slug, name, city }) => ({ slug, name, city })),
  services: src.services.map(({ slug, label }) => ({ slug, label })),
};
require("fs").writeFileSync("packages/shared/src/lib/directory/places.json", JSON.stringify(out, null, 2) + "\n");
console.log(out.cities.length, "cities,", out.areas.length, "areas,", out.services.length, "categories");
'
```

Expected: `12 cities, 200 areas, 111 categories`.

- [ ] **Step 2: Write the failing test**

```ts
// packages/shared/src/lib/directory/places.test.ts
import { describe, expect, it } from "vitest";
import {
  DIRECTORY_AREAS,
  DIRECTORY_CATEGORIES,
  DIRECTORY_CITIES,
  DIRECTORY_STATE,
  areaName,
  categoryLabel,
  cityName,
  isDirectoryArea,
  isDirectoryCategory,
  isDirectoryCity,
  slugifyBusinessName,
} from "./places";

describe("directory places", () => {
  it("loads the Thane lists", () => {
    expect(DIRECTORY_STATE.code).toBe("mh");
    expect(DIRECTORY_CITIES.map((city) => city.slug)).toContain("thane");
    expect(DIRECTORY_CATEGORIES.map((category) => category.slug)).toContain("dentists");
    expect(DIRECTORY_AREAS.length).toBeGreaterThan(100);
  });

  it("checks slugs against the lists", () => {
    expect(isDirectoryCategory("dentists")).toBe(true);
    expect(isDirectoryCategory("mh")).toBe(false);
    expect(isDirectoryCity("thane")).toBe(true);
    expect(isDirectoryCity("mumbai")).toBe(false);
    const area = DIRECTORY_AREAS[0];
    if (area === undefined) throw new Error("no areas");
    expect(isDirectoryArea(area.city, area.slug)).toBe(true);
    expect(isDirectoryArea("not-a-city", area.slug)).toBe(false);
  });

  it("names things for people", () => {
    expect(cityName("navi-mumbai")).toBe("Navi Mumbai");
    expect(categoryLabel("dentists")).toMatch(/dentist/i);
    expect(areaName("thane", "no-such-area")).toBeNull();
  });

  it("turns a business name into the last part of its address", () => {
    expect(slugifyBusinessName("Smile Dental Clinic")).toBe("smile-dental-clinic");
    expect(slugifyBusinessName("  Rao & Sons  ")).toBe("rao-and-sons");
    expect(slugifyBusinessName("Café Mocha!!")).toBe("cafe-mocha");
    expect(slugifyBusinessName("!!!")).toBe("");
    expect(slugifyBusinessName("a".repeat(120))).toHaveLength(80);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/places.test.ts`
Expected: FAIL, `Failed to resolve import "./places"`.

- [ ] **Step 4: Implement**

```ts
// packages/shared/src/lib/directory/places.ts
import { z } from "zod";
import placesJson from "./places.json";

/**
 * The directory's fixed lists, copied from the website repo's content/local/thane-places.json (see "source" in the
 * JSON). Staff pick a listing's category, city and area from these, and the website builds its /in addresses from the
 * same slugs, so the two copies must stay in step: change both, like pricing and the brand pieces.
 */
const placesSchema = z.object({
  state: z.object({ code: z.string().regex(/^[a-z]{2}$/), name: z.string() }),
  cities: z.array(z.object({ slug: z.string(), name: z.string() })),
  areas: z.array(z.object({ slug: z.string(), name: z.string(), city: z.string() })),
  services: z.array(z.object({ slug: z.string(), label: z.string() })),
});

const PLACES = placesSchema.parse(placesJson);

export interface DirectoryCity {
  readonly slug: string;
  readonly name: string;
}

export interface DirectoryArea extends DirectoryCity {
  /** Slug of the city the area belongs to. */
  readonly city: string;
}

export interface DirectoryCategory {
  readonly slug: string;
  readonly label: string;
}

export const DIRECTORY_STATE: { readonly code: string; readonly name: string } = PLACES.state;
export const DIRECTORY_CITIES: readonly DirectoryCity[] = PLACES.cities;
export const DIRECTORY_AREAS: readonly DirectoryArea[] = PLACES.areas;
export const DIRECTORY_CATEGORIES: readonly DirectoryCategory[] = PLACES.services;

/** Where the directory is served. Paths from `listingPath` are appended to this. */
export const DIRECTORY_ORIGIN = "https://fynix.digital";

export function isDirectoryCategory(slug: string): boolean {
  return DIRECTORY_CATEGORIES.some((category) => category.slug === slug);
}

export function isDirectoryCity(slug: string): boolean {
  return DIRECTORY_CITIES.some((city) => city.slug === slug);
}

export function isDirectoryArea(citySlug: string, areaSlug: string): boolean {
  return DIRECTORY_AREAS.some((area) => area.city === citySlug && area.slug === areaSlug);
}

export function cityName(slug: string): string | null {
  return DIRECTORY_CITIES.find((city) => city.slug === slug)?.name ?? null;
}

export function areaName(citySlug: string, areaSlug: string): string | null {
  return DIRECTORY_AREAS.find((area) => area.city === citySlug && area.slug === areaSlug)?.name ?? null;
}

export function categoryLabel(slug: string): string | null {
  return DIRECTORY_CATEGORIES.find((category) => category.slug === slug)?.label ?? null;
}

const SLUG_MAX_LENGTH = 80;

/**
 * "Smile Dental Clinic" -> "smile-dental-clinic". Accents are dropped, "&" reads as "and", anything else that is not a
 * letter or digit becomes a hyphen. Empty when nothing usable is left; the caller asks staff to type one.
 */
export function slugifyBusinessName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/places.test.ts`
Expected: PASS (4 tests).

---

### Task 2: Client field rules

**Files:**
- Create: `packages/shared/src/lib/directory/listing-content.ts`
- Test: `packages/shared/src/lib/directory/listing-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/lib/directory/listing-content.test.ts
import { describe, expect, it } from "vitest";
import {
  LISTING_ABOUT_MAX_LENGTH,
  LISTING_TAG_LIMIT,
  containsContactDetails,
  parseAboutForm,
  parseButtonsForm,
  parseTagsForm,
  parseVisibleForm,
} from "./listing-content";

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("containsContactDetails", () => {
  it.each([
    "Visit https://example.com",
    "see www.example.in",
    "smiledental.in for more",
    "write to hello@example.com",
    "Call +91 98200 12345",
    "call 9820012345",
  ])("flags %s", (text) => {
    expect(containsContactDetails(text)).toBe(true);
  });

  it.each(["Open 10 am - 9 pm", "Since 1998", "Root canals, braces and kids' care", "24x7 emergency"])(
    "allows %s",
    (text) => {
      expect(containsContactDetails(text)).toBe(false);
    },
  );
});

describe("parseAboutForm", () => {
  it("cleans and accepts one line", () => {
    expect(parseAboutForm(form([["about", "  Gentle family dentistry.  "]]))).toEqual({
      success: true,
      data: { about: "Gentle family dentistry." },
    });
  });

  it("treats an empty field as clearing it", () => {
    expect(parseAboutForm(form([["about", "   "]]))).toEqual({ success: true, data: { about: null } });
  });

  it("refuses a line break, too long, or contact details", () => {
    expect(parseAboutForm(form([["about", "one\ntwo"]]))).toMatchObject({ success: false, field: "about" });
    expect(parseAboutForm(form([["about", "a".repeat(LISTING_ABOUT_MAX_LENGTH + 1)]]))).toMatchObject({
      success: false,
      field: "about",
    });
    expect(parseAboutForm(form([["about", "Call 9820012345"]]))).toMatchObject({
      success: false,
      field: "about",
      message: expect.stringMatching(/web addresses/i),
    });
  });
});

describe("parseTagsForm", () => {
  it("keeps order, trims, drops empties and case-insensitive duplicates", () => {
    const result = parseTagsForm(form([["tag", " Braces "], ["tag", ""], ["tag", "braces"], ["tag", "Root canal"]]));
    expect(result).toEqual({ success: true, data: { tags: ["Braces", "Root canal"] } });
  });

  it("refuses too many, too long, or contact details", () => {
    const many = Array.from({ length: LISTING_TAG_LIMIT + 1 }, (_, index) => ["tag", `Service ${index}`] as const);
    expect(parseTagsForm(form(many))).toMatchObject({ success: false, field: "tag" });
    expect(parseTagsForm(form([["tag", "x".repeat(33)]]))).toMatchObject({ success: false, field: "tag" });
    expect(parseTagsForm(form([["tag", "www.spam.com"]]))).toMatchObject({ success: false, field: "tag" });
  });
});

describe("parseButtonsForm", () => {
  it("reads each switch; missing means off", () => {
    expect(parseButtonsForm(form([["call", "on"], ["directions", "on"]]))).toEqual({
      success: true,
      data: { call: true, whatsapp: false, book: false, directions: true, website: false },
    });
  });
});

describe("parseVisibleForm", () => {
  it("accepts on and off only", () => {
    expect(parseVisibleForm(form([["visible", "on"]]))).toEqual({ success: true, data: { visible: true } });
    expect(parseVisibleForm(form([["visible", "off"]]))).toEqual({ success: true, data: { visible: false } });
    expect(parseVisibleForm(form([["visible", "maybe"]]))).toMatchObject({ success: false });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/listing-content.test.ts`
Expected: FAIL, cannot resolve `./listing-content`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/lib/directory/listing-content.ts
/** The fields a client edits on their Listing tab, and the parsers for each small form there. */
import { textField, type FormParseResult } from "../form-result";
import { cleanLine } from "../validation/text";

export const LISTING_ABOUT_MAX_LENGTH = 160;
export const LISTING_TAG_LIMIT = 8;
export const LISTING_TAG_MAX_LENGTH = 32;

export const LISTING_BUTTONS = ["call", "whatsapp", "book", "directions", "website"] as const;
export type ListingButton = (typeof LISTING_BUTTONS)[number];
export type ListingButtonSwitches = Readonly<Record<ListingButton, boolean>>;

export const LISTING_BUTTON_LABELS: Readonly<Record<ListingButton, string>> = {
  call: "Call",
  whatsapp: "WhatsApp",
  book: "Book",
  directions: "Directions",
  website: "Website",
};

const HAS_LINE_BREAK = /[\r\n  ]/;

/**
 * Web addresses, email addresses and phone numbers. The listing's phone is checked by staff, so free text must not
 * carry another one past that check; the same rule keeps spam links out of the directory.
 */
const CONTACT_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9-]+\.(?:com|in|net|org|io|co|info|biz)\b/i,
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
  /\+?\d[\d\s-]{7,}\d/,
];

const CONTACT_MESSAGE = "Web addresses, emails and phone numbers can't go here. Your buttons handle those.";

export function containsContactDetails(text: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}

export function parseAboutForm(formData: FormData): FormParseResult<{ readonly about: string | null }> {
  const raw = textField(formData, "about");
  const about = cleanLine(raw);
  if (HAS_LINE_BREAK.test(raw) || about.length > LISTING_ABOUT_MAX_LENGTH) {
    return {
      success: false,
      field: "about",
      message: `Write it in one line, up to ${LISTING_ABOUT_MAX_LENGTH} characters.`,
    };
  }
  if (containsContactDetails(about)) return { success: false, field: "about", message: CONTACT_MESSAGE };
  return { success: true, data: { about: about === "" ? null : about } };
}

export function parseTagsForm(formData: FormData): FormParseResult<{ readonly tags: readonly string[] }> {
  const tags: string[] = [];
  for (const value of formData.getAll("tag")) {
    if (typeof value !== "string") continue;
    const tag = cleanLine(value);
    if (tag === "") continue;
    if (tag.length > LISTING_TAG_MAX_LENGTH) {
      return { success: false, field: "tag", message: `Keep each service to ${LISTING_TAG_MAX_LENGTH} characters.` };
    }
    if (containsContactDetails(tag)) return { success: false, field: "tag", message: CONTACT_MESSAGE };
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) continue;
    tags.push(tag);
  }
  if (tags.length > LISTING_TAG_LIMIT) {
    return { success: false, field: "tag", message: `Up to ${LISTING_TAG_LIMIT} services.` };
  }
  return { success: true, data: { tags } };
}

/** Each switch posts "on" when ticked and nothing when not, like any checkbox. */
export function parseButtonsForm(formData: FormData): FormParseResult<ListingButtonSwitches> {
  const switches = Object.fromEntries(
    LISTING_BUTTONS.map((button) => [button, textField(formData, button) === "on"]),
  ) as Record<ListingButton, boolean>;
  return { success: true, data: switches };
}

export function parseVisibleForm(formData: FormData): FormParseResult<{ readonly visible: boolean }> {
  const value = textField(formData, "visible");
  if (value !== "on" && value !== "off") {
    return { success: false, field: "visible", message: "Choose whether to show your listing." };
  }
  return { success: true, data: { visible: value === "on" } };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/listing-content.test.ts`
Expected: PASS. If "24x7 emergency" is flagged, the phone pattern is too loose: it must need 9+ digit-or-separator
characters between two digits, as written above.

---

### Task 3: Schema and generated migration

**Files:**
- Create: `packages/db/src/schema/directory.ts`
- Modify: `packages/db/src/schema/index.ts` (add export)
- Create (generated): `packages/db/migrations/0052_directory_listings.sql`, `packages/db/migrations/meta/0052_snapshot.json`,
  journal entry

- [ ] **Step 1: Write the schema**

```ts
// packages/db/src/schema/directory.ts
import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

const SLUG = "^[a-z0-9]+(-[a-z0-9]+)*$";

/**
 * Where a client's Featured listing sits on the local directory (fynix.digital/in): its address parts, map pin and the
 * links behind its buttons. Staff-owned: the customer role can read its own row and write nothing, because every
 * column here shapes the listing's web address or has been checked by staff (docs/superpowers/specs/
 * 2026-09-29-customer-listing-tab-design.md).
 */
export const directoryListings = pgTable(
  "directory_listings",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => businesses.id),
    categorySlug: text("category_slug").notNull(),
    stateCode: text("state_code").notNull(),
    citySlug: text("city_slug").notNull(),
    areaSlug: text("area_slug").notNull(),
    slug: text("slug").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    /** What the client sees for the pin, e.g. "Gokhale Road, near Thane station". */
    pinLabel: text("pin_label").notNull(),
    /** Null means WhatsApp goes to business_profiles.phone. */
    whatsappPhone: text("whatsapp_phone"),
    /** The client site's booking page, behind the Book button. */
    bookingUrl: text("booking_url"),
    /** The unconfirmed directory page this listing replaces, e.g. "/in/dentists/mh/thane/naupada/smile-dental". */
    replacesSourcePath: text("replaces_source_path"),
    /** Earlier addresses, oldest first; the directory redirects each to the current one. */
    previousPaths: text("previous_paths").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("directory_listings_address_key").on(
      table.categorySlug,
      table.stateCode,
      table.citySlug,
      table.areaSlug,
      table.slug,
    ),
    check("directory_listings_category_slug_check", sql`${table.categorySlug} ~ ${sql.raw(`'${SLUG}'`)}`),
    check("directory_listings_state_code_check", sql`${table.stateCode} ~ '^[a-z]{2}$'`),
    check("directory_listings_city_slug_check", sql`${table.citySlug} ~ ${sql.raw(`'${SLUG}'`)}`),
    check("directory_listings_area_slug_check", sql`${table.areaSlug} ~ ${sql.raw(`'${SLUG}'`)}`),
    check(
      "directory_listings_slug_check",
      sql`${table.slug} ~ ${sql.raw(`'${SLUG}'`)} and char_length(${table.slug}) <= 80`,
    ),
    check("directory_listings_pin_label_check", sql`char_length(${table.pinLabel}) between 1 and 120`),
    check(
      "directory_listings_whatsapp_phone_check",
      sql`${table.whatsappPhone} is null or ${table.whatsappPhone} ~ '^\\+[0-9]{8,15}$'`,
    ),
    check("directory_listings_booking_url_check", sql`${table.bookingUrl} is null or ${table.bookingUrl} ~ '^https://'`),
    check(
      "directory_listings_replaces_source_path_check",
      sql`${table.replacesSourcePath} is null or ${table.replacesSourcePath} ~ '^/in/[a-z0-9/-]+$'`,
    ),
  ],
);

/**
 * What the client writes about their listing. Created by staff together with the placement row; the customer role
 * may only update it (column grant in 0053), never insert or delete.
 */
export const listingContent = pgTable(
  "listing_content",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => directoryListings.businessId),
    about: text("about"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    showCall: boolean("show_call").notNull().default(true),
    showWhatsapp: boolean("show_whatsapp").notNull().default(true),
    showBook: boolean("show_book").notNull().default(false),
    showDirections: boolean("show_directions").notNull().default(true),
    showWebsite: boolean("show_website").notNull().default(true),
    visible: boolean("visible").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("listing_content_about_check", sql`${table.about} is null or char_length(${table.about}) between 1 and 160`),
    check("listing_content_about_single_line_check", sql`${table.about} is null or ${table.about} !~ '[\\r\\n]'`),
    check("listing_content_tags_check", sql`cardinality(${table.tags}) <= 8`),
  ],
);
```

Add to `packages/db/src/schema/index.ts`, keeping the alphabetical order (after `./business-facts`… `./currency`):

```ts
export * from "./directory";
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @fynix/db exec drizzle-kit generate --name directory_listings`
Expected: `packages/db/migrations/0052_directory_listings.sql` created with two `CREATE TABLE`s, the unique
constraint, the checks and the two foreign keys. Open it and confirm the regex checks read `'^[a-z0-9]+(-[a-z0-9]+)*$'`
and `'^\+[0-9]{8,15}$'` (single backslash in SQL).

- [ ] **Step 3: Add the header comment** at the top of `0052_directory_listings.sql`:

```sql
-- the local directory listings (docs/superpowers/specs/2026-09-29-customer-listing-tab-design.md): directory_listings
-- is the staff-owned placement (address parts, pin, button targets), listing_content the client-owned text and
-- switches. Generated by drizzle-kit; grants and row-level security are in 0053.
```

---

### Task 4: Grants and RLS migration

**Files:**
- Create (custom): `packages/db/migrations/0053_directory_listings_grants.sql` + journal entry

- [ ] **Step 1: Create the empty custom migration**

Run: `pnpm --filter @fynix/db exec drizzle-kit generate --custom --name directory_listings_grants`
Expected: an empty `0053_directory_listings_grants.sql`.

- [ ] **Step 2: Fill it**

```sql
-- Grants and row-level security for the listing tables 0052 added. The split is by writer: staff own
-- directory_listings (every column shapes the web address or was checked by staff), the client owns the text and
-- switches in listing_content. The customer role can read its own two rows and update only listing_content's
-- client columns; it can never insert or delete either, so a listing exists only when staff create it.
-- fynix_public gets nothing: the directory reads listings through the platform's feed route on the staff connection.

GRANT SELECT ON directory_listings TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON directory_listings TO fynix_staff;
--> statement-breakpoint

ALTER TABLE directory_listings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY directory_listings_tenant_read ON directory_listings FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY directory_listings_staff_all ON directory_listings FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

GRANT SELECT ON listing_content TO fynix_app;
--> statement-breakpoint

-- business_id is left out, so a row can never be moved to another business.
GRANT UPDATE (about, tags, show_call, show_whatsapp, show_book, show_directions, show_website, visible, updated_at)
  ON listing_content TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON listing_content TO fynix_staff;
--> statement-breakpoint

ALTER TABLE listing_content ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY listing_content_tenant_read ON listing_content FOR SELECT TO fynix_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY listing_content_tenant_update ON listing_content FOR UPDATE TO fynix_app
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint

CREATE POLICY listing_content_staff_all ON listing_content FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
```

- [ ] **Step 3: Apply to the dev and test databases**

Run: `pnpm db:migrate && pnpm db:migrate:test`
Expected: both report `0052_directory_listings` and `0053_directory_listings_grants` applied, no errors.

---

### Task 5: Queries

**Files:**
- Create: `packages/db/src/queries/directory-listings.ts`
- Modify: `packages/db/src/index.ts` (exports)
- Test: `packages/db/src/directory-listings.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/db/src/directory-listings.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  findListingPlacement,
  findOwnListing,
  hasLiveProject,
  listingPath,
  ListingAddressTakenError,
  listLiveDirectoryListings,
  saveListingPlacement,
  updateOwnListingContent,
  type ListingPlacementInput,
} from "./queries/directory-listings";
import { businesses, businessMembers, businessProfiles, directoryListings, listingContent, projects, users } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const NOW = new Date("2026-09-29T10:00:00.000Z");

const PLACEMENT: ListingPlacementInput = {
  categorySlug: "dentists",
  stateCode: "mh",
  citySlug: "thane",
  areaSlug: "naupada",
  slug: "smile-dental-clinic",
  lat: 19.19,
  lon: 72.97,
  pinLabel: "Gokhale Road, near Thane station",
  whatsappPhone: null,
  bookingUrl: null,
  replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
};

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function asA<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER_A, businessId: businessA }, work);
}

function asB<T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: OWNER_B, businessId: businessB }, work);
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: OWNER_B, name: "Ben Ortiz", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "smile-dental", name: "Smile Dental Clinic" },
      { slug: "harbour-salon", name: "Harbour Salon" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "smile-dental")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "harbour-salon")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
  await dbs.staff.db.insert(businessProfiles).values({
    businessId: businessA,
    displayName: "Smile Dental Clinic",
    phone: "+919000000000",
    addressLine1: "12 Gokhale Road",
    city: "Thane",
    postalCode: "400602",
  });
});

describe("listingPath", () => {
  it("builds the /in address", () => {
    expect(listingPath(PLACEMENT)).toBe("/in/dentists/mh/thane/naupada/smile-dental-clinic");
  });
});

describe("saveListingPlacement", () => {
  it("creates the placement and an empty content row", async () => {
    const saved = await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    expect(saved).toMatchObject({ ...PLACEMENT, businessId: businessA, previousPaths: [] });
    const content = await dbs.staff.db.select().from(listingContent);
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ businessId: businessA, about: null, tags: [], visible: true, showBook: false });
  });

  it("remembers the old address when the address changes, and not when it does not", async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    await saveListingPlacement(dbs.staff.db, businessA, { ...PLACEMENT, pinLabel: "Moved the label" }, NOW);
    expect((await findListingPlacement(dbs.staff.db, businessA))?.previousPaths).toEqual([]);

    const moved = await saveListingPlacement(dbs.staff.db, businessA, { ...PLACEMENT, areaSlug: "panch-pakhadi" }, NOW);
    expect(moved.previousPaths).toEqual(["/in/dentists/mh/thane/naupada/smile-dental-clinic"]);

    const back = await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    expect(back.previousPaths).toEqual(["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"]);
  });

  it("refuses an address another business already has", async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    await expect(saveListingPlacement(dbs.staff.db, businessB, PLACEMENT, NOW)).rejects.toBeInstanceOf(
      ListingAddressTakenError,
    );
  });
});

describe("the customer's own listing", () => {
  beforeEach(async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
  });

  it("reads its own listing and nobody else's", async () => {
    const own = await asA((tx) => findOwnListing(tx));
    expect(own?.placement.slug).toBe("smile-dental-clinic");
    expect(own?.content).toEqual({
      about: null,
      tags: [],
      buttons: { call: true, whatsapp: true, book: false, directions: true, website: true },
      visible: true,
    });
    expect(await asB((tx) => findOwnListing(tx))).toBeNull();
  });

  it("updates its own content", async () => {
    const updated = await asA((tx) =>
      updateOwnListingContent(tx, { about: "Gentle family dentistry.", tags: ["Braces"], visible: false }, NOW),
    );
    expect(updated).toBe(true);
    const own = await asA((tx) => findOwnListing(tx));
    expect(own?.content).toMatchObject({ about: "Gentle family dentistry.", tags: ["Braces"], visible: false });
  });

  it("returns false for a business with no listing", async () => {
    expect(await asB((tx) => updateOwnListingContent(tx, { about: "Hello" }, NOW))).toBe(false);
  });

  it("cannot change the placement, or insert or delete content", async () => {
    const updatePlacement = await captureErrorText(
      asA((tx) => tx.update(directoryListings).set({ slug: "hijacked" })),
    );
    expect(updatePlacement).toMatch(/permission denied/);
    const insert = await captureErrorText(asB((tx) => tx.insert(listingContent).values({ businessId: businessB })));
    expect(insert).toMatch(/permission denied/);
    const remove = await captureErrorText(asA((tx) => tx.delete(listingContent)));
    expect(remove).toMatch(/permission denied/);
  });

  it("holds the database checks on about and tags", async () => {
    const tooLong = await captureErrorText(asA((tx) => updateOwnListingContent(tx, { about: "a".repeat(161) }, NOW)));
    expect(tooLong).toMatch(/listing_content_about_check/);
    const tooMany = await captureErrorText(
      asA((tx) => updateOwnListingContent(tx, { tags: Array.from({ length: 9 }, (_, index) => `t${index}`) }, NOW)),
    );
    expect(tooMany).toMatch(/listing_content_tags_check/);
  });
});

describe("hasLiveProject and the feed rows", () => {
  it("lists only businesses with a live project, with their profile", async () => {
    await saveListingPlacement(dbs.staff.db, businessA, PLACEMENT, NOW);
    expect(await hasLiveProject(dbs.staff.db, businessA)).toBe(false);
    expect(await listLiveDirectoryListings(dbs.staff.db)).toEqual([]);

    await dbs.staff.db.insert(projects).values({ businessId: businessA, status: "live" });
    expect(await hasLiveProject(dbs.staff.db, businessA)).toBe(true);
    expect(await asA((tx) => hasLiveProject(tx, businessA))).toBe(true);

    const rows = await listLiveDirectoryListings(dbs.staff.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessId: businessA,
      name: "Smile Dental Clinic",
      phone: "+919000000000",
      streetAddress: "12 Gokhale Road, Thane 400602",
      websiteUrl: null,
      placement: { slug: "smile-dental-clinic" },
      content: { visible: true },
    });
  });
});
```

Before running, check `projects` insert needs: open `packages/db/src/schema/projects.ts` and add any other `notNull`
column without a default to the `projects` insert above (for example `kind: "initial_build"` if it has no default).

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @fynix/db exec vitest run --config vitest.integration.config.ts src/directory-listings.integration.test.ts`
Expected: FAIL, cannot resolve `./queries/directory-listings`.

- [ ] **Step 3: Implement**

```ts
// packages/db/src/queries/directory-listings.ts
import { and, eq, exists } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { businesses, businessProfiles, directoryListings, listingContent, projects } from "../schema";
import { currentBusinessId, hasPostgresCode, UNIQUE_VIOLATION } from "./tenant";

type Runner = Database | ScopedTransaction;

/*
 * the local directory listings. Staff write the placement (saveListingPlacement, staff connection); the customer reads
 * both rows and updates only the content (findOwnListing / updateOwnListingContent, tenant scope, business id from
 * currentBusinessId(tx)); the feed route reads every live listing (listLiveDirectoryListings, staff connection).
 */

export interface ListingPlacementInput {
  readonly categorySlug: string;
  readonly stateCode: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly slug: string;
  readonly lat: number;
  readonly lon: number;
  readonly pinLabel: string;
  readonly whatsappPhone: string | null;
  readonly bookingUrl: string | null;
  readonly replacesSourcePath: string | null;
}

export interface ListingPlacement extends ListingPlacementInput {
  readonly businessId: string;
  readonly previousPaths: readonly string[];
}

export interface ListingButtonsRow {
  readonly call: boolean;
  readonly whatsapp: boolean;
  readonly book: boolean;
  readonly directions: boolean;
  readonly website: boolean;
}

export interface ListingContentRow {
  readonly about: string | null;
  readonly tags: readonly string[];
  readonly buttons: ListingButtonsRow;
  readonly visible: boolean;
}

export interface ListingContentPatch {
  readonly about?: string | null;
  readonly tags?: readonly string[];
  readonly buttons?: ListingButtonsRow;
  readonly visible?: boolean;
}

/** Another business already has this exact address (directory_listings_address_key). */
export class ListingAddressTakenError extends Error {
  constructor(path: string) {
    super(`Another business already has the listing address ${path}.`);
    this.name = "ListingAddressTakenError";
  }
}

/** The listing's address on the local directory: /in/<category>/<state>/<city>/<area>/<slug>. */
export function listingPath(placement: Pick<ListingPlacementInput, "categorySlug" | "stateCode" | "citySlug" | "areaSlug" | "slug">): string {
  return `/in/${placement.categorySlug}/${placement.stateCode}/${placement.citySlug}/${placement.areaSlug}/${placement.slug}`;
}

const PLACEMENT_COLUMNS = {
  businessId: directoryListings.businessId,
  categorySlug: directoryListings.categorySlug,
  stateCode: directoryListings.stateCode,
  citySlug: directoryListings.citySlug,
  areaSlug: directoryListings.areaSlug,
  slug: directoryListings.slug,
  lat: directoryListings.lat,
  lon: directoryListings.lon,
  pinLabel: directoryListings.pinLabel,
  whatsappPhone: directoryListings.whatsappPhone,
  bookingUrl: directoryListings.bookingUrl,
  replacesSourcePath: directoryListings.replacesSourcePath,
  previousPaths: directoryListings.previousPaths,
} as const;

const CONTENT_COLUMNS = {
  about: listingContent.about,
  tags: listingContent.tags,
  showCall: listingContent.showCall,
  showWhatsapp: listingContent.showWhatsapp,
  showBook: listingContent.showBook,
  showDirections: listingContent.showDirections,
  showWebsite: listingContent.showWebsite,
  visible: listingContent.visible,
} as const;

type ContentSelect = {
  readonly about: string | null;
  readonly tags: string[];
  readonly showCall: boolean;
  readonly showWhatsapp: boolean;
  readonly showBook: boolean;
  readonly showDirections: boolean;
  readonly showWebsite: boolean;
  readonly visible: boolean;
};

function toContent(row: ContentSelect): ListingContentRow {
  return {
    about: row.about,
    tags: row.tags,
    buttons: {
      call: row.showCall,
      whatsapp: row.showWhatsapp,
      book: row.showBook,
      directions: row.showDirections,
      website: row.showWebsite,
    },
    visible: row.visible,
  };
}

export async function findListingPlacement(db: Runner, businessId: string): Promise<ListingPlacement | null> {
  const rows = await db.select(PLACEMENT_COLUMNS).from(directoryListings).where(eq(directoryListings.businessId, businessId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Staff create or change a business's placement. When the address changes, the old one is appended to
 * previous_paths (and the new one removed from it, for a move back), so the directory can redirect every address the
 * listing ever had. The empty content row is created the first time, so the client has something to edit.
 */
export async function saveListingPlacement(
  db: Database,
  businessId: string,
  input: ListingPlacementInput,
  now: Date,
): Promise<ListingPlacement> {
  const newPath = listingPath(input);
  try {
    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select(PLACEMENT_COLUMNS)
        .from(directoryListings)
        .where(eq(directoryListings.businessId, businessId))
        .for("update");
      const existing = existingRows[0];
      const oldPath = existing === undefined ? null : listingPath(existing);
      const kept = (existing?.previousPaths ?? []).filter((path) => path !== newPath);
      const previousPaths = oldPath !== null && oldPath !== newPath && !kept.includes(oldPath) ? [...kept, oldPath] : kept;

      const values = { ...input, previousPaths };
      const saved = await tx
        .insert(directoryListings)
        .values({ businessId, ...values })
        .onConflictDoUpdate({ target: directoryListings.businessId, set: { ...values, updatedAt: now } })
        .returning(PLACEMENT_COLUMNS);
      await tx.insert(listingContent).values({ businessId }).onConflictDoNothing({ target: listingContent.businessId });

      const row = saved[0];
      if (row === undefined) throw new Error("Listing placement upsert returned no row");
      return row;
    });
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) throw new ListingAddressTakenError(newPath);
    throw error;
  }
}

export interface OwnListing {
  readonly placement: ListingPlacement;
  readonly content: ListingContentRow;
}

/** The signed-in business's listing, or null when staff have not created one. */
export async function findOwnListing(tx: ScopedTransaction): Promise<OwnListing | null> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({ placement: PLACEMENT_COLUMNS, content: CONTENT_COLUMNS })
    .from(directoryListings)
    .innerJoin(listingContent, eq(listingContent.businessId, directoryListings.businessId))
    .where(eq(directoryListings.businessId, businessId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { placement: row.placement, content: toContent(row.content) };
}

/** Writes the fields present in `patch`. False when the business has no listing row to update. */
export async function updateOwnListingContent(tx: ScopedTransaction, patch: ListingContentPatch, now: Date): Promise<boolean> {
  const businessId = await currentBusinessId(tx);
  const set: Partial<typeof listingContent.$inferInsert> = { updatedAt: now };
  if (patch.about !== undefined) set.about = patch.about;
  if (patch.tags !== undefined) set.tags = [...patch.tags];
  if (patch.visible !== undefined) set.visible = patch.visible;
  if (patch.buttons !== undefined) {
    set.showCall = patch.buttons.call;
    set.showWhatsapp = patch.buttons.whatsapp;
    set.showBook = patch.buttons.book;
    set.showDirections = patch.buttons.directions;
    set.showWebsite = patch.buttons.website;
  }
  const rows = await tx
    .update(listingContent)
    .set(set)
    .where(eq(listingContent.businessId, businessId))
    .returning({ businessId: listingContent.businessId });
  return rows.length > 0;
}

/** A website that has launched stays launched: a later redesign project in progress does not take the listing down. */
export async function hasLiveProject(db: Runner, businessId: string): Promise<boolean> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.businessId, businessId), eq(projects.status, "live")))
    .limit(1);
  return rows.length > 0;
}

export interface DirectoryListingRow {
  readonly businessId: string;
  readonly placement: ListingPlacement;
  readonly content: ListingContentRow;
  readonly name: string;
  readonly streetAddress: string;
  readonly phone: string | null;
  readonly websiteUrl: string | null;
}

function streetAddressOf(parts: {
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
}): string {
  const cityLine = [parts.city, parts.postalCode].filter((part): part is string => part !== null && part !== "").join(" ");
  return [parts.addressLine1, parts.addressLine2, cityLine].filter((part): part is string => part !== null && part !== "").join(", ");
}

/** Every listing whose website has launched, for the public feed. Staff connection only. */
export async function listLiveDirectoryListings(db: Database): Promise<DirectoryListingRow[]> {
  const rows = await db
    .select({
      placement: PLACEMENT_COLUMNS,
      content: CONTENT_COLUMNS,
      name: businessProfiles.displayName,
      phone: businessProfiles.phone,
      addressLine1: businessProfiles.addressLine1,
      addressLine2: businessProfiles.addressLine2,
      city: businessProfiles.city,
      postalCode: businessProfiles.postalCode,
      websiteUrl: businesses.websiteUrl,
    })
    .from(directoryListings)
    .innerJoin(listingContent, eq(listingContent.businessId, directoryListings.businessId))
    .innerJoin(businessProfiles, eq(businessProfiles.businessId, directoryListings.businessId))
    .innerJoin(businesses, eq(businesses.id, directoryListings.businessId))
    .where(
      exists(
        db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.businessId, directoryListings.businessId), eq(projects.status, "live"))),
      ),
    );
  return rows.map((row) => ({
    businessId: row.placement.businessId,
    placement: row.placement,
    content: toContent(row.content),
    name: row.name,
    streetAddress: streetAddressOf(row),
    phone: row.phone,
    websiteUrl: row.websiteUrl,
  }));
}
```

Add to `packages/db/src/index.ts`, next to the business-facts export block:

```ts
export {
  findListingPlacement,
  findOwnListing,
  hasLiveProject,
  listingPath,
  ListingAddressTakenError,
  listLiveDirectoryListings,
  saveListingPlacement,
  updateOwnListingContent,
  type DirectoryListingRow,
  type ListingButtonsRow,
  type ListingContentPatch,
  type ListingContentRow,
  type ListingPlacement,
  type ListingPlacementInput,
  type OwnListing,
} from "./queries/directory-listings";
```

If `hasPostgresCode`/`UNIQUE_VIOLATION` are not exported from `./tenant` under those names, use the names
`packages/db/src/queries/tenant.ts` exports (it defines both).

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @fynix/db exec vitest run --config vitest.integration.config.ts src/directory-listings.integration.test.ts`
Expected: PASS (10 tests). If "reads its own listing" fails with an empty result, check that
`businessMembers` gives the app role visibility; the RLS policies in 0053 only check `app_current_business_id()`.

- [ ] **Step 5: Typecheck the package**

Run: `pnpm --filter @fynix/db typecheck`
Expected: no errors.

---

### Task 6: Staff placement form parser

**Files:**
- Create: `packages/shared/src/lib/directory/placement-form.ts`
- Test: `packages/shared/src/lib/directory/placement-form.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/lib/directory/placement-form.test.ts
import { describe, expect, it } from "vitest";
import { DIRECTORY_AREAS } from "./places";
import { parsePlacementForm } from "./placement-form";

const AREA = DIRECTORY_AREAS.find((area) => area.city === "thane");
if (AREA === undefined) throw new Error("no Thane area in places.json");

function form(overrides: Readonly<Record<string, string>> = {}): FormData {
  const values: Record<string, string> = {
    category: "dentists",
    city: "thane",
    area: AREA.slug,
    slug: "smile-dental-clinic",
    lat: "19.19",
    lon: "72.97",
    pinLabel: "Gokhale Road",
    whatsappPhone: "",
    bookingUrl: "",
    replacesSourcePath: "",
    ...overrides,
  };
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("parsePlacementForm", () => {
  it("accepts a complete form", () => {
    expect(parsePlacementForm(form())).toEqual({
      success: true,
      data: {
        categorySlug: "dentists",
        stateCode: "mh",
        citySlug: "thane",
        areaSlug: AREA.slug,
        slug: "smile-dental-clinic",
        lat: 19.19,
        lon: 72.97,
        pinLabel: "Gokhale Road",
        whatsappPhone: null,
        bookingUrl: null,
        replacesSourcePath: null,
      },
    });
  });

  it("normalises optional fields", () => {
    const result = parsePlacementForm(
      form({
        whatsappPhone: "+91 90000 00001",
        bookingUrl: "https://smiledental.in/book",
        replacesSourcePath: "https://fynix.digital/in/dentists/mh/thane/naupada/smile-dental?x=1",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        whatsappPhone: "+919000000001",
        bookingUrl: "https://smiledental.in/book",
        replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
      },
    });
  });

  it.each([
    [{ category: "plumbers-that-dont-exist" }, "category"],
    [{ city: "mumbai" }, "city"],
    [{ area: "not-an-area" }, "area"],
    [{ slug: "Smile Dental" }, "slug"],
    [{ lat: "12.9" }, "lat"],
    [{ lon: "abc" }, "lon"],
    [{ pinLabel: "" }, "pinLabel"],
    [{ whatsappPhone: "12345" }, "whatsappPhone"],
    [{ bookingUrl: "http://insecure.example" }, "bookingUrl"],
    [{ replacesSourcePath: "/blog/something" }, "replacesSourcePath"],
  ])("refuses %o in field %s", (overrides, field) => {
    expect(parsePlacementForm(form(overrides))).toMatchObject({ success: false, field });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/placement-form.test.ts`
Expected: FAIL, cannot resolve `./placement-form`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/lib/directory/placement-form.ts
/** Parses the staff Listing form on the admin client page. */
import type { ListingPlacementInput } from "@fynix/db";
import { textField, type FormParseResult } from "../form-result";
import { cleanLine } from "../validation/text";
import { DIRECTORY_STATE, isDirectoryArea, isDirectoryCategory, isDirectoryCity } from "./places";

/** A generous box around Thane district. A pin outside it is a pasting mistake (lat/lon swapped, another city). */
const DISTRICT_BOUNDS = { south: 18.85, north: 19.95, west: 72.7, east: 73.8 } as const;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const E164 = /^\+[0-9]{8,15}$/;
const SOURCE_PATH = /^\/in\/[a-z0-9/-]+$/;

export const PLACEMENT_FIELDS = [
  "category",
  "city",
  "area",
  "slug",
  "lat",
  "lon",
  "pinLabel",
  "whatsappPhone",
  "bookingUrl",
  "replacesSourcePath",
] as const;
export type PlacementField = (typeof PLACEMENT_FIELDS)[number];

export const PLACEMENT_FIELD_MESSAGES: Readonly<Record<PlacementField, string>> = {
  category: "Choose a category from the list.",
  city: "Choose a city from the list.",
  area: "Choose an area in that city.",
  slug: "Use lowercase letters, digits and single hyphens, up to 80 characters.",
  lat: "Paste a latitude inside Thane district, like 19.19.",
  lon: "Paste a longitude inside Thane district, like 72.97.",
  pinLabel: "Describe the pin in up to 120 characters.",
  whatsappPhone: "Use a full number with country code, like +91 90000 00000, or leave it empty.",
  bookingUrl: "Use an https:// address, or leave it empty.",
  replacesSourcePath: "Paste the unconfirmed listing's /in/... address, or leave it empty.",
};

export function isPlacementField(value: string): value is PlacementField {
  return (PLACEMENT_FIELDS as readonly string[]).includes(value);
}

function problem(field: PlacementField): { readonly success: false; readonly field: PlacementField; readonly message: string } {
  return { success: false, field, message: PLACEMENT_FIELD_MESSAGES[field] };
}

function coordinate(raw: string, min: number, max: number): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Accepts a bare path or a full fynix.digital URL; keeps only the path. */
function sourcePath(raw: string): string | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      return undefined;
    }
  }
  path = path.replace(/\/+$/, "");
  return SOURCE_PATH.test(path) ? path : undefined;
}

export function parsePlacementForm(formData: FormData): FormParseResult<ListingPlacementInput> {
  const categorySlug = textField(formData, "category").trim();
  if (!isDirectoryCategory(categorySlug)) return problem("category");

  const citySlug = textField(formData, "city").trim();
  if (!isDirectoryCity(citySlug)) return problem("city");

  const areaSlug = textField(formData, "area").trim();
  if (!isDirectoryArea(citySlug, areaSlug)) return problem("area");

  const slug = textField(formData, "slug").trim();
  if (!SLUG.test(slug) || slug.length > 80) return problem("slug");

  const lat = coordinate(textField(formData, "lat"), DISTRICT_BOUNDS.south, DISTRICT_BOUNDS.north);
  if (lat === null) return problem("lat");
  const lon = coordinate(textField(formData, "lon"), DISTRICT_BOUNDS.west, DISTRICT_BOUNDS.east);
  if (lon === null) return problem("lon");

  const pinLabel = cleanLine(textField(formData, "pinLabel"));
  if (pinLabel.length < 1 || pinLabel.length > 120) return problem("pinLabel");

  const rawPhone = textField(formData, "whatsappPhone").replace(/[\s-]/g, "");
  if (rawPhone !== "" && !E164.test(rawPhone)) return problem("whatsappPhone");

  const rawBooking = textField(formData, "bookingUrl").trim();
  if (rawBooking !== "") {
    try {
      if (new URL(rawBooking).protocol !== "https:") return problem("bookingUrl");
    } catch {
      return problem("bookingUrl");
    }
  }

  const replacesSourcePath = sourcePath(textField(formData, "replacesSourcePath"));
  if (replacesSourcePath === undefined) return problem("replacesSourcePath");

  return {
    success: true,
    data: {
      categorySlug,
      stateCode: DIRECTORY_STATE.code,
      citySlug,
      areaSlug,
      slug,
      lat,
      lon,
      pinLabel,
      whatsappPhone: rawPhone === "" ? null : rawPhone,
      bookingUrl: rawBooking === "" ? null : rawBooking,
      replacesSourcePath,
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/placement-form.test.ts`
Expected: PASS (12 tests).

---

### Task 7: Stage

**Files:**
- Create: `packages/shared/src/lib/directory/stage.ts`
- Test: `packages/shared/src/lib/directory/stage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/lib/directory/stage.test.ts
import { describe, expect, it } from "vitest";
import { LISTING_STAGE_LABELS, listingStage } from "./stage";

describe("listingStage", () => {
  it("is building until the website launches, whatever else is true", () => {
    expect(listingStage({ hasLiveProject: false, billingStatus: "paid", visible: true })).toBe("building");
    expect(listingStage({ hasLiveProject: false, billingStatus: "lapsed", visible: false })).toBe("building");
  });

  it("is paused when payment has lapsed, before hidden", () => {
    expect(listingStage({ hasLiveProject: true, billingStatus: "lapsed", visible: false })).toBe("paused");
    expect(listingStage({ hasLiveProject: true, billingStatus: "unpaid", visible: true })).toBe("paused");
  });

  it("is hidden or live for a paid, launched business", () => {
    expect(listingStage({ hasLiveProject: true, billingStatus: "paid", visible: false })).toBe("hidden");
    expect(listingStage({ hasLiveProject: true, billingStatus: "paid", visible: true })).toBe("live");
  });

  it("labels every stage", () => {
    expect(LISTING_STAGE_LABELS).toEqual({
      building: "Goes live with your website",
      live: "Live on the local directory",
      hidden: "Hidden",
      paused: "Paused",
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/stage.test.ts`
Expected: FAIL, cannot resolve `./stage`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/lib/directory/stage.ts
import type { CustomerBillingStatus } from "../billing/status";

export type ListingStage = "building" | "live" | "hidden" | "paused";

export const LISTING_STAGE_LABELS: Readonly<Record<ListingStage, string>> = {
  building: "Goes live with your website",
  live: "Live on the local directory",
  hidden: "Hidden",
  paused: "Paused",
};

/**
 * Where a listing is in its life, in the order the checks matter: nothing shows before the website launches; a
 * lapsed payment pauses it whatever the switch says; then the client's own Show in directory switch.
 */
export function listingStage(input: {
  readonly hasLiveProject: boolean;
  readonly billingStatus: CustomerBillingStatus;
  readonly visible: boolean;
}): ListingStage {
  if (!input.hasLiveProject) return "building";
  if (input.billingStatus !== "paid") return "paused";
  return input.visible ? "live" : "hidden";
}
```

If `CustomerBillingStatus` is not exported from `../billing/status`, export it there (it is the type of
`CustomerBilling.status`: `"paid" | "lapsed" | "unpaid"`).

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/stage.test.ts`
Expected: PASS (4 tests).

---

### Task 8: Feed contract and shaping

**Files:**
- Create: `packages/shared/src/lib/directory/feed-contract.ts`
- Create: `packages/shared/src/lib/directory/feed.ts`
- Test: `packages/shared/src/lib/directory/feed.test.ts`

- [ ] **Step 1: Write the contract** (no test of its own; it is types)

```ts
// packages/shared/src/lib/directory/feed-contract.ts
/**
 * GET /api/directory/listings — what the platform tells the /in directory about Featured listings.
 *
 * This file is copied verbatim into the website repo (like lib/leads-api.ts). The contract is additive-only: never
 * rename or remove a field; add optional ones and bump nothing. `version` changes only for a breaking change, which
 * this rule exists to avoid.
 */
export const DIRECTORY_FEED_VERSION = 1;

export interface DirectoryFeedAddress {
  readonly category: string;
  readonly state: string;
  readonly city: string;
  readonly area: string;
  readonly slug: string;
}

export interface DirectoryFeedHours {
  /** 0 = Monday … 6 = Sunday, as business_hours stores it. */
  readonly day: number;
  /** "HH:MM", 24-hour, in the business's own time. An all-day opening is "00:00"–"24:00". */
  readonly opens: string;
  readonly closes: string;
}

export interface DirectoryFeedButtons {
  readonly call?: string;
  readonly whatsapp?: string;
  readonly book?: string;
  readonly directions?: string;
  readonly website?: string;
}

export interface DirectoryFeedListing {
  readonly address: DirectoryFeedAddress;
  /** Full /in paths this listing used to have; redirect each to the current address. */
  readonly previousAddresses: readonly string[];
  /** The unconfirmed /in path this listing replaces; hide that row everywhere. */
  readonly replacesSourcePath: string | null;
  /** "basic" while payment has lapsed: show name, category, area and address only. */
  readonly tier: "featured" | "basic";
  readonly name: string;
  readonly streetAddress: string;
  readonly lat: number;
  readonly lon: number;
  /** Featured only from here on. */
  readonly about?: string;
  readonly tags?: readonly string[];
  readonly timeZone?: string;
  readonly hours?: readonly DirectoryFeedHours[];
  readonly closures?: readonly { readonly startsOn: string; readonly endsOn: string }[];
  readonly announcement?: { readonly message: string; readonly endsOn: string } | null;
  readonly buttons?: DirectoryFeedButtons;
}

export interface DirectoryFeed {
  readonly version: typeof DIRECTORY_FEED_VERSION;
  readonly generatedAt: string;
  readonly listings: readonly DirectoryFeedListing[];
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/shared/src/lib/directory/feed.test.ts
import type { DirectoryListingRow, SiteFacts } from "@fynix/db";
import { describe, expect, it } from "vitest";
import { buildFeedListing } from "./feed";

const ROW: DirectoryListingRow = {
  businessId: "biz-1",
  placement: {
    businessId: "biz-1",
    categorySlug: "dentists",
    stateCode: "mh",
    citySlug: "thane",
    areaSlug: "naupada",
    slug: "smile-dental-clinic",
    lat: 19.19,
    lon: 72.97,
    pinLabel: "Gokhale Road",
    whatsappPhone: null,
    bookingUrl: "https://smiledental.in/book",
    replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
    previousPaths: ["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"],
  },
  content: {
    about: "Gentle family dentistry.",
    tags: ["Braces"],
    buttons: { call: true, whatsapp: true, book: true, directions: true, website: true },
    visible: true,
  },
  name: "Smile Dental Clinic",
  streetAddress: "12 Gokhale Road, Thane 400602",
  phone: "+919000000000",
  websiteUrl: "https://smiledental.in",
};

const FACTS: SiteFacts = {
  timeZone: "Asia/Kolkata",
  hours: [
    { id: "h1", dayOfWeek: 0, opensAt: "10:00:00", closesAt: "13:30:00", closed: false, openAllDay: false },
    { id: "h2", dayOfWeek: 0, opensAt: "17:00:00", closesAt: "21:00:00", closed: false, openAllDay: false },
    { id: "h3", dayOfWeek: 5, opensAt: null, closesAt: null, closed: false, openAllDay: true },
    { id: "h4", dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
  ],
  closures: [
    { id: "c1", startsOn: "2026-09-01", endsOn: "2026-09-02", note: null },
    { id: "c2", startsOn: "2026-10-02", endsOn: "2026-10-02", note: "Holiday" },
  ],
  announcement: { message: "Closed on 2 Oct", startsOn: "2026-09-28", endsOn: "2026-10-02" },
};

const TODAY = "2026-09-29";

describe("buildFeedListing", () => {
  it("shapes a featured listing", () => {
    expect(buildFeedListing({ row: ROW, facts: FACTS, paid: true, bookingEnabled: true, today: TODAY })).toEqual({
      address: { category: "dentists", state: "mh", city: "thane", area: "naupada", slug: "smile-dental-clinic" },
      previousAddresses: ["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"],
      replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
      tier: "featured",
      name: "Smile Dental Clinic",
      streetAddress: "12 Gokhale Road, Thane 400602",
      lat: 19.19,
      lon: 72.97,
      about: "Gentle family dentistry.",
      tags: ["Braces"],
      timeZone: "Asia/Kolkata",
      hours: [
        { day: 0, opens: "10:00", closes: "13:30" },
        { day: 0, opens: "17:00", closes: "21:00" },
        { day: 5, opens: "00:00", closes: "24:00" },
      ],
      closures: [{ startsOn: "2026-10-02", endsOn: "2026-10-02" }],
      announcement: { message: "Closed on 2 Oct", endsOn: "2026-10-02" },
      buttons: {
        call: "tel:+919000000000",
        whatsapp: "https://wa.me/919000000000",
        book: "https://smiledental.in/book",
        directions: "https://www.google.com/maps/dir/?api=1&destination=19.19,72.97",
        website: "https://smiledental.in",
      },
    });
  });

  it("drops buttons that are off or have nowhere to go", () => {
    const row: DirectoryListingRow = {
      ...ROW,
      content: { ...ROW.content, buttons: { call: false, whatsapp: true, book: true, directions: true, website: true } },
      phone: null,
      websiteUrl: null,
      placement: { ...ROW.placement, whatsappPhone: "+919000000001" },
    };
    const listing = buildFeedListing({ row, facts: FACTS, paid: true, bookingEnabled: false, today: TODAY });
    expect(listing?.buttons).toEqual({
      whatsapp: "https://wa.me/919000000001",
      directions: "https://www.google.com/maps/dir/?api=1&destination=19.19,72.97",
    });
  });

  it("hides an announcement that is not showing today", () => {
    const facts: SiteFacts = { ...FACTS, announcement: { message: "Later", startsOn: "2026-10-05", endsOn: "2026-10-06" } };
    expect(buildFeedListing({ row: ROW, facts, paid: true, bookingEnabled: true, today: TODAY })?.announcement).toBeNull();
  });

  it("is basic when payment has lapsed", () => {
    expect(buildFeedListing({ row: ROW, facts: FACTS, paid: false, bookingEnabled: true, today: TODAY })).toEqual({
      address: { category: "dentists", state: "mh", city: "thane", area: "naupada", slug: "smile-dental-clinic" },
      previousAddresses: ["/in/dentists/mh/thane/panch-pakhadi/smile-dental-clinic"],
      replacesSourcePath: "/in/dentists/mh/thane/naupada/smile-dental",
      tier: "basic",
      name: "Smile Dental Clinic",
      streetAddress: "12 Gokhale Road, Thane 400602",
      lat: 19.19,
      lon: 72.97,
    });
  });

  it("leaves a hidden listing out", () => {
    const row: DirectoryListingRow = { ...ROW, content: { ...ROW.content, visible: false } };
    expect(buildFeedListing({ row, facts: FACTS, paid: true, bookingEnabled: true, today: TODAY })).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/feed.test.ts`
Expected: FAIL, cannot resolve `./feed`.

- [ ] **Step 4: Implement**

```ts
// packages/shared/src/lib/directory/feed.ts
import type { DirectoryListingRow, SiteFacts } from "@fynix/db";
import type { DirectoryFeedButtons, DirectoryFeedHours, DirectoryFeedListing } from "./feed-contract";

export interface FeedListingInput {
  readonly row: DirectoryListingRow;
  readonly facts: SiteFacts;
  /** The subscription gives access right now. */
  readonly paid: boolean;
  /** The Appointments module is on, so Book may show. */
  readonly bookingEnabled: boolean;
  /** Today in the business's own time zone, YYYY-MM-DD. */
  readonly today: string;
}

function hoursOf(facts: SiteFacts): DirectoryFeedHours[] {
  const hours: DirectoryFeedHours[] = [];
  for (const row of facts.hours) {
    if (row.closed) continue;
    if (row.openAllDay) {
      hours.push({ day: row.dayOfWeek, opens: "00:00", closes: "24:00" });
      continue;
    }
    if (row.opensAt === null || row.closesAt === null) continue;
    hours.push({ day: row.dayOfWeek, opens: row.opensAt.slice(0, 5), closes: row.closesAt.slice(0, 5) });
  }
  return hours;
}

function buttonsOf(row: DirectoryListingRow, bookingEnabled: boolean): DirectoryFeedButtons {
  const { buttons } = row.content;
  const whatsappNumber = row.placement.whatsappPhone ?? row.phone;
  return {
    ...(buttons.call && row.phone !== null ? { call: `tel:${row.phone}` } : {}),
    ...(buttons.whatsapp && whatsappNumber !== null ? { whatsapp: `https://wa.me/${whatsappNumber.replace(/^\+/, "")}` } : {}),
    ...(buttons.book && bookingEnabled && row.placement.bookingUrl !== null ? { book: row.placement.bookingUrl } : {}),
    ...(buttons.directions
      ? { directions: `https://www.google.com/maps/dir/?api=1&destination=${row.placement.lat},${row.placement.lon}` }
      : {}),
    ...(buttons.website && row.websiteUrl !== null ? { website: row.websiteUrl } : {}),
  };
}

/**
 * One listing as the directory receives it, or null when the client has hidden it. A lapsed payment keeps the
 * listing at its address as "basic" (spec: never 404, restored on payment); only featured listings carry the
 * client's text, hours and buttons.
 */
export function buildFeedListing({ row, facts, paid, bookingEnabled, today }: FeedListingInput): DirectoryFeedListing | null {
  if (!row.content.visible) return null;
  const { placement } = row;
  const base: DirectoryFeedListing = {
    address: {
      category: placement.categorySlug,
      state: placement.stateCode,
      city: placement.citySlug,
      area: placement.areaSlug,
      slug: placement.slug,
    },
    previousAddresses: placement.previousPaths,
    replacesSourcePath: placement.replacesSourcePath,
    tier: paid ? "featured" : "basic",
    name: row.name,
    streetAddress: row.streetAddress,
    lat: placement.lat,
    lon: placement.lon,
  };
  if (!paid) return base;

  const announcement =
    facts.announcement !== null && facts.announcement.startsOn <= today && today <= facts.announcement.endsOn
      ? { message: facts.announcement.message, endsOn: facts.announcement.endsOn }
      : null;

  return {
    ...base,
    ...(row.content.about === null ? {} : { about: row.content.about }),
    tags: row.content.tags,
    ...(facts.timeZone === null ? {} : { timeZone: facts.timeZone }),
    hours: hoursOf(facts),
    closures: facts.closures
      .filter((closure) => closure.endsOn >= today)
      .map((closure) => ({ startsOn: closure.startsOn, endsOn: closure.endsOn })),
    announcement,
    buttons: buttonsOf(row, bookingEnabled),
  };
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/feed.test.ts`
Expected: PASS (5 tests). `SiteFacts` must be exported from `@fynix/db` (it is, beside `readSiteFacts`).

---

### Task 9: Feed reader and public route

**Files:**
- Create: `apps/platform/lib/server/directory-feed.ts`
- Create: `apps/platform/app/api/directory/listings/route.ts`
- Test: `apps/platform/app/api/directory/listings/route.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
// apps/platform/app/api/directory/listings/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDirectoryFeed } from "@/lib/server/directory-feed";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("@/lib/server/directory-feed", () => ({ readDirectoryFeed: vi.fn() }));

const mockedRead = vi.mocked(readDirectoryFeed);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/directory/listings", () => {
  it("returns the feed with a one-minute shared cache", async () => {
    mockedRead.mockResolvedValue({ version: 1, generatedAt: "2026-09-29T10:00:00.000Z", listings: [] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60, s-maxage=60, stale-while-revalidate=300");
    expect(await response.json()).toEqual({ version: 1, generatedAt: "2026-09-29T10:00:00.000Z", listings: [] });
  });

  it("answers 503 and no-store when the read fails", async () => {
    mockedRead.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @fynix/platform exec vitest run app/api/directory/listings/route.test.ts`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement the reader**

```ts
// apps/platform/lib/server/directory-feed.ts
import "server-only";
import { hasBillingAccess } from "@fynix/billing";
import { findBillingState, isModuleEnabled, listLiveDirectoryListings, readSiteFacts, type Database } from "@fynix/db";
import { localDateIn } from "@fynix/shared/lib/calendar/local-date";
import { buildFeedListing } from "@fynix/shared/lib/directory/feed";
import { DIRECTORY_FEED_VERSION, type DirectoryFeed, type DirectoryFeedListing } from "@fynix/shared/lib/directory/feed-contract";

/** Listings without their own time zone are read in India's, the only market the directory serves today. */
const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/**
 * Every live listing, shaped for the directory. One query for the listings, then three small reads per listing:
 * fine for the number of paying clients the directory has; revisit with a joined query past a few hundred.
 */
export async function readDirectoryFeed(db: Database, now: Date): Promise<DirectoryFeed> {
  const rows = await listLiveDirectoryListings(db);
  const listings = await Promise.all(
    rows.map(async (row): Promise<DirectoryFeedListing | null> => {
      const [billing, facts, bookingEnabled] = await Promise.all([
        findBillingState(db, row.businessId),
        readSiteFacts(db, row.businessId),
        isModuleEnabled(db, row.businessId, "appointments"),
      ]);
      const paid = billing !== null && hasBillingAccess(billing.subscription, now);
      const today = localDateIn(facts.timeZone ?? DEFAULT_TIME_ZONE, now);
      return buildFeedListing({ row, facts, paid, bookingEnabled, today });
    }),
  );
  return {
    version: DIRECTORY_FEED_VERSION,
    generatedAt: now.toISOString(),
    listings: listings.filter((listing): listing is DirectoryFeedListing => listing !== null),
  };
}
```

- [ ] **Step 4: Implement the route**

```ts
// apps/platform/app/api/directory/listings/route.ts
import "server-only";
import { getStaffDb } from "@/lib/server/db";
import { readDirectoryFeed } from "@/lib/server/directory-feed";
import { errorLogInfo } from "@/lib/server/error-log";

/** Edits show on the directory within about a minute. */
const CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

/**
 * `GET /api/directory/listings` — every live Featured listing, for the /in directory on the marketing website.
 * Public: everything in it is shown publicly on the directory anyway (the phone only when the client turned Call or
 * WhatsApp on). Hidden listings are left out entirely.
 */
export async function GET(): Promise<Response> {
  try {
    const feed = await readDirectoryFeed(getStaffDb(), new Date());
    return Response.json(feed, { status: 200, headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    console.error("[fynix:directory] GET /api/directory/listings failed", errorLogInfo(error));
    return Response.json(
      { error: "Listings are unavailable right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @fynix/platform exec vitest run app/api/directory/listings/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Check the route is reachable through the app host's proxy**

Run (dev server on 3001 running): `curl -s http://app.localhost:3001/api/directory/listings`
Expected: `{"version":1,"generatedAt":"…","listings":[]}`. If it 404s, `/api/directory` is not on the proxy's
allow-list: open `apps/platform/proxy.ts`, find where `/api/pricing` is allowed, and add `/api/directory` beside it.

---

### Task 10: Customer actions

**Files:**
- Create: `apps/platform/app/app-host/(protected)/listing/errors.ts`
- Create: `apps/platform/app/app-host/(protected)/listing/actions.ts`
- Test: `apps/platform/app/app-host/(protected)/listing/actions.test.ts`

- [ ] **Step 1: Write the errors module**

```ts
// apps/platform/app/app-host/(protected)/listing/errors.ts
import { panelFormErrorState, type PanelFormState } from "@/lib/panel-form-state";

export const LISTING_MISSING_MESSAGE = "Your listing isn't set up yet. We'll let you know when it is.";

/** The business has no listing row: staff have not created it, so there is nothing to save into. */
export function listingMissingState(formData: FormData): PanelFormState {
  return panelFormErrorState({ message: LISTING_MISSING_MESSAGE, field: null }, formData);
}
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/platform/app/app-host/(protected)/listing/actions.test.ts
import type { Database, ScopedTransaction } from "@fynix/db";
import { updateOwnListingContent, withTenantScope } from "@fynix/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { paidCustomerOrNull, PAID_PLAN_REQUIRED_MESSAGE } from "@/lib/server/blog-access";
import { getAppDb } from "@/lib/server/db";
import { saveListingAboutAction, saveListingButtonsAction, saveListingTagsAction, setListingVisibleAction } from "./actions";
import { LISTING_MISSING_MESSAGE } from "./errors";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/server/blog-access", () => ({
  paidCustomerOrNull: vi.fn(),
  PAID_PLAN_REQUIRED_MESSAGE: "This opens once your plan is paid. You can pay from Billing.",
}));
vi.mock("@fynix/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fynix/db")>();
  return {
    hasPostgresCode: actual.hasPostgresCode,
    CHECK_VIOLATION: actual.CHECK_VIOLATION,
    updateOwnListingContent: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;
const IDLE = { status: "idle" } as const;

function granted() {
  return {
    user: { id: "user-1", email: "ana@example.com", name: "Ana Diaz" },
    tenant: { userId: "user-1", businessId: "0192f3c4-1111-7000-8000-000000000001", businessName: "Smile", role: "owner" },
    billing: { hasAccess: true },
  } as never;
}

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(paidCustomerOrNull).mockResolvedValue(granted());
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(updateOwnListingContent).mockResolvedValue(true);
});

describe("listing actions", () => {
  it("refuses an unpaid business before touching the database", async () => {
    vi.mocked(paidCustomerOrNull).mockResolvedValue(null);
    const state = await saveListingAboutAction(IDLE, form([["about", "Hello"]]));
    expect(state).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("returns the field error without writing", async () => {
    const state = await saveListingAboutAction(IDLE, form([["about", "Call 9820012345"]]));
    expect(state).toMatchObject({ status: "error", field: "about" });
    expect(updateOwnListingContent).not.toHaveBeenCalled();
  });

  it("saves about, then revalidates the page", async () => {
    const state = await saveListingAboutAction(IDLE, form([["about", "Gentle family dentistry."]]));
    expect(state).toEqual({ status: "saved" });
    expect(updateOwnListingContent).toHaveBeenCalledWith(appTx, { about: "Gentle family dentistry." }, expect.any(Date));
    expect(revalidatePath).toHaveBeenCalledWith("/listing");
  });

  it("saves tags, buttons and visibility", async () => {
    await saveListingTagsAction(IDLE, form([["tag", "Braces"], ["tag", "Root canal"]]));
    expect(updateOwnListingContent).toHaveBeenLastCalledWith(appTx, { tags: ["Braces", "Root canal"] }, expect.any(Date));

    await saveListingButtonsAction(IDLE, form([["call", "on"]]));
    expect(updateOwnListingContent).toHaveBeenLastCalledWith(
      appTx,
      { buttons: { call: true, whatsapp: false, book: false, directions: false, website: false } },
      expect.any(Date),
    );

    await setListingVisibleAction(IDLE, form([["visible", "off"]]));
    expect(updateOwnListingContent).toHaveBeenLastCalledWith(appTx, { visible: false }, expect.any(Date));
  });

  it("says so when there is no listing to save into", async () => {
    vi.mocked(updateOwnListingContent).mockResolvedValue(false);
    const state = await saveListingAboutAction(IDLE, form([["about", "Hello"]]));
    expect(state).toMatchObject({ status: "error", message: LISTING_MISSING_MESSAGE });
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm --filter @fynix/platform exec vitest run "app/app-host/(protected)/listing/actions.test.ts"`
Expected: FAIL, cannot resolve `./actions`.

- [ ] **Step 4: Implement**

```ts
// apps/platform/app/app-host/(protected)/listing/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { updateOwnListingContent, withTenantScope, type ListingContentPatch } from "@fynix/db";
import type { FormParseResult } from "@fynix/shared/lib/form-result";
import {
  parseAboutForm,
  parseButtonsForm,
  parseTagsForm,
  parseVisibleForm,
} from "@fynix/shared/lib/directory/listing-content";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { getAppDb } from "@/lib/server/db";
import { errorLogInfo } from "@/lib/server/error-log";
import { paymentRequiredState, unexpectedErrorState } from "@/lib/server/panel-form-errors";
import { listingMissingState } from "./errors";

/**
 * The one shape every Listing form shares: paid plan first (the house rule for every write), then the form's own
 * parser, then one tenant-scoped update of listing_content. Grants keep this to the client's own columns.
 */
async function saveListing<T>(
  formData: FormData,
  parse: (formData: FormData) => FormParseResult<T>,
  toPatch: (data: T) => ListingContentPatch,
): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parse(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const updated = await withTenantScope(getAppDb(), access.tenant, (tx) =>
      updateOwnListingContent(tx, toPatch(parsed.data), new Date()),
    );
    if (!updated) return listingMissingState(formData);
  } catch (error) {
    console.error("[listing] save failed", errorLogInfo(error));
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/listing");
  return panelFormSavedState;
}

export async function saveListingAboutAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  return saveListing(formData, parseAboutForm, ({ about }) => ({ about }));
}

export async function saveListingTagsAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  return saveListing(formData, parseTagsForm, ({ tags }) => ({ tags }));
}

export async function saveListingButtonsAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  return saveListing(formData, parseButtonsForm, (buttons) => ({ buttons }));
}

export async function setListingVisibleAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  return saveListing(formData, parseVisibleForm, ({ visible }) => ({ visible }));
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @fynix/platform exec vitest run "app/app-host/(protected)/listing/actions.test.ts"`
Expected: PASS (5 tests).

---

### Task 11: Customer page and components

**Files:**
- Create: `apps/platform/app/app-host/(protected)/listing/page.tsx`
- Create: `apps/platform/components/panel/listing/listing-link.tsx` (client: copy link)
- Create: `apps/platform/components/panel/listing/listing-details.tsx` (client: the editable rows)

No unit test: the logic under this page is tested in Tasks 2, 5, 7 and 10; the page is checked in the browser in Task 14.

- [ ] **Step 1: The copy-link component**

```tsx
// apps/platform/components/panel/listing/listing-link.tsx
"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@fynix/shared/ui/panel/button";

interface ListingLinkProps {
  readonly url: string;
  /** Only a live listing has a page to open or share. */
  readonly live: boolean;
}

/** The listing's address, a link to open it, and a copy button that falls back to showing the text to select. */
export function ListingLink({ url, live }: ListingLinkProps): ReactElement {
  const [note, setNote] = useState<string | null>(null);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied");
    } catch {
      setNote("Select the address above to copy it");
    }
  }

  return (
    <div className="space-y-3">
      <p className="break-all font-mono text-xs text-ink-soft">{url.replace(/^https:\/\//, "")}</p>
      <div className="flex flex-wrap items-center gap-3">
        {live ? (
          <a href={url} target="_blank" rel="noopener" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-paper">
            View on the local directory ↗
          </a>
        ) : (
          <span aria-disabled="true" className="rounded-full bg-accent/40 px-5 py-2.5 text-sm font-semibold text-paper">
            View on the local directory ↗
          </span>
        )}
        <Button type="button" variant="secondary" disabled={!live} onClick={() => void copy()}>
          Copy link
        </Button>
        <span role="status" className="text-sm text-ink-soft">
          {note}
        </span>
      </div>
    </div>
  );
}
```

If `Button` has no `"secondary"` variant, use the variant name `packages/shared/src/ui/panel/button.tsx` defines for an
outlined button.

- [ ] **Step 2: The editable rows**

```tsx
// apps/platform/components/panel/listing/listing-details.tsx
"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import type { ListingContentRow } from "@fynix/db";
import {
  LISTING_ABOUT_MAX_LENGTH,
  LISTING_BUTTONS,
  LISTING_BUTTON_LABELS,
  LISTING_TAG_LIMIT,
  type ListingButton,
} from "@fynix/shared/lib/directory/listing-content";
import { Button } from "@fynix/shared/ui/panel/button";
import { FIELD_CLASSES, PanelFormStatus, usePanelForm, type PanelFormAction } from "@/components/panel/form/panel-form";

interface ListingDetailsProps {
  readonly content: ListingContentRow;
  /** Paused listings are read-only: every write needs a paid plan. */
  readonly editable: boolean;
  /** Book needs the Appointments module; Website needs a website address. */
  readonly unavailable: Readonly<Partial<Record<ListingButton, string>>>;
  /** One line per day, e.g. "Monday · 10:00 am – 1:30 pm". */
  readonly hoursLines: readonly string[];
  readonly announcement: string | null;
  readonly actions: {
    readonly about: PanelFormAction;
    readonly tags: PanelFormAction;
    readonly buttons: PanelFormAction;
    readonly visible: PanelFormAction;
  };
}

/** One row: label, current value, and an Edit toggle that opens its form in place. */
function Row({ label, value, editable, children }: {
  readonly label: string;
  readonly value: ReactNode;
  readonly editable: boolean;
  readonly children?: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line">
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-4 py-4">
        <span className="text-sm font-semibold text-ink-soft">{label}</span>
        <span className="min-w-0 break-words">{value}</span>
        {editable && children !== undefined ? (
          <button type="button" className="text-sm font-semibold text-ink-soft hover:text-accent" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Close" : "Edit"}
          </button>
        ) : (
          <span />
        )}
      </div>
      {open ? <div className="pb-5">{children}</div> : null}
    </li>
  );
}

function AboutForm({ about, action }: { readonly about: string | null; readonly action: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const [value, setValue] = useState(about ?? "");
  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <label htmlFor="listing-about" className="sr-only">
        One line about your business
      </label>
      <textarea
        id="listing-about"
        name="about"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={2}
        className={FIELD_CLASSES}
        {...controls.fieldStatus("about")}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={value.length > LISTING_ABOUT_MAX_LENGTH ? "text-xs font-semibold text-accent" : "text-xs tabular-nums text-ink-soft"}>
          {value.length}/{LISTING_ABOUT_MAX_LENGTH}
        </span>
        <div className="flex items-center gap-3">
          <PanelFormStatus controls={controls} statusRef={statusRef} />
          <Button type="submit" size="sm" disabled={controls.isPending}>
            {controls.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function TagsForm({ tags, action }: { readonly tags: readonly string[]; readonly action: PanelFormAction }): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  const [list, setList] = useState<readonly string[]>(tags);
  const [draft, setDraft] = useState("");

  function add(): void {
    const tag = draft.trim();
    if (tag === "" || list.length >= LISTING_TAG_LIMIT) return;
    if (list.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    setList([...list, tag]);
    setDraft("");
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {list.map((tag) => (
          <li key={tag} className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm text-ink-soft">
            <input type="hidden" name="tag" value={tag} />
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => setList(list.filter((item) => item !== tag))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <label htmlFor="listing-tag" className="sr-only">
        Add a service
      </label>
      <input
        id="listing-tag"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        placeholder="Add a service, then press Enter"
        className={FIELD_CLASSES}
        {...controls.fieldStatus("tag")}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-ink-soft">
          {list.length} of {LISTING_TAG_LIMIT}
        </span>
        <div className="flex items-center gap-3">
          <PanelFormStatus controls={controls} statusRef={statusRef} />
          <Button type="submit" size="sm" disabled={controls.isPending}>
            {controls.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ButtonsForm({ buttons, unavailable, action }: {
  readonly buttons: ListingContentRow["buttons"];
  readonly unavailable: ListingDetailsProps["unavailable"];
  readonly action: PanelFormAction;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {LISTING_BUTTONS.map((button) => {
        const reason = unavailable[button];
        return (
          <label key={button} className="flex items-center justify-between gap-4 py-1 text-sm">
            <span>
              {LISTING_BUTTON_LABELS[button]}
              {reason === undefined ? null : <span className="ml-2 text-xs text-ink-soft">({reason})</span>}
            </span>
            <input type="checkbox" name={button} defaultChecked={buttons[button]} disabled={reason !== undefined} className="size-4 accent-accent" />
          </label>
        );
      })}
      <div className="flex items-center justify-end gap-3 pt-2">
        <PanelFormStatus controls={controls} statusRef={statusRef} />
        <Button type="submit" size="sm" disabled={controls.isPending}>
          {controls.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function VisibleForm({ visible, editable, action }: {
  readonly visible: boolean;
  readonly editable: boolean;
  readonly action: PanelFormAction;
}): ReactElement {
  const { formRef, statusRef, formAction, controls } = usePanelForm(action);
  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="visible" value={visible ? "off" : "on"} />
      <Button type="submit" size="sm" variant="secondary" disabled={!editable || controls.isPending}>
        {visible ? "Hide from directory" : "Show in directory"}
      </Button>
      <PanelFormStatus controls={controls} statusRef={statusRef} />
    </form>
  );
}

export function ListingDetails({ content, editable, unavailable, hoursLines, announcement, actions }: ListingDetailsProps): ReactElement {
  const onButtons = LISTING_BUTTONS.filter((button) => content.buttons[button] && unavailable[button] === undefined);
  return (
    <ul>
      <Row label="About" value={content.about ?? <span className="text-ink-soft">Add one line about you</span>} editable={editable}>
        <AboutForm about={content.about} action={actions.about} />
      </Row>
      <Row label="Services" value={content.tags.length === 0 ? <span className="text-ink-soft">None yet</span> : content.tags.join(" · ")} editable={editable}>
        <TagsForm tags={content.tags} action={actions.tags} />
      </Row>
      <Row
        label="Hours"
        value={
          <span>
            Same as your website ·{" "}
            <a href="/details" className="font-semibold text-accent">
              Edit on Your details
            </a>
          </span>
        }
        editable={hoursLines.length > 0}
      >
        <ul className="space-y-1 text-sm">
          {hoursLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Row>
      <Row
        label="Announcement"
        value={
          <span>
            {announcement ?? <span className="text-ink-soft">None</span>} ·{" "}
            <a href="/details" className="font-semibold text-accent">
              Edit
            </a>
          </span>
        }
        editable={false}
      />
      <Row label="Buttons" value={onButtons.map((button) => LISTING_BUTTON_LABELS[button]).join(" · ") || "None"} editable={editable}>
        <ButtonsForm buttons={content.buttons} unavailable={unavailable} action={actions.buttons} />
      </Row>
      <li className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4">
        <span className="text-sm font-semibold text-ink-soft">Show in directory</span>
        <VisibleForm visible={content.visible} editable={editable} action={actions.visible} />
      </li>
    </ul>
  );
}
```

- [ ] **Step 3: The page**

```tsx
// apps/platform/app/app-host/(protected)/listing/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { findAnnouncement, findBusinessTimeZone, findBusinessWebsiteUrl, findOwnListing, getBusinessHours, getBusinessProfile, hasLiveProject, listingPath, withTenantScope } from "@fynix/db";
import { localDateIn } from "@fynix/shared/lib/calendar/local-date";
import type { ListingButton } from "@fynix/shared/lib/directory/listing-content";
import { DIRECTORY_ORIGIN, areaName, categoryLabel, cityName } from "@fynix/shared/lib/directory/places";
import { LISTING_STAGE_LABELS, listingStage } from "@fynix/shared/lib/directory/stage";
import { WEEKDAYS } from "@fynix/shared/lib/onboarding/business-fields";
import { describeStoredDay } from "@fynix/shared/lib/onboarding/hours";
import { siteConfig } from "@fynix/shared/lib/site-config";
import { ListingDetails } from "@/components/panel/listing/listing-details";
import { ListingLink } from "@/components/panel/listing/listing-link";
import { getEnabledModules } from "@/lib/server/business-modules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { saveListingAboutAction, saveListingButtonsAction, saveListingTagsAction, setListingVisibleAction } from "./actions";

export const metadata: Metadata = { title: "Your listing" };

const DOT: Readonly<Record<string, string>> = {
  building: "bg-[#b27716]",
  live: "bg-[#2f7a4f]",
  hidden: "bg-ink-soft",
  paused: "bg-ink-soft",
};

export default async function ListingPage(): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();

  const data = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    listing: await findOwnListing(tx),
    live: await hasLiveProject(tx, tenant.businessId),
    websiteUrl: await findBusinessWebsiteUrl(tx, tenant.businessId),
    timeZone: await findBusinessTimeZone(tx, tenant.businessId),
    hours: await getBusinessHours(tx),
    announcement: await findAnnouncement(tx),
    profile: await getBusinessProfile(tx),
  }));
  if (data.listing === null) notFound();

  const modules = await getEnabledModules();
  const { placement, content } = data.listing;
  const stage = listingStage({ hasLiveProject: data.live, billingStatus: billing.status, visible: content.visible });
  const url = `${DIRECTORY_ORIGIN}${listingPath(placement)}`;
  const category = categoryLabel(placement.categorySlug) ?? placement.categorySlug;
  const area = areaName(placement.citySlug, placement.areaSlug) ?? placement.areaSlug;
  const city = cityName(placement.citySlug) ?? placement.citySlug;

  const today = localDateIn(data.timeZone ?? "Asia/Kolkata", new Date());
  const announcement =
    data.announcement !== null && data.announcement.startsOn <= today && today <= data.announcement.endsOn
      ? data.announcement.message
      : null;
  const hoursLines = WEEKDAYS.map((label, day) => {
    const described = describeStoredDay(data.hours.filter((row) => row.dayOfWeek === day));
    return `${label} · ${described ?? "Not set"}`;
  });

  const unavailable: Partial<Record<ListingButton, string>> = {
    ...(modules.includes("appointments") ? {} : { book: "needs Appointments" }),
    ...(data.websiteUrl === null ? { website: "after your website launches" } : {}),
  };

  const requestHref = `mailto:${siteConfig.email}?subject=${encodeURIComponent("Change to my listing")}&body=${encodeURIComponent(
    `Please change my listing (${url}).\n\nWhat to change (name, category, area, phone or map pin):\n`,
  )}`;

  const line =
    stage === "building"
      ? "Your listing goes live on the local directory the day your website launches."
      : stage === "paused"
        ? "You're shown as a basic listing until your payment goes through."
        : stage === "hidden"
          ? "You're hidden from the local directory. Everything is kept."
          : `People looking for ${category.toLowerCase()} in ${area} find you here.`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="panel-title">Your listing</h1>
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className={`size-2.5 rounded-full ${DOT[stage] ?? "bg-ink-soft"}`} />
          {LISTING_STAGE_LABELS[stage]}
        </span>
      </div>

      {stage === "paused" ? (
        <p className="mt-6 text-sm text-ink-soft">
          Your payment is due. <a href="/billing" className="font-semibold text-accent">Pay to be featured again</a>; your
          details can be changed again once it goes through.
        </p>
      ) : null}

      <div className="mt-8 max-w-2xl space-y-4">
        <p className="font-serif text-2xl leading-snug">{line}</p>
        <ListingLink url={url} live={stage === "live"} />
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="listing-details">
          <h2 id="listing-details" className="panel-section border-b border-line pb-3">
            Your details
          </h2>
          <ListingDetails
            content={content}
            editable={billing.hasAccess}
            unavailable={unavailable}
            hoursLines={hoursLines}
            announcement={announcement}
            actions={{
              about: saveListingAboutAction,
              tags: saveListingTagsAction,
              buttons: saveListingButtonsAction,
              visible: setListingVisibleAction,
            }}
          />
        </section>

        <section aria-labelledby="listing-ours">
          <h2 id="listing-ours" className="panel-section border-b border-line pb-3">
            Set by us
          </h2>
          <dl className="text-sm">
            {[
              ["Name", data.profile?.displayName ?? tenant.businessName],
              ["Category", category],
              ["Area", `${area}, ${city}`],
              ["Phone", data.profile?.phone ?? "Not set"],
              ["Map pin", placement.pinLabel],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 border-b border-line py-3">
                <dt className="font-semibold text-ink-soft">{label}</dt>
                <dd className="break-words text-ink-soft">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4">
            <a href={requestHref} className="text-sm font-semibold text-accent">
              Request a change →
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
```

Notes for this step:
- `getBusinessHours` is the tenant read `details/page.tsx` already uses; import it from `@fynix/db` the same way.
- If `describeStoredDay` rejects `BusinessHoursRow` (type mismatch), map rows to `StoredHoursRow` with the same fields
  (`dayOfWeek, opensAt, closesAt, closed, openAllDay`).
- `getBusinessProfile` (onboarding-data.ts) is the tenant read of `business_profiles`; export it from `@fynix/db` if
  it is not already. Show the phone as stored (E.164); formatting it is a later nicety.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @fynix/platform exec tsc --noEmit`
Expected: no errors.

---

### Task 12: Nav item

**Files:**
- Create: `apps/platform/lib/server/listing.ts`
- Modify: `apps/platform/components/panel/customer-shell.tsx`

- [ ] **Step 1: The check**

```ts
// apps/platform/lib/server/listing.ts
import "server-only";
import { findOwnListing, withTenantScope } from "@fynix/db";
import { cache } from "react";
import { getCustomerAccess } from "./customer-access";
import { getAppDb } from "./db";

/** Whether staff have created this business's listing, which is what puts Listing in the nav. Once per request. */
export const hasOwnListing = cache(async (): Promise<boolean> => {
  const access = await getCustomerAccess();
  if (access.kind !== "granted") return false;
  return withTenantScope(getAppDb(), access.tenant, async (tx) => (await findOwnListing(tx)) !== null);
});
```

- [ ] **Step 2: Wire it into the shell**

In `customer-shell.tsx`:

1. Import `hasOwnListing` from `@/lib/server/listing` and a pin icon (`MapPinIcon` from `@fynix/shared/ui/icons` if it
   exists; otherwise add one there next to `HomeIcon`, a 24×24 stroke icon of a map pin).
2. Add `listingExists: boolean` to `customerNav`'s parameters and insert, after the appointments block and before
   the setup item:

```ts
    ...(listingExists ? [{ href: "/listing", label: "Listing", icon: <MapPinIcon className="size-5" /> }] : []),
```

3. Add a safe read beside `readAppointmentsNav`:

```ts
/** A failed read hides the Listing item rather than taking the dashboard down, like readAppointmentsNav. */
async function readListingNav(): Promise<boolean> {
  try {
    return await hasOwnListing();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[customer-shell] could not read the listing; hiding it from the nav", errorLogInfo(error));
    return false;
  }
}
```

4. Add `readListingNav()` to the `Promise.all` in `CustomerShell` and pass `listingExists` to `customerNav`.

- [ ] **Step 3: Typecheck and run the platform unit tests**

Run: `pnpm --filter @fynix/platform exec tsc --noEmit && pnpm --filter @fynix/platform test`
Expected: no type errors; all tests pass.

---

### Task 13: Staff Listing section

**Files:**
- Modify: `apps/admin/app/(protected)/clients/[businessId]/actions.ts` (new action)
- Create: `apps/admin/components/client-listing.tsx`
- Modify: `apps/admin/app/(protected)/clients/[businessId]/page.tsx` (load + render)

- [ ] **Step 1: The action** (append to `actions.ts`; add the imports to its import block)

```ts
import { ListingAddressTakenError, saveListingPlacement } from "@fynix/db";
import { parsePlacementForm } from "@fynix/shared/lib/directory/placement-form";

/** Creates or changes where the client's listing sits on the local directory. */
export async function saveListingPlacementAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The listing's business");

  const parsed = parsePlacementForm(formData);
  if (!parsed.success) redirect(`/clients/${businessId}?listing=invalid&listingField=${parsed.field ?? "form"}#listing`);

  try {
    await saveListingPlacement(getStaffDb(), businessId, parsed.data, new Date());
  } catch (error) {
    if (error instanceof ListingAddressTakenError) redirect(`/clients/${businessId}?listing=taken#listing`);
    throw error;
  }

  revalidateClient(businessId);
  redirect(`/clients/${businessId}?listing=saved#listing`);
}
```

- [ ] **Step 2: The component**

```tsx
// apps/admin/components/client-listing.tsx
import type { ReactElement } from "react";
import { listingPath, type ListingPlacement } from "@fynix/db";
import {
  DIRECTORY_AREAS,
  DIRECTORY_CATEGORIES,
  DIRECTORY_CITIES,
  DIRECTORY_ORIGIN,
  slugifyBusinessName,
} from "@fynix/shared/lib/directory/places";
import { PLACEMENT_FIELD_MESSAGES, type PlacementField } from "@fynix/shared/lib/directory/placement-form";
import { saveListingPlacementAction } from "@/app/(protected)/clients/[businessId]/actions";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";

export type ListingNotice = { readonly kind: "saved" } | { readonly kind: "taken" } | { readonly kind: "invalid"; readonly field: PlacementField | null };

interface ClientListingProps {
  readonly businessId: string;
  readonly displayName: string;
  readonly placement: ListingPlacement | null;
  /** Whether the client's website has launched (the listing is only public after that). */
  readonly live: boolean;
  readonly notice: ListingNotice | null;
}

function noticeText(notice: ListingNotice): string {
  if (notice.kind === "saved") return "Saved. The directory picks it up within a minute.";
  if (notice.kind === "taken") return "Another client already has that exact address. Change the name part.";
  return notice.field === null ? "Check the form." : PLACEMENT_FIELD_MESSAGES[notice.field];
}

/** Where the client's Featured listing sits on the local directory. Every field here shapes its address or was checked
 * by us, which is why the client cannot change any of them (spec 2026-09-29-customer-listing-tab-design.md). */
export function ClientListing({ businessId, displayName, placement, live, notice }: ClientListingProps): ReactElement {
  const path = placement === null ? null : listingPath(placement);
  return (
    <div className="space-y-6">
      {notice === null ? null : <Notice tone={notice.kind === "saved" ? "ok" : "problem"}>{noticeText(notice)}</Notice>}

      {path === null ? (
        <p className="text-sm text-ink-soft">No listing yet. Fill this in to create one; the client sees a Listing tab straight away.</p>
      ) : (
        <p className="text-sm">
          <a href={`${DIRECTORY_ORIGIN}${path}`} target="_blank" rel="noopener" className="link-underline break-all">
            {DIRECTORY_ORIGIN.replace(/^https:\/\//, "")}
            {path}
          </a>{" "}
          <span className="text-ink-soft">· {live ? "public" : "goes public when the website launches"}</span>
        </p>
      )}

      <form action={saveListingPlacementAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="businessId" value={businessId} />

        <label className="block">
          <span className={labelClasses}>Category</span>
          <select name="category" defaultValue={placement?.categorySlug ?? ""} className={fieldClasses} required>
            <option value="" disabled>
              Choose…
            </option>
            {DIRECTORY_CATEGORIES.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClasses}>City</span>
          <select name="city" defaultValue={placement?.citySlug ?? "thane"} className={fieldClasses} required>
            {DIRECTORY_CITIES.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className={labelClasses}>Area</span>
          <select name="area" defaultValue={placement?.areaSlug ?? ""} className={fieldClasses} required>
            <option value="" disabled>
              Choose…
            </option>
            {DIRECTORY_CITIES.map((city) => (
              <optgroup key={city.slug} label={city.name}>
                {DIRECTORY_AREAS.filter((area) => area.city === city.slug).map((area) => (
                  <option key={`${city.slug}/${area.slug}`} value={area.slug}>
                    {area.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className={hintClasses}>Must be an area of the city above.</span>
        </label>

        <label className="block sm:col-span-2">
          <span className={labelClasses}>Name in the address</span>
          <input name="slug" defaultValue={placement?.slug ?? slugifyBusinessName(displayName)} className={fieldClasses} required />
          <span className={hintClasses}>Changing category, city, area or this changes the address; the old one redirects.</span>
        </label>

        <label className="block">
          <span className={labelClasses}>Latitude</span>
          <input name="lat" inputMode="decimal" defaultValue={placement?.lat ?? ""} className={fieldClasses} required />
        </label>
        <label className="block">
          <span className={labelClasses}>Longitude</span>
          <input name="lon" inputMode="decimal" defaultValue={placement?.lon ?? ""} className={fieldClasses} required />
        </label>
        <span className={`${hintClasses} sm:col-span-2`}>In Google Maps, right-click the building and click the numbers to copy them.</span>

        <label className="block sm:col-span-2">
          <span className={labelClasses}>Pin label (the client sees this)</span>
          <input name="pinLabel" defaultValue={placement?.pinLabel ?? ""} maxLength={120} className={fieldClasses} required />
        </label>

        <label className="block">
          <span className={labelClasses}>WhatsApp number (optional)</span>
          <input name="whatsappPhone" defaultValue={placement?.whatsappPhone ?? ""} className={fieldClasses} />
          <span className={hintClasses}>Empty uses their main phone.</span>
        </label>
        <label className="block">
          <span className={labelClasses}>Booking page (optional)</span>
          <input name="bookingUrl" type="url" defaultValue={placement?.bookingUrl ?? ""} className={fieldClasses} />
        </label>

        <label className="block sm:col-span-2">
          <span className={labelClasses}>Replaces this unconfirmed listing (optional)</span>
          <input name="replacesSourcePath" defaultValue={placement?.replacesSourcePath ?? ""} placeholder="/in/dentists/mh/thane/naupada/…" className={fieldClasses} />
          <span className={hintClasses}>Paste its fynix.digital/in address so it disappears and nothing shows twice.</span>
        </label>

        <div className="sm:col-span-2">
          <button type="submit" className={buttonPrimary}>
            {placement === null ? "Create listing" : "Save listing"}
          </button>
        </div>
      </form>

      {placement !== null && placement.previousPaths.length > 0 ? (
        <div className="text-sm text-ink-soft">
          <p className="font-semibold">Old addresses (redirect here)</p>
          <ul className="mt-1 space-y-1 break-all">
            {placement.previousPaths.map((old) => (
              <li key={old}>{old}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Load and render it on the client page**

In `apps/admin/app/(protected)/clients/[businessId]/page.tsx`:

1. Import `findListingPlacement, hasLiveProject` from `@fynix/db`, `ClientListing, type ListingNotice` from
   `@/components/client-listing`, and `isPlacementField` from `@fynix/shared/lib/directory/placement-form`.
2. Where the page reads its data in parallel, add `findListingPlacement(getStaffDb(), businessId)` and
   `hasLiveProject(getStaffDb(), businessId)`.
3. Read the notice from the search params the page already receives:

```ts
function readListingNotice(listing: string | undefined, field: string | undefined): ListingNotice | null {
  if (listing === "saved") return { kind: "saved" };
  if (listing === "taken") return { kind: "taken" };
  if (listing === "invalid") return { kind: "invalid", field: field !== undefined && isPlacementField(field) ? field : null };
  return null;
}
```

4. Render a section after "Their website" (line ~636), before "Features":

```tsx
<Section title="Listing" id="listing" aside="the local directory">
  <ClientListing
    businessId={client.id}
    displayName={client.profile?.displayName ?? client.name}
    placement={listingPlacement}
    live={listingLive}
    notice={readListingNotice(firstParam(searchParams.listing), firstParam(searchParams.listingField))}
  />
</Section>
```

Use the page's existing helper for reading one search param (it reads `website=` already for `WebsiteUrlBlock`); if it
is named differently from `firstParam`, use that name. Use the page's own names for `client.id` /
`client.profile.displayName` / `client.name` (see how `WebsiteUrlBlock` and "Business details" get them).

- [ ] **Step 4: Typecheck and lint admin**

Run: `pnpm --filter @fynix/admin exec tsc --noEmit && pnpm --filter @fynix/admin lint`
Expected: no errors.

---

### Task 14: Whole-branch checks and a real run

- [ ] **Step 1: The full check set** (CLAUDE.md: lint, typecheck, build; plus both test suites)

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Expected: all pass. Fix anything that fails and re-run the failing command until clean.

- [ ] **Step 2: Real run on local servers**

Start the branch's own servers (add `.claude/launch.json` entries `listing-platform` on 3061 and `listing-admin` on
3063 pointing at this worktree, like the `pat-*` entries), then:

1. Admin → a test client with a live project → Listing → pick Dentists / Thane / an area, paste lat `19.19` lon `72.97`,
   pin label, Create listing. Expect "Saved…" and the address link.
2. Customer app as that client → **Listing** is in the nav → status "Live on the local directory" → edit About (try a
   phone number: refused with the contact message), add two services, switch Book off, Save each. Expect "Saved."
3. `curl -s http://app.localhost:3061/api/directory/listings | jq` shows the listing with the new about, tags and no
   `book` button.
4. Hide from directory → the feed no longer includes it; Show again → it returns.
5. Admin: change the area → the customer tab shows the new address; the feed's `previousAddresses` holds the old one.
6. A client with no listing: no Listing item in the nav; `/listing` is a 404.

- [ ] **Step 3: Report**

Tell the user: checks run and their results, the deviations listed at the top of this plan, and that nothing is
committed. Phase 1b (the `/in` merge in the website repo) is next and needs `feat/global-search` committed first.
