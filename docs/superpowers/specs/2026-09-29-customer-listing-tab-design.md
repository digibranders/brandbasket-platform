# Customer Listing tab (design)

Date: 2026-09-29. Status: design chosen by the user in chat ("go with the artifact one … for now don't show the top
listing preview … rest all keep it"). Mockup: https://claude.ai/artifact/QcmiM29yWwYxqzH8PK1TnG (version 3).

## Goal

A paying client sees and manages their **Featured listing on Firstfold Local** (`firstfold.io/in`) from a new
**Listing** section of the customer dashboard. They edit the business facts we let them edit; everything that shapes
the listing's web address stays with staff. The directory reads the listing from the platform, so an edit shows on
`/in` within about a minute.

## Decisions already made (user, 2026-09-29)

1. **Paying clients only.** No free "claim it" dashboards.
2. **Web address:** `/in/<category>/mh/<city>/<area>/<business>`. The map pin decides state, city and area; staff
   pick the category from the directory's fixed list; the business part comes from the name. One address per
   business, under its main category. A client never gets a `-2` suffix: when names clash, the unconfirmed row gets
   the suffix, or staff add a distinguishing word.
3. **Staff-only fields:** name, category, area, phone and map pin. Clients ask for changes.
4. **No card preview at the top of the tab for now.** Everything else in the mockup stays: status, one line with the
   listing's address, View and Copy link, Import from Google, Last 30 days, the editable rows, Set by us.
5. **Google Business Profile Stage 1** (manual setup during onboarding) is separate work; this tab does not depend on
   it.

## Decisions this spec makes (confirmed by the user 2026-09-29: "go with your recommendations")

- **The listing goes live when the website launches** (project `live`), not at payment. Before that the tab shows
  "Goes live with your website". The card links to a site that must exist.
- **A lapsed payment keeps the address and drops to a basic listing** (name, category, area, address; no buttons, no
  description, no hours). It never 404s. Paying again restores Featured automatically.
- **About and Services are listing-only fields**, not the website's description or service pages. The website's copy
  is Firstfold-owned (change requests), the listing's two short fields are client-owned. Hours and the announcement
  are shared with the website, as they already are.
- **About and Services may not contain web addresses, email addresses or phone numbers.** The phone is
  staff-verified; letting it back in through free text would undo that, and it keeps spam out of the directory.
- **"Request a change" uses the Help link that exists today** (the account menu's `mailto:`), prefilled with the
  listing fields, until the change-request feature is built. Then it points there.

## What the client sees

Route: `app.firstfold.io/listing`. Nav item **Listing** after Appointments/Patients (or after Home when those are
off), shown only when the business has a listing row (staff create it; see Staff side).

Top to bottom:

1. **Heading and status.** "Your listing" with a status dot: *Goes live with your website* · *Live on Firstfold
   Local* · *Hidden* · *Paused*.
2. **One line and the address.** e.g. "People searching for a dentist in Naupada see you first." Under it the full
   address as text, then **View on Firstfold Local ↗** and **Copy link** (both disabled unless live).
3. **Import from Google** strip. Phase 3; until then the strip is not rendered (no dead buttons).
4. **Last 30 days**: Seen in search · Opened · Calls · WhatsApp · Directions, big numbers with a small trend line.
   Phase 2. Shown only while live and once the listing has at least 30 days of data or 50 impressions, whichever
   comes first; otherwise one quiet line ("Your numbers show here once people start finding you").
5. **Your details**, rows that open in place:
   - **About**: one line, 1–160 characters, single line.
   - **Services**: up to 8 tags, each 1–32 characters, no duplicates (case-insensitive).
   - **Hours**: read-only summary with a link to **Your details** (`/details`), where hours and closures are already
     edited. Note: "Same hours as your website and online booking."
   - **Announcement**: the existing business announcement (message + end date). Edited here or on Your details; one
     row in `business_announcements` either way.
   - **Buttons**: switches for Call, WhatsApp, Book, Directions, Website. Book is disabled unless the Appointments
     module is on. Website is disabled until the project has a website address.
   - **Show in directory**: on/off. Off hides the listing from `/in` and keeps everything.
6. **Set by us**: name, category, area, phone, map pin (faded), and **Request a change →**.

Stage behaviour:

| Stage | Condition | Tab |
|---|---|---|
| Building | listing row exists, project not `live` | "Goes live with your website"; rows editable; link buttons disabled; numbers line |
| Live | project `live`, subscription paid, `visible` | "Live"; everything on |
| Hidden | client switched Show in directory off | "Hidden"; rows editable; link buttons disabled |
| Paused | subscription lapsed | "Paused" + "Pay to be featured again" banner linking to Billing; rows editable; switch disabled |

Writes are blocked before the first payment like every other write action (existing server-side rule).

## Data (platform, main database)

Two tables, split by who may write them, so grants do the enforcing instead of per-column checks in code.

### `directory_listings` (new; staff-owned placement)

| column | notes |
|---|---|
| business_id | PK, FK businesses |
| category_slug | one of the directory's service slugs, e.g. `dentists` |
| state_code | `mh` for now; check `^[a-z]{2}$` |
| city_slug | e.g. `thane` |
| area_slug | e.g. `naupada` |
| slug | business part of the address; `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–80 chars |
| lat, lon | numeric(8,5); inside the district bounds (checked in app) |
| pin_label | short text shown to the client, e.g. "Gokhale Road, near Thane station" |
| whatsapp_phone | nullable E.164; null means use `business_profiles.phone` |
| booking_url | nullable https URL of the client site's booking page |
| replaces_source_key | nullable; the directory data row this business replaces (see Directory side) |
| previous_addresses | jsonb array of earlier full paths, for redirects; appended by the app on any address change |
| created_at, updated_at | |

Unique `(category_slug, state_code, city_slug, area_slug, slug)`: two Featured businesses can never share an address.

### `listing_content` (new; client-owned)

| column | notes |
|---|---|
| business_id | PK, FK directory_listings |
| about | nullable text, ≤160, single line (DB check on length and no newline) |
| tags | text[] default '{}', cardinality ≤ 8 (DB check); per-tag rules in app |
| show_call, show_whatsapp, show_book, show_directions, show_website | boolean, default true (book default false) |
| visible | boolean default true |
| updated_at | |

### Grants and RLS (separate migration, as usual)

- `webfold_app` (customer): SELECT on `directory_listings` and SELECT/UPDATE on `listing_content`, both row-level
  secured to the member's business. No INSERT/DELETE on either; no UPDATE on `directory_listings`.
- `webfold_staff`: full access to both.
- The public API reads through the staff connection, like `/api/pricing`.

Reused as they are: `business_profiles` (display name, address, phone), `business_hours`, `business_closures`,
`business_announcements`, `business_modules` (Book), the project's website URL, and the subscription state.

## Staff side (admin client page)

A **Listing** section on `admin.firstfold.io/clients/<id>`:

- Create the listing: category (select from the list), city and area (selects, filtered by city), slug (prefilled
  from the display name, editable), map pin (staff paste the coordinates from Google Maps; geocoding the onboarding
  address automatically is out of scope), pin label, WhatsApp number, booking URL.
- **Link the unconfirmed row**: a search box over the directory data for the same category and area, pick the
  matching row; stores `replaces_source_key`.
- Shows the full address and whether it is live, with a link.
- Changing category, city, area or slug appends the old path to `previous_addresses` and shows a warning that the
  address changes.

The category, city and area lists come from a copy of the website's `content/local/thane-places.json` (cities,
areas, services only; no businesses) in `packages/shared`. The two copies are kept in step the same way pricing and
brand pieces already are, plus a unit test in each repo asserting the slugs the other side depends on exist.

## Platform → directory

`GET /api/directory/listings` on the platform. Public (everything in it is shown publicly anyway), cached like
`/api/pricing` (`max-age=60, s-maxage=60, stale-while-revalidate=300`). Returns every listing whose project is `live`:

```ts
interface DirectoryFeed {
  listings: Array<{
    address: { category: string; state: string; city: string; area: string; slug: string };
    previousAddresses: string[];
    replacesSourceKey: string | null;
    tier: "featured" | "basic";           // basic = payment lapsed
    name: string;
    streetAddress: string;
    lat: number; lon: number;
    // featured only:
    about?: string;
    tags?: string[];
    hours?: { day: number; opens: string; closes: string }[];
    closures?: { startsOn: string; endsOn: string }[];
    announcement?: { message: string; endsOn: string } | null;
    buttons?: { call?: string; whatsapp?: string; book?: string; directions: string; website?: string };
  }>;
}
```

Hidden listings (`visible = false`) are left out entirely. A button is present only when its switch is on and its
target exists. The contract lives in a file copied into both repos, like `lib/leads-api.ts`, and is additive-only.

## Directory side (website repo, `/in`)

- Fetch the feed server-side with the same caching; on failure keep serving the last good copy, and if there is none,
  serve the directory without Featured listings rather than erroring.
- **Merge:** a feed listing replaces the data row named by `replacesSourceKey` (that row disappears everywhere) and
  is placed at its own address. The unconfirmed row that loses a name clash gets the `-2` suffix, never the client.
- **Featured** listings sort first in category and area lists and carry the badge and buttons. Their business pages
  are indexable (unconfirmed pages stay `noindex`), carry `LocalBusiness` JSON-LD (name, address, geo, hours,
  telephone when Call is on, `url`, `sameAs` the Google profile link when set), and link the website without
  `nofollow`.
- **Basic** tier renders like an unconfirmed row but at the client's address, and stays indexable.
- Every `previousAddresses` path 308-redirects to the current address.

## Phase 2: numbers

- The directory records five events per listing: `impression` (appeared in a list or search result), `view` (business
  page opened), `call`, `whatsapp`, `directions` (button taps). No personal data: no IP, no cookie, no visitor id.
- It batches them and posts to `POST /api/directory/events` on the platform with a shared token (the `/api/leads`
  pattern). The platform adds them to `listing_daily_counts (business_id, day, kind, count)`, unique per
  (business, day, kind), upserting counts.
- Server-side impressions only (counted when the page is rendered), so bots inflate them; filter known bot user
  agents before counting and say "Seen in search" rather than "people".

## Phase 3: Import from Google

Blocked on Google approving our Business Profile API access (apply now; it takes weeks). The Places API is not a
substitute: its terms forbid storing what it returns.

- Connect with Google OAuth. Google offers only one Business Profile permission, `business.manage`, so Google's
  consent screen will say "manage". Our copy must say we only read, and must not claim Google will show read-only.
- Use the access token once for the import and discard it. No refresh token is stored.
- Choose the location, then review field by field. About and Services are ticked by default (Services adds only new
  tags); Hours and Phone start unticked. Hours opens the Your details editor with Google's hours filled in for the
  client to save. Phone never writes: it sends the staff a change request. Name shows "Already matches" or goes the
  same way as Phone. Photos show "Coming later".

## Errors

- Validation errors say what to fix, per field ("Keep it to 160 characters", "Up to 8 services", "Web addresses and
  phone numbers can't go in your description").
- Saving when the listing was changed by staff meanwhile: last write wins for `listing_content` (only the client
  writes it); staff fields are never written from the tab.
- Feed unavailable: the tab still works (it reads the platform directly); the directory keeps its last good copy.

## Testing

- **Unit:** About and tag validators (length, single line, no URL/email/phone patterns, duplicates), address building,
  feed shaping (tier, buttons omitted when off or targetless, hidden omitted), stage derivation.
- **Integration (db):** RLS: a customer reads and updates only their own `listing_content`; cannot update
  `directory_listings`; cannot insert either. Unique address constraint. Checks on `about` and `tags`.
- **Integration (website):** merge replaces the linked row, clash suffix goes to the unconfirmed row, redirects from
  previous addresses, `noindex` only on unconfirmed pages, JSON-LD present on Featured.
- **E2E (local):** staff create a listing for a test client → client edits About and Services → the local directory
  shows the change within the cache window; switch Hidden → gone from `/in`; lapse → Basic at the same address.

## Phasing

1. **Phase 1:** tables, grants, staff Listing section, customer Listing tab (without the Google strip and numbers),
   the feed, and the directory merge. Requires `/in` itself to ship first (it is uncommitted on
   `feat/global-search` in the website repo, and the DPDP check before publishing unconfirmed rows at scale still
   stands).
2. **Phase 2:** events, daily counts, the Last 30 days block.
3. **Phase 3:** Google import, after API approval.

## Out of scope

Photos (no public media URL exists yet, same blocker as blog covers), reviews, paid ranking, multiple branches per
client, free listings for non-clients, the short `firstfold.io/l/<name>` link, and syncing edits to Google (Google
Stage 2).

## Resolved questions (user, 2026-09-29)

1. Go live at website launch, not at payment.
2. A lapsed client drops to a Basic listing at the same address.
3. The Google strip stays hidden until Phase 3 works.
