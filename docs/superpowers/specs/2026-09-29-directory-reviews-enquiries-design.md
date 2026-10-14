# Directory ratings, reviews and enquiries (design)

Date: 2026-09-29. Status: approved by the user in chat ("build it", after the JustDial-style card mockup at
https://claude.ai/artifact/1rkuULKVnEUVZU2cC4qggR, and choosing "our own reviews" for ratings).

## Goal

The Thane directory on firstfold.io (`/in/...`, website repo, worktree `webfold-website-search`) shows JustDial-style
business cards. This spec adds the data those cards need that we can collect honestly:

1. **Ratings and reviews** left on Firstfold: 1–5 stars, optional short text, up to two highlights from a fixed list
   (JustDial's "Suggestions"), one per phone number per business, confirmed by a phone code.
2. **Enquiries**: "Send enquiry" on a card or business page, and the list-page "Get the list of top …" form. Stored
   for Firstfold staff, who pass them on.
3. **Staff moderation**: a Directory page in the staff console to hide or restore reviews and work enquiries.

Out of scope here: phone numbers, WhatsApp, photos, prices and hours for confirmed or client businesses (the
"customer dashboard listing" work designs where those come from), response-time badges, paid ranking.

## Identity of a business

The website's listings come from a static file, not the platform DB. A business is identified by its **listing key**:
`<service>/<city>/<area>/<slug>` (all lowercase kebab segments, the same values as its URL). The platform stores the
key and a snapshot of the business name; it never needs the listing file.

Validation: `^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*){3}$`, at most 200 characters.

## Highlights (fixed list)

`good_service` "Good service", `value_for_money` "Value for money", `friendly_staff` "Friendly staff",
`clean` "Clean and tidy", `on_time` "On time", `quality` "Great quality", `expert` "Knows their stuff",
`quick_response` "Quick to respond". A review may pick 0–2.

## Rules

- The average rating shows on a card as soon as a business has **1 or more** published reviews (changed from 3 at the
  user's request, 2026-09-29; the website applies this, the API returns the real count).
- Average is shown to one decimal. Top highlight = the most-picked highlight among published reviews, with its count;
  ties broken by the list order above.
- One review per (listing key, phone). A second review from the same phone replaces the first (edited, re-published).
- Review text: optional, 1–500 chars after trimming; reviewer name 1–60 chars (shown as first name + initial).
- Phone: E.164, same country allow-list as booking OTPs (`SMS_ALLOWED_COUNTRY_CODES`).
- Code confirmation reuses the booking OTP rules: 6 digits, 10-minute expiry, 5 attempts, HMAC with
  `BOOKING_OTP_SECRET`, sent through the same SMS sender, and **`BOOKING_OTP_BYPASS=true` applies here too**.
- Rate limits (existing `consumeRateLimit`): per IP, per phone (10 min + day), per listing key per day.
- Enquiries need no code (like the website's lead form) but are rate limited per IP and per phone, and carry a
  honeypot field.
- Staff can hide a review (it stops counting and stops showing) and restore it; the reviewer never sees staff notes.
- Nothing here is shown to customers of the platform app; it is website + staff console only.

## API (platform, called server-to-server by the website with `Authorization: Bearer <LEADS_API_TOKEN>`)

Contract types live in `apps/platform/lib/directory-api.ts` and an identical copy `lib/directory-api.ts` in the
website repo (additive-only, byte-identical, like `lib/leads-api.ts`).

| Method + path | Body / query | Response |
|---|---|---|
| `GET /api/directory/ratings?keys=k1,k2,…` (≤ 50 keys) | — | `{ ratings: Record<key, { average: number; count: number; topHighlight: { id; label; count } \| null }> }` — keys with no reviews are omitted. `Cache-Control: public, s-maxage=60`. |
| `GET /api/directory/reviews?key=…&page=1` | — | `{ summary: {average,count,topHighlight}\|null, reviews: [{ id, name, rating, text, highlights: [{id,label}], createdAt }], page, pageCount }` newest first, 10 per page, published only. |
| `POST /api/directory/reviews/otp` | `{ key, businessName, rating, text, highlights, name, phone: {country, number}, website: "" }` | `{ status: "otp_sent", otpId, expiresInSeconds, phoneHint }` or `{ status: "error", code, message, field }` |
| `POST /api/directory/reviews/confirm` | `{ otpId, code }` | `{ status: "published" }` or error (`wrong_code`, `expired`, `too_many_attempts`, `limited`, `failed`) |
| `POST /api/directory/enquiries` | `{ key \| null, businessName \| null, serviceLabel, areaLabel, kind: "business" \| "top_list", name, phone: {country, number}, message, website: "" }` | `{ status: "received" }` or error |

`website` is the honeypot. Errors use the same `{status:"error", code, message, field}` shape as bookings.

## Data (platform migrations)

- `directory_reviews`: id, listing_key, business_name, reviewer_name, phone, rating (1–5), text, highlights
  (text[] ≤ 2, values from the list), status (`published` | `hidden`), hidden_at, hidden_by_user_id, created_at,
  updated_at. Unique (listing_key, phone).
- `directory_review_otps`: id, listing_key, phone, code_hash, payload jsonb, attempts, expires_at, verified_at,
  created_at (same shape as booking_otps, without business_id).
- `directory_enquiries`: id, listing_key (nullable), business_name, service_label, area_label, kind, name, phone,
  message, status (`new` | `handled`), handled_at, handled_by_user_id, created_at.
- Grants: webfold_staff only (the website reaches these through the platform API on the staff connection, like the
  booking routes); no webfold_app or webfold_public access. RLS enabled with a staff-all policy.
- Purge: OTP rows deleted once used or an hour after expiry (reuse the purge pattern).

## Staff console (`apps/admin`, "Directory" in the dock)

- Two sections: **Enquiries** (newest first, New/Handled filter, business, name, phone, message, Mark handled) and
  **Reviews** (newest first, stars, business, reviewer, text, highlights, Hide / Restore).
- Follows apps/admin/DESIGN.md.

## Website (worktree `webfold-website-search`)

- JustDial-style `ListingList` card per the mockup: big square tile (letter today, photos later), bold name, green
  rating pill + "N Ratings" (1+) or "No ratings yet · Rate this place", Verified/Top rated tags only when true,
  pin + area + distance + top highlight "“Good service” N Suggestions", category chip, Directions / Website / blue
  "Send Enquiry" buttons, "Details not confirmed yet · Own this business? Claim it".
- Sticky filter row (existing sort + "Has a website", plus "Rated 4.0+" once ratings exist).
- Sticky side form "Get the list of top <service>" → enquiries API (kind `top_list`).
- Business page: rating summary, reviews list (paged), "Rate this place" form (stars, highlights, text, name,
  phone → code step → published), Send enquiry form.
- Ratings for a list page are fetched once per render for the page's keys, cached 60 s; if the platform is
  unreachable the cards render without ratings (never an error page).
