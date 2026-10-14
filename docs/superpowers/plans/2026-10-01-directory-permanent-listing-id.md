# Directory Permanent Business ID and Locked URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every business in the the local directory directory gets a permanent 7-character ID and a locked public URL, `/in/mh/{city}/business/{name}/{id}`. Reviews, Verified, Trending counts, enquiries, claims, pictures and ads hang off the ID, so nothing is lost when a business changes. Every old URL 301s to the current one.

**Architecture:**
- **Pages are found by ID.** The `{city}` and `{name}` parts are a label frozen when the page goes live. A request with a stale or wrong label 301s to the current URL, so no redirect history table is needed.
- **Open-data IDs** are issued by the dataset build from each row's Overture/OSM id and kept in an append-only ledger.
- **Platform IDs** (clients, owner-added businesses) are random.
- **The two kinds can never collide:** open-data IDs start with a letter and platform IDs start with a digit.
- **Data tables move from the old `listing_key` string to `place_id`**, using expand then contract.
- **The website switches from sending keys to sending IDs.** A frozen legacy map 301s every old `/in/<service>/mh/<city>/<area>/<slug>` URL.

**Tech Stack:** Postgres + Drizzle (`packages/db`), Vitest unit and integration tests, Next.js 16 (platform, admin, website), Python 3 (dataset build).

**Repos and worktrees:**
- Platform: `/Users/siddiqueahmed/Desktop/AI/fynix-platform/directory-ads` (branch `feat/directory-ads`, 801e11f). Create a fresh worktree off it.
- Website: `/Users/siddiqueahmed/Desktop/AI/fynix-platform/website-listing` (branch `feat/listing-redesign`, f6cfca3). This is the only copy with `lib/directory-feed.ts`.
- Dataset: `/Users/siddiqueahmed/Desktop/AI/fynix-platform/local-directory-data/thane`.
- **Never commit or push unless the user asks in that message.** The "Commit" steps are checkpoints for when they do.

---

## 1. Decisions (agreed with the user, 2026-10-01)

| Topic | Decision |
|---|---|
| Business URL | `/in/mh/{city}/business/{name}/{id}`. `in` = India, `mh` = Maharashtra. |
| Name part | Business name only (no area), slugified, max 70 characters. |
| ID | 7 characters from `23456789abcdefghjkmnpqrstuvwxyz` (no `0 o 1 l i`). It always contains at least one digit. Open-data IDs start with a letter, platform IDs with a digit. It is never derived from name, phone or date. |
| Where the ID shows | Only at the end of the URL, and in the staff console. Never as text on the public page. |
| Locking | City and name in the URL are frozen when the page goes live. Owners can never change them, and owner forms don't accept them. Staff can change them only through one audited action, and the old URL then 301s automatically. |
| Category and place pages | Unchanged: `/in/<service>/mh/<city>[/<area>]` and `/in/mh/<city>[/<area>]`. |
| `/in/mh/{city}/business` | 301 to `/in/mh/{city}`. |
| Old business URLs | `/in/<service>/mh/<city>/<area>/<slug>` 301s to the new URL, forever. |
| Client listing replacing an open-data row | The client **takes over the open-data business's ID**. It is the same business, so reviews and URL carry over with no merging. |

## 2. Behaviour

| A visitor opens | Result |
|---|---|
| `/in/mh/thane/business/smile-dental/k7m2q9a` | The page |
| `/in/mh/thane/business/anything/k7m2q9a` (stale or wrong name) | 301 → `/in/mh/thane/business/smile-dental/k7m2q9a` |
| `/in/mh/pune/business/smile-dental/k7m2q9a` (wrong city) | 301 → current URL |
| `/in/mh/thane/business/smile-dental/zzzzzz2` (unknown ID) | 404 |
| `/in/mh/thane/business` | 301 → `/in/mh/thane` |
| `/in/dentists/mh/thane/naupada/smile-dental` (old format) | 301 → current URL |

| Change | URL changes? | Data kept? |
|---|---|---|
| Owner edits display name, phone, hours, photos | No (URL locked) | Yes |
| Staff move area or category | No (not in URL) | Yes |
| Staff change URL name or city (rebrand, city move) | Yes, audited; the old URL 301s | Yes |
| Dataset rebuild renames a row | No (ledger keeps the locked name) | Yes |
| Owner-added business still pending approval | Can edit freely: no page is live yet | — |

## 3. Current state (verified 2026-10-01)

- **Business URL today:** `/in/<service>/mh/<city>/<area>/<slug>`. It is built by `directoryPath` (`website-listing/lib/local-directory.ts:132-147`) and served by `app/(marketing)/in/[first]/[second]/[third]/[fourth]/[fifth]/page.tsx`.
- **Identity everywhere is the string `<service>/<city>/<area>/<slug>`** (`listingKey`, `lib/directory-ratings.ts:17`). These platform tables store it, with no foreign key:
  - `directory_reviews`, `directory_review_otps`, `directory_enquiries` (0054)
  - `directory_verifications` (0056, where it is the PK)
  - `directory_daily_counts` (0058, part of the PK)
  - `directory_claims`, `directory_ad_bids`, `directory_ad_wins` (0064/0068/0071)
  - `directory_staff_ads` (0066)

  `directory_listings` stores the address parts plus `previous_paths`. `directory_promotions` and `directory_pictures` are keyed by `business_id`.
- **Open-data rows** are 32,128 rows in `website-listing/content/local/thane-listings.json`, each a 10-tuple `[name, service, city, area, address, lat, lon, website, source, slug]`. They are built by `local-directory-data/thane/build_web_data.py`. Its CSV has `overture_id` and `osm_id` (all 45,785 rows have one; 454 have both), but the build drops them. Slugs are numbered `-2…-103` per category and area (`build_web_data.py:312-319`).
- **Website business links** are built at:
  - `app/api/local-suggest/route.ts:30`
  - `components/local/directory.tsx:180`
  - `components/local/business-page.tsx:394`
  - `components/local/pages.tsx:928` (canonical) and `:952`
  - `components/listing/listing-card.tsx:37`
  - `lib/directory-ads.ts:179` and `:220`
  - `lib/directory-feed.ts:214`
- **Platform directory API:** `apps/platform/app/api/directory/{ads,enquiries,events,listings,pictures,ratings,reviews,signals,status}`. The website client is `website-listing/lib/server/directory-client.ts`, which sends `?keys=` in chunks of 50.

## 4. File map

**Dataset (`local-directory-data/thane`)**
- Create `place_ids.py`: ID issuing and the ledger.
- Create `test_place_ids.py`.
- Create `thane-place-ledger.json`: append-only, **committed**, never hand-edited.
- Modify `build_web_data.py`: IDs and locked URL parts into the listings JSON; write the legacy URL map; reserved-word check.

**Platform (`directory-ads` worktree)**
- Create `packages/shared/src/lib/directory/place-id.ts` and `place-id.test.ts`: alphabet, validation, random platform IDs.
- Create `packages/db/src/schema/directory-places.ts`: `directory_places`, `directory_place_legacy_keys`, `directory_place_url_changes`.
- Create migrations `0075_directory_places.sql`, `0076_directory_places_grants.sql`, `0077_directory_place_ids.sql` (expand), `0078_directory_place_id_writes.sql` (Task 7: writes by id), `0079_directory_place_ids_contract.sql` (Phase 6).
- Create `packages/db/src/queries/directory-places.ts` and `src/directory-places.integration.test.ts`.
- Create `packages/db/scripts/import-directory-places.ts` and `packages/db/scripts/backfill-directory-places.ts`.
- Modify the schema and query files for reviews, ads, listings, pictures and promotions; the `apps/platform/app/api/directory/*` routes; the feed (`packages/shared/src/lib/directory/feed-contract.ts`, `feed.ts`, `apps/platform/lib/server/directory-feed.ts`); and admin (`apps/admin/app/(protected)/clients/[businessId]/actions.ts`, the directory claims page).

**Website (`website-listing`)**
- Create `lib/place-id.ts`: a copy of the shared validator plus `businessPath()`, as `lib/directory-feed.ts` copies the feed contract.
- Create `lib/place-id.test.ts`.
- Modify:
  - `lib/server/local-listings.ts`: 13-tuple rows, `findBusinessById`, legacy map
  - `lib/directory-feed.ts`: `id`, `url`, `legacyKeys`
  - `lib/local-directory.ts`: business paths leave `directoryPath`
  - the route files `app/(marketing)/in/[first]/[second]/[third]/page.tsx` and `.../[fourth]/[fifth]/page.tsx`
  - the 9 link sites above
  - `lib/server/directory-client.ts`: `ids`
  - `lib/directory-ratings.ts`
  - `lib/server/claim-link.ts`

---

## Phase 1: IDs

### Task 1: The ID format, shared by platform and website

**Files:**
- Create: `packages/shared/src/lib/directory/place-id.ts`
- Test: `packages/shared/src/lib/directory/place-id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/lib/directory/place-id.test.ts
import { describe, expect, it } from "vitest";
import { PLACE_ID_ALPHABET, isPlaceId, isPlatformPlaceId, newPlatformPlaceId } from "./place-id";

describe("place ids", () => {
  it("uses 31 characters with no 0, o, 1, l or i", () => {
    expect(PLACE_ID_ALPHABET).toHaveLength(31);
    expect(PLACE_ID_ALPHABET).not.toMatch(/[01ilo]/);
  });

  it("accepts 7 characters from the alphabet with at least one digit", () => {
    expect(isPlaceId("k7m2q9a")).toBe(true);
    expect(isPlaceId("2bcdefg")).toBe(true);
    expect(isPlaceId("abcdefg")).toBe(false); // no digit
    expect(isPlaceId("k7m2q9")).toBe(false); // 6 long
    expect(isPlaceId("k7m2q9o")).toBe(false); // "o" is not in the alphabet
    expect(isPlaceId("K7M2Q9A")).toBe(false); // lowercase only
    expect(isPlaceId("naupada")).toBe(false);
  });

  it("makes platform ids that start with a digit and are valid", () => {
    for (let n = 0; n < 2000; n += 1) {
      const id = newPlatformPlaceId();
      expect(isPlaceId(id)).toBe(true);
      expect(isPlatformPlaceId(id)).toBe(true);
    }
  });

  it("tells open-data ids (letter first) from platform ids (digit first)", () => {
    expect(isPlatformPlaceId("k7m2q9a")).toBe(false);
    expect(isPlatformPlaceId("7km2q9a")).toBe(true);
  });

  it("is uniform enough that 2000 ids are all distinct", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newPlatformPlaceId()));
    expect(ids.size).toBe(2000);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @fynix/shared exec vitest run src/lib/directory/place-id.test.ts`
Expected: FAIL, "Cannot find module './place-id'".

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/lib/directory/place-id.ts
import { randomBytes } from "node:crypto";

/**
 * A directory business's permanent id: the last part of its URL, /in/mh/<city>/business/<name>/<id>. Seven
 * characters with no look-alikes (no 0 o 1 l i), so it survives being read out on a call or typed from a poster, and
 * always with a digit, so it never spells a word. Open-data ids (issued by the dataset build from the row's
 * Overture/OSM id) start with a letter; ids made here start with a digit, so the two sources can never collide.
 */
export const PLACE_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const PLACE_ID_LENGTH = 7;
const DIGITS = "23456789";
const ID_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{7}$/;

export function isPlaceId(value: string): boolean {
  return ID_PATTERN.test(value) && /[2-9]/.test(value);
}

export function isPlatformPlaceId(value: string): boolean {
  return isPlaceId(value) && /^[2-9]/.test(value);
}

/** One unbiased pick from `alphabet`; 248 is a multiple of both 8 and 31, so bytes >= 248 are re-drawn. */
function pick(alphabet: string, take: () => number): string {
  for (;;) {
    const byte = take();
    if (byte < 248) return alphabet.charAt(byte % alphabet.length);
  }
}

/** A fresh id for a business created on the platform (a client's listing, an owner-added business). */
export function newPlatformPlaceId(): string {
  const pool = randomBytes(64);
  let at = 0;
  const take = (): number => {
    if (at >= pool.length) {
      pool.set(randomBytes(64));
      at = 0;
    }
    const byte = pool[at];
    at += 1;
    if (byte === undefined) throw new Error("randomBytes returned a short buffer");
    return byte;
  };
  let id = pick(DIGITS, take);
  while (id.length < PLACE_ID_LENGTH) id += pick(PLACE_ID_ALPHABET, take);
  return id;
}
```

Export it from the package entry the same way `feed-contract` is exported. Check `packages/shared/package.json` `exports` and `src/index.ts`.

- [ ] **Step 4: Run** the test: PASS (5 tests). Run `pnpm --filter @fynix/shared typecheck`.
- [ ] **Step 5: Commit** (only if the user asked): `git commit -m "Add the directory place id format"`

### Task 2: The dataset build issues open-data IDs and keeps a ledger

**Files:**
- Create: `local-directory-data/thane/place_ids.py`, `local-directory-data/thane/test_place_ids.py`
- Modify: `local-directory-data/thane/build_web_data.py` (around :298-319 and :381-383)

- [ ] **Step 1: Write the failing test**

```python
# local-directory-data/thane/test_place_ids.py
import re
from place_ids import ALPHABET, Ledger, open_data_place_id

ID = re.compile(r"^[a-hj-km-np-z][23456789a-hj-km-np-z]{6}$")


def test_open_data_ids_are_letter_first_with_a_digit_and_deterministic():
    first = open_data_place_id("overture:e41ed420-69eb-44ce-b9ab-6c458e58cea4", taken=set())
    again = open_data_place_id("overture:e41ed420-69eb-44ce-b9ab-6c458e58cea4", taken=set())
    assert first == again
    assert ID.match(first), first
    assert any(c in "23456789" for c in first)
    assert set(first) <= set(ALPHABET)


def test_a_taken_id_is_skipped_deterministically():
    ref = "osm:node/123"
    plain = open_data_place_id(ref, taken=set())
    other = open_data_place_id(ref, taken={plain})
    assert other != plain
    assert other == open_data_place_id(ref, taken={plain})


def test_ledger_keeps_the_first_issue_forever(tmp_path):
    path = tmp_path / "ledger.json"
    ledger = Ledger.load(path)
    entry = ledger.issue("osm:node/1", city="thane", name="Smile Dental", legacy_key="dentists/thane/naupada/smile-dental")
    ledger.save()

    reloaded = Ledger.load(path)
    again = reloaded.issue("osm:node/1", city="kalyan-dombivli", name="Smile Dental & Implants", legacy_key=None)
    assert again == entry  # city, name and id are locked at first issue
    assert again["slug"] == "smile-dental"


def test_ledger_never_reuses_an_id_after_a_row_disappears(tmp_path):
    path = tmp_path / "ledger.json"
    ledger = Ledger.load(path)
    gone = ledger.issue("osm:node/1", city="thane", name="Gone Cafe", legacy_key=None)
    ledger.save()
    reloaded = Ledger.load(path)
    assert gone["id"] in reloaded.taken_ids()
```

- [ ] **Step 2: Run it and watch it fail**: `cd local-directory-data/thane && python3 -m pytest test_place_ids.py -q`. Expected: `ModuleNotFoundError: place_ids`. If pytest is missing, `python3 -m pip install --user pytest`.

- [ ] **Step 3: Implement**

```python
# local-directory-data/thane/place_ids.py
"""
Permanent ids for open-data businesses, and the ledger that keeps them.

A business's directory URL is /in/mh/<city>/business/<name>/<id>. For an open-data row the id comes from its
Overture/OSM id, so a rebuild gives it the same id; the city and name are frozen the first time the row is issued,
so a rebuild that spells the name differently never changes the URL. The ledger (thane-place-ledger.json) is
append-only and committed: an entry is never changed or removed, so an id is never reissued to another business.

Open-data ids start with a letter; the platform's own ids start with a digit (packages/shared place-id.ts), so the
two can never collide.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"
LETTERS = "abcdefghjkmnpqrstuvwxyz"
DIGITS = "23456789"
ID_LENGTH = 7


def url_name(name: str) -> str:
    """The name part of a business URL: lowercase ASCII words joined by hyphens, at most 70 characters."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug[:70].strip("-") or "business"


def open_data_place_id(source_ref: str, taken: set[str]) -> str:
    """The id for an open-data row: deterministic from its source ref, letter first, with a digit, not in `taken`."""
    salt = 0
    while True:
        digest = hashlib.sha256(f"fynix-place:{source_ref}:{salt}".encode()).digest()
        n = int.from_bytes(digest, "big")
        chars = [LETTERS[n % len(LETTERS)]]
        n //= len(LETTERS)
        for _ in range(ID_LENGTH - 1):
            chars.append(ALPHABET[n % len(ALPHABET)])
            n //= len(ALPHABET)
        candidate = "".join(chars)
        if any(c in DIGITS for c in candidate) and candidate not in taken:
            return candidate
        salt += 1


class Ledger:
    """source_ref -> {"id", "city", "slug", "legacyKey"}; append-only."""

    def __init__(self, path: Path, entries: dict[str, dict]):
        self.path = path
        self.entries = entries
        self._ids = {entry["id"] for entry in entries.values()}

    @classmethod
    def load(cls, path: Path) -> "Ledger":
        entries = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        ids = [entry["id"] for entry in entries.values()]
        if len(ids) != len(set(ids)):
            raise ValueError(f"{path}: an id appears twice; the ledger has been edited by hand")
        return cls(path, entries)

    def taken_ids(self) -> set[str]:
        return set(self._ids)

    def issue(self, source_ref: str, *, city: str, name: str, legacy_key: str | None) -> dict:
        """The row's ledger entry; created (and frozen) on first sight, returned unchanged ever after."""
        existing = self.entries.get(source_ref)
        if existing is not None:
            return existing
        place_id = open_data_place_id(source_ref, self._ids)
        entry = {"id": place_id, "city": city, "slug": url_name(name)}
        if legacy_key is not None:
            entry["legacyKey"] = legacy_key
        self.entries[source_ref] = entry
        self._ids.add(place_id)
        return entry

    def save(self) -> None:
        ordered = dict(sorted(self.entries.items()))
        self.path.write_text(json.dumps(ordered, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
```

- [ ] **Step 4: Run** the tests: PASS (4).

- [ ] **Step 5: Wire it into the build.** In `build_web_data.py`:

  a. Import `from place_ids import Ledger, url_name`. Add:

```python
RESERVED_SLUGS = {"business", "mh", "advertise"}


def place_source_ref(row: dict) -> str:
    """The open dataset's own id for a row; every row in thane-businesses.csv has one (checked 2026-10-01)."""
    if row.get("overture_id"):
        return f"overture:{row['overture_id']}"
    if row.get("osm_id"):
        return f"osm:{row['osm_id']}"
    raise ValueError(f"row has neither overture_id nor osm_id: {row.get('name')!r}")
```

  b. In `listings.append([...])` (around :303), add `place_source_ref(r)` as a 10th element after the source element.

  c. Leave the slug loop (:312-319) **unchanged**: it produces the legacy slug used by today's URLs. After it, add:

```python
    # Permanent ids and locked URL parts (/in/mh/<city>/business/<name>/<id>); see place_ids.py.
    ledger = Ledger.load(HERE / "thane-place-ledger.json")
    legacy_urls = {}
    for row in listings:
        source_ref = row.pop(9)  # row is now name, service, city, area, address, lat, lon, website, source, slug
        legacy_key = f"{row[1]}/{row[2]}/{row[3]}/{row[9]}"
        entry = ledger.issue(source_ref, city=row[2], name=row[0], legacy_key=legacy_key)
        legacy_urls[legacy_key] = entry["id"]
        row[9:] = [entry["id"], entry["city"], entry["slug"]]
    ledger.save()
    ids = [row[9] for row in listings]
    if len(ids) != len(set(ids)):
        raise SystemExit("two listings share a place id: two rows came from one Overture/OSM record")
```

  Each row is now a 12-tuple: `name, service, city, area, address, lat, lon, website, source, id, urlCity, urlSlug`.

  d. Freeze the legacy URL map. A legacy key only ever comes from the build that first issued a row, so later rebuilds only add rows whose key and ID are new. Merge rather than overwrite:

```python
    legacy_path = out / "thane-legacy-urls.json"
    known = json.loads(legacy_path.read_text(encoding="utf-8")) if legacy_path.exists() else {}
    for entry in ledger.entries.values():
        if "legacyKey" in entry:
            known.setdefault(entry["legacyKey"], entry["id"])
    legacy_path.write_text(json.dumps(dict(sorted(known.items())), separators=(",", ":")), encoding="utf-8")
```

  **Important:** the first ledger run must be on the **current, unchanged** dataset, so every legacy key matches a live URL. After cutover, new rows get no legacy key. To make that happen, add a flag `ISSUE_LEGACY_KEYS = not (HERE / "thane-place-ledger.json").exists()` evaluated before `Ledger.load`, and pass `legacy_key=legacy_key if ISSUE_LEGACY_KEYS else None`.

  e. Reserved words. After `area_list` and `city_list` are built (around :287 and :320):

```python
    clash = RESERVED_SLUGS & ({a["slug"] for a in area_list} | {c["slug"] for c in city_list} | set(service_slugs))
    if clash:
        raise SystemExit(f"reserved URL words used as a place or service slug: {sorted(clash)}")
```

  Check that `service_slugs` is the existing set used at :273. If its name differs, use that set.

- [ ] **Step 6: Run the build** as its header (:1-10) describes, then verify:

```bash
python3 - <<'EOF'
import json
rows = json.load(open("/Users/siddiqueahmed/Desktop/AI/fynix-platform/website-listing/content/local/thane-listings.json"))
ledger = json.load(open("thane-place-ledger.json"))
legacy = json.load(open("/Users/siddiqueahmed/Desktop/AI/fynix-platform/website-listing/content/local/thane-legacy-urls.json"))
print(len(rows), len(ledger), len(legacy), len({r[9] for r in rows}))
assert all(len(r) == 12 for r in rows)
EOF
```

Expected: `32128 32128 32128 32128` with today's data.

Then run the build **a second time** and confirm `git diff --stat` in `local-directory-data` shows no change to `thane-place-ledger.json`. That proves determinism.

- [ ] **Step 7: Commit** (only if the user asked): commit `place_ids.py`, `test_place_ids.py`, `thane-place-ledger.json` and `build_web_data.py` in `local-directory-data`. The website JSON files are committed in Task 12, with the code that reads them.

## Phase 2: Platform registry

### Task 3: Registry tables

**Files:**
- Create: `packages/db/src/schema/directory-places.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0075_directory_places.sql`, `packages/db/migrations/0076_directory_places_grants.sql`

- [ ] **Step 1: Schema**

```ts
// packages/db/src/schema/directory-places.ts
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";

const PLACE_ID = "^[23456789abcdefghjkmnpqrstuvwxyz]{7}$";
const SLUG = "^[a-z0-9]+(-[a-z0-9]+)*$";
const LISTING_KEY = "^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$";

/** Where a directory business came from. A client that takes over an open-data business keeps that row. */
export const directoryPlaceOrigin = pgEnum("directory_place_origin", ["open_data", "client", "added"]);

/**
 * One business in the /in directory, for good. Its id is the last part of its URL, /in/mh/<city>/business/<slug>/<id>,
 * and never changes. city_slug and url_slug are the URL's label: free while an owner-added business awaits approval
 * (url_locked_at null), frozen once its page is live, and then changed only by changePlaceUrl (staff, audited in
 * directory_place_url_changes). The page is found by id; a stale label 301s to this one.
 */
export const directoryPlaces = pgTable(
  "directory_places",
  {
    id: text("id").primaryKey(),
    origin: directoryPlaceOrigin("origin").notNull(),
    /** "overture:<id>" / "osm:<type/id>" for an open-data business, from the dataset ledger. */
    sourceRef: text("source_ref").unique("directory_places_source_ref_key"),
    stateCode: text("state_code").notNull(),
    citySlug: text("city_slug").notNull(),
    urlSlug: text("url_slug").notNull(),
    urlLockedAt: timestamp("url_locked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "directory_places_id_check",
      sql`${table.id} ~ ${sql.raw(`'${PLACE_ID}'`)} and ${table.id} ~ '[2-9]'`,
    ),
    check(
      "directory_places_origin_id_check",
      sql`(${table.origin} = 'open_data') = (${table.id} ~ '^[a-z]') or ${table.origin} = 'client'`,
    ),
    check("directory_places_state_code_check", sql`${table.stateCode} ~ '^[a-z]{2}$'`),
    check("directory_places_city_slug_check", sql`${table.citySlug} ~ ${sql.raw(`'${SLUG}'`)}`),
    check(
      "directory_places_url_slug_check",
      sql`${table.urlSlug} ~ ${sql.raw(`'${SLUG}'`)} and char_length(${table.urlSlug}) <= 70`,
    ),
  ],
);

/**
 * The /in/<service>/mh/<city>/<area>/<slug> addresses businesses had before ids, as <service>/<city>/<area>/<slug>.
 * Frozen at cutover: used to backfill place_id and to 301 old links forever. Nothing new is ever added.
 */
export const directoryPlaceLegacyKeys = pgTable(
  "directory_place_legacy_keys",
  {
    listingKey: text("listing_key").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => directoryPlaces.id),
  },
  (table) => [
    index("directory_place_legacy_keys_place_id_idx").on(table.placeId),
    check(
      "directory_place_legacy_keys_listing_key_check",
      sql`char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY}'`)}`,
    ),
  ],
);

/** Every staff change to a live business's URL: who, when, from what, to what, and why. */
export const directoryPlaceUrlChanges = pgTable(
  "directory_place_url_changes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    placeId: text("place_id")
      .notNull()
      .references(() => directoryPlaces.id),
    fromCitySlug: text("from_city_slug").notNull(),
    fromUrlSlug: text("from_url_slug").notNull(),
    toCitySlug: text("to_city_slug").notNull(),
    toUrlSlug: text("to_url_slug").notNull(),
    reason: text("reason").notNull(),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("directory_place_url_changes_place_id_idx").on(table.placeId, table.changedAt),
    check("directory_place_url_changes_reason_check", sql`char_length(${table.reason}) between 3 and 300`),
  ],
);
```

Read `schema/directory-reviews.ts` for how `users` is imported (`hidden_by_user_id`) and copy that import path.

The `origin_id` CHECK encodes the rule: an `open_data` row has a letter-first ID and an `added` row a digit-first ID. A `client` row may have either, because a client can take over an open-data business.

Add `export * from "./directory-places";` to `schema/index.ts`.

- [ ] **Step 2: Generate** with `pnpm --filter @fynix/db db:generate`. Rename the output to `0075_directory_places.sql`, fix the tag in `migrations/meta/_journal.json`, and add a header comment like 0056's.

- [ ] **Step 3: Grants**

```sql
-- packages/db/migrations/0076_directory_places_grants.sql
-- Grants and row-level security for directory places (0075), in the pattern of 0057. Every directory reader and
-- writer runs on the staff connection (the /api/directory/* routes, the feed, the staff console, listing-account
-- server code), so only fynix_staff gets access. The customer role (fynix_app) gets nothing: a business URL is
-- never the customer's to change.
GRANT SELECT, INSERT, UPDATE ON directory_places TO fynix_staff;
--> statement-breakpoint
GRANT SELECT, INSERT ON directory_place_legacy_keys TO fynix_staff;
--> statement-breakpoint
GRANT SELECT, INSERT ON directory_place_url_changes TO fynix_staff;
--> statement-breakpoint
ALTER TABLE directory_places ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE directory_place_legacy_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE directory_place_url_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY directory_places_staff_all ON directory_places FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY directory_place_legacy_keys_staff_all ON directory_place_legacy_keys FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY directory_place_url_changes_staff_all ON directory_place_url_changes FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
```

Before writing it, run `grep -n "getStaffDb\|getAppDb\|withTenantScope" apps/platform/lib/server/listing-account.ts` and confirm the owner-side code runs on the staff connection. If it uses `fynix_app`, **stop and ask**: owner code must not get UPDATE on `directory_places`.

- [ ] **Step 4: Run** `pnpm db:migrate:test && pnpm --filter @fynix/db typecheck`: clean.
- [ ] **Step 5: Commit** (only if the user asked).

### Task 4: Place queries

**Files:**
- Create: `packages/db/src/queries/directory-places.ts`
- Test: `packages/db/src/directory-places.integration.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/db/src/directory-places.integration.test.ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  changePlaceUrl,
  createPlatformPlace,
  findPlaces,
  importOpenDataPlaces,
  lockPlaceUrl,
  PlaceUrlLockedError,
  resolveLegacyKeys,
  updatePendingPlaceUrl,
} from "./queries/directory-places";
import { directoryPlaceUrlChanges, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const STAFF = "staff-1";
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs.close();
});
beforeEach(async () => {
  await resetTestDatabase(dbs);
  await dbs.staff.db.insert(users).values({ id: STAFF, email: "staff@fynix.digital", name: "Staff" });
});

describe("importOpenDataPlaces", () => {
  it("creates locked open-data places with their legacy keys, and is idempotent", async () => {
    const rows = [
      { sourceRef: "osm:node/1", id: "k7m2q9a", citySlug: "thane", urlSlug: "smile-dental", legacyKey: "dentists/thane/naupada/smile-dental" },
      { sourceRef: "overture:abc", id: "b3cdefg", citySlug: "thane", urlSlug: "iron-gym", legacyKey: null },
    ];
    expect(await importOpenDataPlaces(dbs.staff.db, rows, NOW)).toEqual({ created: 2, unchanged: 0 });
    expect(await importOpenDataPlaces(dbs.staff.db, rows, NOW)).toEqual({ created: 0, unchanged: 2 });

    const places = await findPlaces(dbs.staff.db, ["k7m2q9a"]);
    expect(places.get("k7m2q9a")).toMatchObject({ origin: "open_data", citySlug: "thane", urlSlug: "smile-dental" });
    expect(places.get("k7m2q9a")?.urlLockedAt).not.toBeNull();
    expect((await resolveLegacyKeys(dbs.staff.db, ["dentists/thane/naupada/smile-dental"])).get(
      "dentists/thane/naupada/smile-dental",
    )).toBe("k7m2q9a");
  });

  it("never changes an imported place's URL even if the ledger row differs", async () => {
    await importOpenDataPlaces(dbs.staff.db, [{ sourceRef: "osm:node/1", id: "k7m2q9a", citySlug: "thane", urlSlug: "smile-dental", legacyKey: null }], NOW);
    await expect(
      importOpenDataPlaces(dbs.staff.db, [{ sourceRef: "osm:node/1", id: "k7m2q9a", citySlug: "thane", urlSlug: "other", legacyKey: null }], NOW),
    ).rejects.toThrow(/ledger/);
  });
});

describe("platform places", () => {
  it("creates a digit-first id, editable until locked", async () => {
    const id = await dbs.staff.db.transaction((tx) => createPlatformPlace(tx, { origin: "added", citySlug: "thane", urlSlug: "new-cafe" }, NOW));
    expect(id).toMatch(/^[2-9]/);
    await dbs.staff.db.transaction((tx) => updatePendingPlaceUrl(tx, id, { citySlug: "thane", urlSlug: "new-cafe-and-bakery" }, NOW));
    await dbs.staff.db.transaction((tx) => lockPlaceUrl(tx, id, NOW));
    await expect(
      dbs.staff.db.transaction((tx) => updatePendingPlaceUrl(tx, id, { citySlug: "thane", urlSlug: "sneaky-keywords" }, NOW)),
    ).rejects.toBeInstanceOf(PlaceUrlLockedError);
    expect((await findPlaces(dbs.staff.db, [id])).get(id)?.urlSlug).toBe("new-cafe-and-bakery");
  });
});

describe("changePlaceUrl", () => {
  it("lets staff change a locked URL and records who, why and what", async () => {
    await importOpenDataPlaces(dbs.staff.db, [{ sourceRef: "osm:node/1", id: "k7m2q9a", citySlug: "thane", urlSlug: "smile-dental", legacyKey: null }], NOW);
    await dbs.staff.db.transaction((tx) =>
      changePlaceUrl(tx, "k7m2q9a", { citySlug: "thane", urlSlug: "smile-dental-implant-centre" }, { staffUserId: STAFF, reason: "Rebranded" }, NOW),
    );
    expect((await findPlaces(dbs.staff.db, ["k7m2q9a"])).get("k7m2q9a")?.urlSlug).toBe("smile-dental-implant-centre");
    const log = await dbs.staff.db.select().from(directoryPlaceUrlChanges).where(eq(directoryPlaceUrlChanges.placeId, "k7m2q9a"));
    expect(log).toEqual([expect.objectContaining({ fromUrlSlug: "smile-dental", toUrlSlug: "smile-dental-implant-centre", reason: "Rebranded", changedByUserId: STAFF })]);
  });
});
```

Copy the test-DB handle names (`dbs.staff.db`, `dbs.close()`) and the minimal `users` row from `src/directory-listings.integration.test.ts`.

- [ ] **Step 2: Run them and watch them fail**: `pnpm --filter @fynix/db test:integration -- directory-places`.

- [ ] **Step 3: Implement**

```ts
// packages/db/src/queries/directory-places.ts
import { newPlatformPlaceId } from "@fynix/shared/directory/place-id";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { directoryPlaceLegacyKeys, directoryPlaces, directoryPlaceUrlChanges } from "../schema";

type Executor = Pick<Database, "select" | "insert" | "update">;
export type DirectoryPlaceOrigin = "open_data" | "client" | "added";

export interface DirectoryPlace {
  readonly id: string;
  readonly origin: DirectoryPlaceOrigin;
  readonly stateCode: string;
  readonly citySlug: string;
  readonly urlSlug: string;
  readonly urlLockedAt: Date | null;
}

export interface PlaceUrl {
  readonly citySlug: string;
  readonly urlSlug: string;
}

export interface OpenDataPlaceRow extends PlaceUrl {
  readonly sourceRef: string;
  readonly id: string;
  readonly legacyKey: string | null;
}

/** The only state the directory covers today; the URL's /mh/ segment. */
const STATE_CODE = "mh";

export class PlaceUrlLockedError extends Error {
  constructor(readonly placeId: string) {
    super(`Directory place ${placeId} is live; its URL can only be changed by staff`);
    this.name = "PlaceUrlLockedError";
  }
}

export class UnknownPlaceError extends Error {
  constructor(readonly placeId: string) {
    super(`No directory place ${placeId}`);
    this.name = "UnknownPlaceError";
  }
}

const PLACE_COLUMNS = {
  id: directoryPlaces.id,
  origin: directoryPlaces.origin,
  stateCode: directoryPlaces.stateCode,
  citySlug: directoryPlaces.citySlug,
  urlSlug: directoryPlaces.urlSlug,
  urlLockedAt: directoryPlaces.urlLockedAt,
};

export async function findPlaces(db: Executor, ids: readonly string[]): Promise<ReadonlyMap<string, DirectoryPlace>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select(PLACE_COLUMNS).from(directoryPlaces).where(inArray(directoryPlaces.id, unique));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Old <service>/<city>/<area>/<slug> keys -> place id; unknown keys are absent. */
export async function resolveLegacyKeys(db: Executor, keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ listingKey: directoryPlaceLegacyKeys.listingKey, placeId: directoryPlaceLegacyKeys.placeId })
    .from(directoryPlaceLegacyKeys)
    .where(inArray(directoryPlaceLegacyKeys.listingKey, unique));
  return new Map(rows.map((row) => [row.listingKey, row.placeId]));
}

/**
 * Loads the dataset ledger. Open-data places are created already locked: their URL went live with the dataset.
 * An existing place is left alone, except that a ledger row disagreeing with it is an error (the ledger is
 * append-only, so a difference means it was edited by hand).
 */
export async function importOpenDataPlaces(
  db: Database,
  rows: readonly OpenDataPlaceRow[],
  now: Date,
): Promise<{ readonly created: number; readonly unchanged: number }> {
  let created = 0;
  let unchanged = 0;
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    await db.transaction(async (tx) => {
      const known = await findPlaces(tx, batch.map((row) => row.id));
      const fresh = batch.filter((row) => {
        const place = known.get(row.id);
        if (place === undefined) return true;
        if (place.citySlug !== row.citySlug || place.urlSlug !== row.urlSlug) {
          throw new Error(`Place ${row.id} differs from the ledger (${place.citySlug}/${place.urlSlug}); the ledger is append-only`);
        }
        unchanged += 1;
        return false;
      });
      if (fresh.length === 0) return;
      await tx.insert(directoryPlaces).values(
        fresh.map((row) => ({
          id: row.id,
          origin: "open_data" as const,
          sourceRef: row.sourceRef,
          stateCode: STATE_CODE,
          citySlug: row.citySlug,
          urlSlug: row.urlSlug,
          urlLockedAt: now,
          createdAt: now,
          updatedAt: now,
        })),
      );
      const legacy = fresh.flatMap((row) => (row.legacyKey === null ? [] : [{ listingKey: row.legacyKey, placeId: row.id }]));
      if (legacy.length > 0) await tx.insert(directoryPlaceLegacyKeys).values(legacy).onConflictDoNothing();
      created += fresh.length;
    });
  }
  return { created, unchanged };
}

/** A new business made on the platform. Unlocked: lockPlaceUrl freezes it when its page goes live. */
export async function createPlatformPlace(
  tx: Executor,
  input: PlaceUrl & { readonly origin: "client" | "added" },
  now: Date,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newPlatformPlaceId();
    const inserted = await tx
      .insert(directoryPlaces)
      .values({ id, origin: input.origin, stateCode: STATE_CODE, citySlug: input.citySlug, urlSlug: input.urlSlug, urlLockedAt: null, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: directoryPlaces.id })
      .returning({ id: directoryPlaces.id });
    if (inserted[0] !== undefined) return inserted[0].id;
  }
  throw new Error("Could not find a free directory place id in 5 tries");
}

/** While a business awaits approval its owner may still change its URL; afterwards this refuses. */
export async function updatePendingPlaceUrl(tx: Executor, placeId: string, url: PlaceUrl, now: Date): Promise<void> {
  const updated = await tx
    .update(directoryPlaces)
    .set({ citySlug: url.citySlug, urlSlug: url.urlSlug, updatedAt: now })
    .where(and(eq(directoryPlaces.id, placeId), isNull(directoryPlaces.urlLockedAt)))
    .returning({ id: directoryPlaces.id });
  if (updated[0] === undefined) {
    const exists = (await findPlaces(tx, [placeId])).has(placeId);
    throw exists ? new PlaceUrlLockedError(placeId) : new UnknownPlaceError(placeId);
  }
}

/** The page goes live: its URL is frozen from now on. Locking twice keeps the first time. */
export async function lockPlaceUrl(tx: Executor, placeId: string, now: Date): Promise<void> {
  await tx
    .update(directoryPlaces)
    .set({ urlLockedAt: now, updatedAt: now })
    .where(and(eq(directoryPlaces.id, placeId), isNull(directoryPlaces.urlLockedAt)));
}

/** Staff only: change a live business's URL (a rebrand, a move to another city). The old URL 301s by id. */
export async function changePlaceUrl(
  tx: Executor,
  placeId: string,
  url: PlaceUrl,
  by: { readonly staffUserId: string; readonly reason: string },
  now: Date,
): Promise<void> {
  const place = (await findPlaces(tx, [placeId])).get(placeId);
  if (place === undefined) throw new UnknownPlaceError(placeId);
  if (place.citySlug === url.citySlug && place.urlSlug === url.urlSlug) return;
  await tx.update(directoryPlaces).set({ citySlug: url.citySlug, urlSlug: url.urlSlug, updatedAt: now }).where(eq(directoryPlaces.id, placeId));
  await tx.insert(directoryPlaceUrlChanges).values({
    placeId,
    fromCitySlug: place.citySlug,
    fromUrlSlug: place.urlSlug,
    toCitySlug: url.citySlug,
    toUrlSlug: url.urlSlug,
    reason: by.reason,
    changedByUserId: by.staffUserId,
    changedAt: now,
  });
}
```

Match the shared import path to how `@fynix/db` already imports from `@fynix/shared`. Run `grep -rn "@fynix/shared" packages/db/src | head -3`. If `@fynix/db` must not depend on `@fynix/shared` (check `packages/db/package.json`), move `place-id.ts` to `packages/db/src/place-id.ts` and have `shared` re-export it instead.

Export the functions and errors from `packages/db/src/index.ts`.

- [ ] **Step 4: Run** the tests: PASS.
- [ ] **Step 5: Commit** (only if the user asked).

### Task 5: Import script

**Files:** create `packages/db/scripts/import-directory-places.ts`; add `"directory:import-places": "tsx scripts/import-directory-places.ts"` to `packages/db/package.json` and `"directory:import-places": "pnpm --filter @fynix/db directory:import-places"` to the root `package.json`.

- [ ] **Step 1: Implement**

```ts
// packages/db/scripts/import-directory-places.ts
import { readFileSync } from "node:fs";
import { importOpenDataPlaces, type OpenDataPlaceRow } from "../src/queries/directory-places";

const PLACE_ID = /^[a-z][23456789abcdefghjkmnpqrstuvwxyz]{6}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SOURCE = /^(overture|osm):[A-Za-z0-9/_.-]{1,120}$/;

function parseLedger(text: string): OpenDataPlaceRow[] {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null) throw new Error("ledger is not an object");
  return Object.entries(raw as Record<string, unknown>).map(([sourceRef, value]) => {
    const entry = value as { id?: unknown; city?: unknown; slug?: unknown; legacyKey?: unknown };
    if (!SOURCE.test(sourceRef)) throw new Error(`bad source ref ${sourceRef}`);
    if (typeof entry.id !== "string" || !PLACE_ID.test(entry.id) || !/[2-9]/.test(entry.id)) throw new Error(`bad id for ${sourceRef}`);
    if (typeof entry.city !== "string" || !SLUG.test(entry.city)) throw new Error(`bad city for ${sourceRef}`);
    if (typeof entry.slug !== "string" || !SLUG.test(entry.slug) || entry.slug.length > 70) throw new Error(`bad slug for ${sourceRef}`);
    if (entry.legacyKey !== undefined && typeof entry.legacyKey !== "string") throw new Error(`bad legacyKey for ${sourceRef}`);
    return { sourceRef, id: entry.id, citySlug: entry.city, urlSlug: entry.slug, legacyKey: entry.legacyKey ?? null };
  });
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (file === undefined) throw new Error("Usage: pnpm directory:import-places <path to thane-place-ledger.json>");
  const rows = parseLedger(readFileSync(file, "utf8"));
  // Open the staff connection the way the other scripts in packages/db/scripts do (read setup-roles.ts / migrate.ts).
  const { db, close } = await openStaffConnection();
  try {
    const result = await importOpenDataPlaces(db, rows, new Date());
    console.log(`directory places: ${result.created} created, ${result.unchanged} unchanged, from ${rows.length} ledger rows`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

Write `openStaffConnection` inline by copying how `scripts/migrate.ts` opens its connection: the same env loading and the same client constructor, but using the staff URL. Don't add a dependency.

- [ ] **Step 2: Run against the local dev DB:** `pnpm directory:import-places ../local-directory-data/thane/thane-place-ledger.json`. Expected: `32128 created, 0 unchanged`. Run it again and expect `0 created, 32128 unchanged`.
- [ ] **Step 3: Commit** (only if the user asked).

## Phase 3: place_id on every table (expand)

### Task 6: Columns and backfill

**Files:**
- Create: `packages/db/migrations/0077_directory_place_ids.sql`
- Modify: the schema files for the 10 tables
- Create: `packages/db/scripts/backfill-directory-places.ts` (+ root script `directory:backfill-places`)
- Test: `packages/db/src/directory-place-backfill.integration.test.ts`

Tables: `directory_listings`, `directory_reviews`, `directory_review_otps`, `directory_enquiries`, `directory_verifications`, `directory_daily_counts`, `directory_claims`, `directory_staff_ads`, `directory_ad_bids`, `directory_ad_wins`.

- [ ] **Step 1: Schema.** Add `placeId: text("place_id").references(() => directoryPlaces.id)` (nullable) to each table. In the same migration, **drop NOT NULL on each `listing_key`** so writes made after cutover (by ID) need no key. Generate the migration, rename it to `0077_directory_place_ids.sql`, then append:

```sql
--> statement-breakpoint
CREATE INDEX directory_reviews_place_id_idx ON directory_reviews (place_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX directory_reviews_place_id_phone_idx ON directory_reviews (place_id, phone) WHERE place_id IS NOT NULL AND status = 'published';
--> statement-breakpoint
CREATE INDEX directory_enquiries_place_id_idx ON directory_enquiries (place_id);
--> statement-breakpoint
CREATE UNIQUE INDEX directory_verifications_place_id_idx ON directory_verifications (place_id) WHERE place_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX directory_daily_counts_place_day_kind_idx ON directory_daily_counts (place_id, day, kind) WHERE place_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX directory_claims_place_id_idx ON directory_claims (place_id);
--> statement-breakpoint
CREATE UNIQUE INDEX directory_claims_place_id_approved_idx ON directory_claims (place_id) WHERE place_id IS NOT NULL AND status = 'approved';
--> statement-breakpoint
CREATE UNIQUE INDEX directory_listings_place_id_idx ON directory_listings (place_id) WHERE place_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX directory_ad_wins_place_id_idx ON directory_ad_wins (place_id);
```

The backfill runs as a script, not SQL, because platform IDs are generated in TypeScript. The partial unique indexes are created **before** the backfill, so the backfill must dedupe as it goes (Step 3). The published-only unique index on reviews keeps a hidden review from blocking a new one, which matches the current "re-review replaces" behaviour.

- [ ] **Step 2: Pre-flight on production (read-only).** Run from the droplet and paste the output into the PR:

```sql
select 'reviews on >1 key per phone that will meet' as check, count(*) from (
  select phone from directory_reviews group by phone having count(distinct listing_key) > 1) x
union all select 'client listings with replaces_source_path', count(*) from directory_listings where replaces_source_path is not null
union all select 'client listings with previous paths', count(*) from directory_listings where cardinality(previous_paths) > 0
union all select 'approved claims', count(*) from directory_claims where status = 'approved';
```

- [ ] **Step 3: Backfill script.** Run it once, after `directory:import-places`. In one transaction:
  1. **Client listings.** For each `directory_listings` row:
     - Find the open-data place for its `replaces_source_path` (convert `/in/a/mh/b/c/d` to `a/b/c/d`, then `resolveLegacyKeys`).
     - If one exists, set its `origin = 'client'` and **use it**: the client takes over that business's ID. If the client's current address has no legacy row, insert one for it.
     - Otherwise, `createPlatformPlace({ origin: "client", citySlug: row.citySlug, urlSlug: row.slug })`, then `lockPlaceUrl`.
     - Insert legacy keys for the current address and every `previous_paths` entry, with `on conflict do nothing`.
     - Set `directory_listings.place_id`.
  2. **Owner-added claims** (`origin = 'added'`).
     - If the claim's key resolves to a legacy key, use that place.
     - Otherwise `createPlatformPlace({ origin: "added", citySlug, urlSlug: slug part of the key })`. Lock it if the claim is approved, and insert the claim's key as a legacy key.
  3. **Every data table**, by SQL `UPDATE`:

```sql
UPDATE directory_reviews t SET place_id = k.place_id FROM directory_place_legacy_keys k WHERE k.listing_key = t.listing_key AND t.place_id IS NULL;
```

     Run the same `UPDATE` for the other eight tables. For reviews and daily counts, first delete the rows that would break the new unique indexes:
     - **Reviews:** where two published reviews from one phone land on one place, keep the newest `updated_at` and set the other to `status = 'hidden', hidden_at = now()`.
     - **Daily counts:** where two `(day, kind)` rows land on one place, add the counts into the newer row and delete the other.
     - **Verifications:** keep the latest `verified_at` and delete the other. Verifications are staff notes, and 0057 allows deletes.
     - **Approved claims:** if two approved claims land on one place, **abort and print both**. Staff must resolve it.
  4. **Print** counts per table: rows backfilled, and rows left with a NULL `place_id`. A key with no legacy row is a dead or renumbered open-data URL. Print up to 50 such keys.

- [ ] **Step 4: Test the backfill.** In `src/directory-place-backfill.integration.test.ts`:
  1. Import two open-data places, A at legacy key `dentists/thane/naupada/smile-dental`, and B.
  2. Insert a client listing whose `replaces_source_path` is A's URL, at its own key `dentists/thane/naupada/smile-dental-clinic`, with one `previous_paths` entry.
  3. Insert reviews at A's key, at the client's key and at the previous path. Two of them come from the same phone.
  4. Run the exported `backfillDirectoryPlaces(db, now)`, which the script calls.
  5. Assert:
     - `directory_listings.place_id` = A;
     - all three reviews have `place_id` A;
     - the older same-phone review is hidden;
     - B is untouched;
     - running the backfill again changes nothing.
- [ ] **Step 5: Run** `pnpm db:migrate:test && pnpm --filter @fynix/db test:integration`: all green.
- [ ] **Step 6: Commit** (only if the user asked).

### Task 7: The directory API accepts IDs (and keys, during the switch)

**Files:** `apps/platform/app/api/directory/{ratings,reviews,status,signals,events,enquiries,pictures,ads}/route.ts` and the query functions they call.

**Rule:** every route reads `ids` (comma-separated, `isPlaceId`, max 50) and, during the switch, `keys`. Keys become IDs through `resolveLegacyKeys`. Responses are keyed by **what was asked**, so an old website gets key-keyed maps and a new one gets ID-keyed maps.

- [ ] **Step 1: Failing tests.** For each route there is a test file next to it (`ls apps/platform/app/api/directory/*/`); if not, the tested query lives in `packages/db`. Add:
  - asking by `ids=k7m2q9a` returns that place's data keyed `k7m2q9a`;
  - asking by `keys=dentists/thane/naupada/smile-dental` returns the same data keyed by the key;
  - asking with an invalid ID returns 400.
- [ ] **Step 2: Implement reads by place.** Each query function takes `placeIds: readonly string[]` and filters on `place_id`:
  - `readDirectoryRatings` (`queries/directory.ts:79-125`): change `where status = 'published' and listing_key in (...)` to `place_id in (...)` and select `place_id` where it selected `listing_key`;
  - `listPublishedDirectoryReviews` (:171-178);
  - `readDirectoryStatuses` (:703-719);
  - `readDirectorySignals` (:909-939);
  - `readLiveDirectoryPictures` (`queries/directory-pictures.ts:349-356`): join claims on `place_id`;
  - `readClaimedWebsites` (`queries/directory-ads.ts:483-494`);
  - `sumListingInterest` (:1511-1523).

  The route maps asked keys to IDs and back.
- [ ] **Step 3: Implement writes by place.** Each write takes a `placeId`, checks it exists with `findPlaces`, and stores `place_id`:
  - review OTP and confirm (`queries/directory.ts`, insert at :355);
  - enquiry;
  - event (daily counts: `on conflict (place_id, day, kind) where place_id is not null do update set count = count + 1`, replacing the current key-based conflict target);
  - verification upsert (:777, conflict on the `place_id` partial index);
  - claim sign-up (`createListingAccountBusiness`, `queries/directory-ads.ts:141-161`);
  - staff ad;
  - ad bid (the claim's `place_id`);
  - ad win (copy the bid's `place_id`).

  During the switch, also fill `listing_key` when the request came with a key.
- [ ] **Step 4: Fix the lookups that matched addresses:**
  - `findListingOwner` (:523-575): `directory_listings where place_id = $1`, else `directory_claims where place_id = $1 and status = 'approved'`. This removes the state-less match and the `limit 1` guess.
  - `ineligibleBusinesses` (:1094-1102) and the live-ads check (:1395-1400): `win.place_id = claim.place_id`.
  - The promotions CTE (`queries/directory-promotions.ts:265-297`): join `directory_listings.place_id`, and drop the `previous_paths` unnest and its collision.
  - The client Listing page enquiries (`apps/platform/app/app-host/(protected)/listing/page.tsx:121-125`): by the listing's `place_id`.
- [ ] **Step 5: Run** `pnpm test && pnpm test:integration && pnpm typecheck` from the platform root: green.
- [ ] **Step 6: Commit** (only if the user asked).

## Phase 4: Locking and staff URL changes

### Task 8: URLs lock when the page goes live; owners can't touch them

**Files:**
- `packages/db/src/queries/directory-listings.ts` (`saveListingPlacement` :139-178)
- `packages/db/src/queries/directory-ads.ts` (`addBusinessListing` :269-292, `updateAddedBusinessListing` :305-325, `renameAddedBusiness` :332-343, `decideDirectoryClaim` :758-772)
- their integration tests
- `apps/platform/lib/server/listing-account.ts:268-286`

- [ ] **Step 1: Failing tests:**
  - `addBusinessListing` creates an **unlocked** `added` place with `urlSlug = url_name(name)` and the chosen city.
  - `updateAddedBusinessListing` before approval updates the place's city and slug.
  - Approving the claim (`decideDirectoryClaim` → approved) **locks** the place.
  - After approval, `renameAddedBusiness` changes the display name and **leaves `url_slug` unchanged**.
  - An owner request that includes `urlSlug` or `citySlug` after approval is rejected by the zod schema in `listing-account.ts` (an unknown key fails `.strict()`).
  - `saveListingPlacement` on a new client either takes over the chosen open-data place (staff pass `takeOverPlaceId`) or creates a client place, and **locks** it immediately.
  - `saveListingPlacement` moving area or category leaves the URL unchanged.
- [ ] **Step 2: Run them**; expected FAIL.
- [ ] **Step 3: Implement.**
  - `ListingPlacementInput` gains `takeOverPlaceId: string | null`, which replaces `replacesSourcePath` once the admin form sends it. Keep `replacesSourcePath` during the switch and resolve it with `resolveLegacyKeys`.
  - **Remove `slug` from what decides the URL.** For a client listing, `directory_listings.slug` stays as the legacy column until Phase 6. The URL comes from `directory_places`.
  - Owner-side zod schemas in `apps/platform/lib/server/listing-account.ts`: use `.strict()`, so `urlSlug` / `citySlug` / `slug` are rejected at the boundary. The owner UI never had these fields; this makes the boundary refuse them too.
- [ ] **Step 4: Run** the tests: PASS.
- [ ] **Step 5: Commit** (only if the user asked).

### Task 9: Staff "Change web address"

**Files:**
- `apps/admin/app/(protected)/clients/[businessId]/actions.ts` (next to `saveListingPlacementAction` :275-293)
- the client page's listing section
- the directory claims page under `apps/admin/app/(protected)/directory/`

- [ ] **Step 1: Failing test** in the admin actions test file (`ls apps/admin/app/\(protected\)/clients/\[businessId\]/*.test.ts`). `changeWebAddressAction` with a reason under 3 characters returns a field error. With a valid slug and reason, it calls `changePlaceUrl` and returns the new URL. A non-staff session is refused, matching how the neighbouring actions check staff.
- [ ] **Step 2: Implement** the server action. Validate with zod: `urlSlug` must be a slug of at most 70 characters, `citySlug` must be one of the known cities, and `reason` must be 3–300 characters. Call `changePlaceUrl` on the staff DB and revalidate the page.

  UI: a "Web address" row shows the current full URL and a "Change web address" button. It opens a small form with the name part, the city and a required reason, plus this warning: "Old links keep working — they redirect here."
- [ ] **Step 3: Run** `pnpm --filter @fynix/admin test && pnpm --filter @fynix/admin typecheck && pnpm --filter @fynix/admin lint`: green.
- [ ] **Step 4: Verify in the browser** on the local admin. Change a test business's address, then `curl -sI` the old public URL and expect a `301` to the new one.
- [ ] **Step 5: Commit** (only if the user asked).

## Phase 5: Feed and website

### Task 10: The feed carries the ID and the locked URL

**Files:** `packages/shared/src/lib/directory/feed-contract.ts:37-78`, `packages/shared/src/lib/directory/feed.ts:61-134`, and the feed's test.

- [ ] **Step 1: Failing test:** a feed listing serialises `id`, `url: { city, slug }` and `legacyKeys: string[]` (from `directory_place_legacy_keys` for that place). The same goes for added businesses.
- [ ] **Step 2: Implement.** Add these fields to `DirectoryFeedListing` and `DirectoryFeedAddedListing`, with doc comments:

```ts
  /** Permanent id: the last part of the business's URL. */
  readonly id: string;
  /** The URL's locked label: /in/mh/<city>/business/<slug>/<id>. */
  readonly url: { readonly city: string; readonly slug: string };
  /** Pre-id addresses (<service>/<city>/<area>/<slug>) that 301 here. */
  readonly legacyKeys: readonly string[];
```

  Keep `address`, `previousAddresses` and `replacesSourcePath` until Phase 6, so a website not yet updated keeps working. Keep `version: 1`; the new fields are additive.
- [ ] **Step 3: Run** `pnpm --filter @fynix/shared test && pnpm typecheck`: green.
- [ ] **Step 4: Commit** (only if the user asked).

### Task 11: Website URL helpers

**Files:** create `website-listing/lib/place-id.ts` and `website-listing/lib/place-id.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// website-listing/lib/place-id.test.ts
import { describe, expect, it } from "vitest";
import { businessPath, isPlaceId, parseBusinessPath } from "./place-id";

describe("business paths", () => {
  it("builds /in/mh/<city>/business/<slug>/<id>", () => {
    expect(businessPath({ id: "k7m2q9a", urlCity: "thane", urlSlug: "smile-dental" })).toBe("/in/mh/thane/business/smile-dental/k7m2q9a");
  });

  it("reads the id from a business path and ignores everything else", () => {
    expect(parseBusinessPath(["mh", "thane", "business", "anything", "k7m2q9a"])).toEqual({ id: "k7m2q9a" });
    expect(parseBusinessPath(["mh", "thane", "naupada", "dentists", "x"])).toBeNull();
    expect(parseBusinessPath(["dentists", "mh", "thane", "naupada", "smile"])).toBeNull();
    expect(parseBusinessPath(["mh", "thane", "business", "smile", "naupada"])).toBeNull();
  });

  it("validates ids like the platform", () => {
    expect(isPlaceId("k7m2q9a")).toBe(true);
    expect(isPlaceId("abcdefg")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// website-listing/lib/place-id.ts
/**
 * A directory business's URL, /in/mh/<city>/business/<slug>/<id>. The id (7 characters, from the platform's
 * packages/shared/src/lib/directory/place-id.ts; copied here as lib/directory-feed.ts copies the feed contract) finds
 * the business; city and slug are a label frozen when the page went live, so a stale one 301s to the current URL.
 */
import { DIRECTORY_ROOT, STATE_CODE } from "@/lib/local-directory";

const ID_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{7}$/;
export const BUSINESS_SEGMENT = "business";

export function isPlaceId(value: string): boolean {
  return ID_PATTERN.test(value) && /[2-9]/.test(value);
}

export interface BusinessUrlParts {
  readonly id: string;
  readonly urlCity: string;
  readonly urlSlug: string;
}

export function businessPath({ id, urlCity, urlSlug }: BusinessUrlParts): string {
  return `${DIRECTORY_ROOT}/${STATE_CODE}/${urlCity}/${BUSINESS_SEGMENT}/${urlSlug}/${id}`;
}

/** The id in the segments after /in, when they are a business URL; the city and slug are not trusted. */
export function parseBusinessPath(segments: readonly string[]): { readonly id: string } | null {
  const [state, , marker, , id, ...rest] = segments;
  if (state !== STATE_CODE || marker !== BUSINESS_SEGMENT || rest.length > 0 || id === undefined) return null;
  return isPlaceId(id) ? { id } : null;
}
```

Confirm `DIRECTORY_ROOT` and `STATE_CODE` are exported from `lib/local-directory.ts`. They are used in `directoryPath` (:132-147); if they aren't exported, export them.
- [ ] **Step 3: Run** `pnpm vitest run lib/place-id.test.ts`: PASS.

### Task 12: Website listings carry IDs; routes serve the new URL and 301 the old one

**Files:**
- `lib/server/local-listings.ts` (row schema :57-88, `findBusiness` :294, `movedBusinessPath` :150)
- `lib/directory-feed.ts`
- `app/(marketing)/in/[first]/[second]/[third]/page.tsx`
- `app/(marketing)/in/[first]/[second]/[third]/[fourth]/[fifth]/page.tsx`
- the 9 link sites listed in section 3
- `content/local/thane-listings.json`, `content/local/thane-legacy-urls.json` (generated in Task 2)

- [ ] **Step 1: Failing tests**, in `lib/server/local-listings.test.ts` (create it if missing):
  - `findBusinessById("k7m2q9a")` returns the static row with that ID;
  - a platform listing with the same ID as a static row hides the static row (client takeover);
  - `legacyBusinessId("dentists/thane/naupada/smile-dental")` returns the ID, from `thane-legacy-urls.json` for static rows and from the feed's `legacyKeys` for platform rows;
  - `legacyBusinessId` of an unknown key returns `undefined`.
- [ ] **Step 2: Implement the data layer.**
  - `rowSchema` becomes the 12-tuple: replace the slug element with `z.string().refine(isPlaceId)`, `slugSchema` (urlCity) and `slugSchema` (urlSlug).
  - `Listing` gains `id`, `urlCity` and `urlSlug`, and **loses `slug`**. Fix every compile error that follows: they are exactly the places that built keys or paths from `slug`.
  - Ratings, statuses, signals and reviews maps are keyed by `listing.id` (`lib/directory-ratings.ts`: replace `listingKey` with `listing.id`; delete `listingKey` once nothing uses it).
  - `mergeFeed`:
    - each feed listing becomes a `Listing` with `id`, `urlCity: entry.url.city` and `urlSlug: entry.url.slug`;
    - a static row whose `id` equals a platform listing's `id` is hidden (`hiddenIds`), replacing the `replacesSourcePath` hiding;
    - the legacy map merges `thane-legacy-urls.json` with every feed entry's `legacyKeys`;
    - `previousAddresses` handling is removed.
- [ ] **Step 3: Implement the routes.**

  `[fifth]/page.tsx` handles both five-segment shapes:

```tsx
export default async function BusinessPage(
  props: PageProps<"/in/[first]/[second]/[third]/[fourth]/[fifth]">,
): Promise<ReactElement> {
  const [params, search, visitor] = await Promise.all([props.params, props.searchParams, visitorPoint(), loadPlatformListings()]);
  const segments = [params.first, params.second, params.third, params.fourth, params.fifth];

  const asBusiness = parseBusinessPath(segments);
  if (asBusiness !== null) {
    const found = findBusinessById(asBusiness.id);
    if (found === undefined) notFound();
    const current = businessPath(found);
    if (current !== `/in/${segments.join("/")}`) permanentRedirect(current);
    return <BusinessView {...resolveBusinessView(found)} visitor={visitor} search={search} />;
  }

  // The pre-id address, /in/<service>/mh/<city>/<area>/<slug>: send it to the business's permanent URL.
  if (params.second === STATE_CODE) {
    const id = legacyBusinessId(`${params.first}/${params.third}/${params.fourth}/${params.fifth}`);
    const found = id === undefined ? undefined : findBusinessById(id);
    if (found !== undefined) permanentRedirect(businessPath(found));
  }
  notFound();
}
```

  `resolveBusinessView(found)` returns the `{ service, city, area, listing }` the view needs, from `findService(found.service)`, `findCity(found.city)` and `findArea(found.city, found.area)`. These are the same lookups the current `resolve()` does (:26-32), and its breadcrumb still walks the category tree.

  Do the same in `generateMetadata`. Its `canonical` (`components/local/pages.tsx:928`) becomes `businessPath(listing)`.

  `[third]/page.tsx`: when `first === STATE_CODE && third === BUSINESS_SEGMENT` and `second` is a known city, call `permanentRedirect(directoryPath({ city: second }))`.

  Replace the 9 link sites with `businessPath(listing)`, including `app/api/local-suggest/route.ts:30` and `lib/directory-ads.ts:179,220`.
- [ ] **Step 4: Switch the API client.**
  - `lib/server/directory-client.ts` sends `ids=` instead of `keys=`. Cache tags become `directory:<id>`.
  - The review form, enquiry form, events beacon and claim link send the ID. `lib/server/claim-link.ts:22-27` signs `placeId` instead of `listingKey`; the platform verifier accepts both during the switch.
- [ ] **Step 5: Run** `pnpm vitest run && pnpm lint && npx tsc --noEmit && pnpm build`: green.
- [ ] **Step 6: Verify in the browser** (local website :3190 against the local platform :3001, with places imported and backfilled):
  - an open-data business: the new URL renders, the old URL 301s, and a stale name 301s;
  - a client listing that took over an open-data row: the old open-data URL 301s to the shared ID URL, and its reviews show;
  - `/in/mh/thane/business` 301s to `/in/mh/thane`;
  - a listing card, search suggestion, ad and "other businesses" link all point to `/in/mh/.../business/.../<id>`.

  Screenshot each for the user.
- [ ] **Step 7: Commit** (only if the user asked).

## Phase 6: Contract (a later deploy, after the website has used IDs for a few days)

### Task 13: place_id is the only identity

**Files:**
- `packages/db/migrations/0079_directory_place_ids_contract.sql` (0078 is Task 7's `0078_directory_place_id_writes.sql`)
- the schema and query files touched above
- the platform API routes (drop `keys`)
- the feed (drop `address` for identity, `previousAddresses`, `replacesSourcePath`)
- `website-listing/lib/directory-feed.ts` (stop reading the dropped fields; **deploy this website change first**)

- [ ] **Step 1: Pre-flight on production.** For each of the 10 tables, `select count(*) from <table> where place_id is null` must be 0, except `directory_enquiries` rows of kind `top_list`. **Stop and ask the user** if any table has orphans. They are reviews or counts on dead URLs, and the user decides whether to drop them.
- [ ] **Step 2: Migration.** For each table:
  1. drop the `listing_key` CHECKs, uniques and PKs;
  2. drop `listing_key`;
  3. set `place_id NOT NULL` (except `directory_enquiries`, where `top_list` rows have none);
  4. turn the partial unique indexes into full constraints:
     - `directory_verifications`: PK `(place_id)`;
     - `directory_daily_counts`: PK `(place_id, day, kind)`;
     - `directory_listings`: `UNIQUE (place_id)`.

  Also drop `directory_listings.previous_paths`, `replaces_source_path` and `slug`. Take every existing constraint and index name from migrations 0052, 0054, 0056, 0058, 0064, 0066, 0068 and 0071, not from memory. `directory_ad_bids` has a CHECK that the key starts with its market (0064:26); drop it before the column.
- [ ] **Step 3a: Claim links.** Before any key handling is removed, switch the website's claim link (`website-listing/lib/server/claim-link.ts`, `claimListingKey` in `lib/server/local-listings.ts`) to sign the place id, which the platform's claim sign-up accepts. Keep the platform accepting old-key links, resolved through `directory_place_legacy_keys`, for links already sent out.
- [ ] **Step 3b: Feed.** Make the feed's `id`, `url` and `legacyKeys` required (they are optional during the switch, see `DirectoryFeedPlace` in `feed-contract.ts`), and drop entries without a place. The website stops skipping unplaced rows.
- [ ] **Step 4: Code.** Remove every `listingKey` field and the `keys` parameters, and drop `resolveLegacyKeys` from the API routes. Keep it for the website's legacy redirects, which read the frozen JSON and the feed's `legacyKeys`. `directory_place_legacy_keys` stays forever.
- [ ] **Step 5: Run** the full checks:
  - platform: `pnpm db:migrate:test && pnpm test && pnpm test:integration && pnpm lint && pnpm typecheck && pnpm build`;
  - website: `pnpm vitest run && pnpm lint && npx tsc --noEmit && pnpm build`.
- [ ] **Step 6: Commit** (only if the user asked).

## Rollout order

1. **Dataset:** generate the ledger from the **unchanged** current dataset (Task 2). Commit the ledger, then commit the website JSON with Task 12.
2. **Platform deploy 1:** Phases 2–4 plus Task 10. Then on production: `pnpm directory:import-places` and then `pnpm directory:backfill-places`. Paste both outputs to the user.
3. **Website deploy:** Tasks 11–12. The platform must reach `main` before the website (standing rule).
4. **A few days later:** Phase 6, website change first, then platform 0079.
5. **After every future dataset rebuild:** run `pnpm directory:import-places` on production **before** deploying the website with the new JSON, so the new IDs exist when their pages go live.

## Out of scope (separate plans)

- **Search (Meilisearch).** The next plan, built on these IDs. It covers the query reader, near me, filters and sorting, informed by the Justdial findings of 2026-10-01.
- **Directory business pages in the sitemap.** `app/sitemap.ts` lists none today, which is worth a follow-up once the URLs are permanent.
- **410 Gone** for open-data rows that drop out of the dataset. They 404 today. The ledger keeps their IDs, so a later change can answer 410 for "ID in ledger, no listing".
