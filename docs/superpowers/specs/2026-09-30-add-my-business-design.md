# Add my business: a free listing for a business that is not in the directory yet

Follows `2026-09-30-directory-ads-auction-design.md`, which left "Add my business" out. Until now a free listing
account could only be opened from an existing business page (`/join?listing=<key>&name=…`). A business that is not
on Firstfold Local had no way in.

## What the owner does

1. Clicks the free listing link on the website. It opens the dashboard's `/join` with no listing.
2. Signs up: business name, their name, email, password. This creates the account and a `listing` business with no
   claim, signs them in and lands on **Business** (`/business`).
3. Adds the business, in the order of its web address:
   1. **Category**: a searchable list of the directory's categories, A to Z.
   2. **City**: the directory's cities.
   3. **Area**: a searchable list of that city's areas, A to Z.
   4. Business name (filled in from sign-up), address, the business's mobile number.
4. The whole time the page shows the address being built:
   `firstfold.io/in/<category>/mh/<city>/<area>/<business-name>`. A part not chosen yet shows as a faded
   placeholder; a chosen part shows its real slug.
5. "Add my business" stores it and the page turns into a summary: name, category, area, the address, and
   "Waiting for our call".

## Rules

- Category, city and area must come from the directory's fixed lists (`@firstfold/shared/lib/directory/places`);
  the area must belong to the chosen city.
- The last part of the address is the business name as a slug (`slugifyBusinessName`). If another claim or a
  client's listing already holds that address, `-2`, `-3`… is added.
- The stored record is a `directory_claims` row with `origin = 'added'` and the street address. A claim made from an
  existing page keeps `origin = 'claimed'` and no address. One claim per account, as before.
- Staff see added businesses in Ads → Claims, marked "New business" with the address, and approve or reject them
  after the call exactly like a claim.
- Approving an added business does not write a `directory_verifications` row. Its address was made from the owner's
  picks and the platform does not know the website's own listings, so the address may be one the website already
  shows for a different business; verifying it would put this owner's number on that page. Staff open the address
  from the claim row to check. For the same reason an added business is shown no visit counts and takes no ad line.
- Two accounts adding the same name in the same category and area at the same moment are serialised by an advisory
  lock on that category and area, so the second gets `-2`.
- An added business has no page on firstfold.io yet (publishing added businesses on the website is a separate piece
  of work). Until it does, it cannot bid for ads: a bid is refused as `no-page`, and Advertise says so.

## Changing it afterwards

- **Before our call** (an added business whose claim is `pending`): the owner reopens the same form from an Edit
  button (`/business?edit=1`), filled in, and may change every pick, the name, the address and the number. Nobody
  has seen the web address yet, so it may change too; the business's own claim never counts as holding an address
  against it, so saving with nothing changed keeps the address, number and all.
- Because the owner may change the details while staff are on the call, the staff Approve button posts the address,
  number and name its row showed; if any has changed since, nothing is approved and staff are told to look again.
- **After our call** (approved or rejected), and for a listing claimed from an existing page: the details are fixed.
  "Request a change" opens an email to us with the listing already named, as on a website client's Listing tab.
  The reasons: a live address is what search engines and the owner's own links point at; ads are sold per category
  and area; reviews and visit counts are stored against the address; and our call confirmed these details, not
  new ones.
- A confirmed added business may still change the name it is shown under. Its address stays the same. (A claimed
  listing's name is the website's, so it has no name form.)

## Out of scope

- Showing added businesses on the website (list pages, business page, search).
- Photos, hours, map pin.

## Pieces

| Piece | Where |
| --- | --- |
| Address preview + list filtering (pure) | `apps/platform/lib/listing-address.ts` |
| Add-business form parsing (pure) | `apps/platform/lib/add-business-form.ts` |
| Sign-up without a listing | `apps/platform/lib/join-form.ts`, `lib/server/listing-account.ts`, `app/app-host/join`, `components/panel/join-form.tsx` |
| `origin`, `street_address` columns | `packages/db` schema + migration 0068 |
| `createUnlistedAccountBusiness`, `addBusinessListing`, `no-page` refusal | `packages/db/src/queries/directory-ads.ts` |
| Business page + picker | `apps/platform/app/app-host/(protected)/business`, `components/panel/business/add-business-form.tsx` |
| Staff marker | `apps/admin/app/(protected)/ads/page.tsx` |
| Website link | `website-ads`: `lib/directory-ads.ts`, `/in/advertise` |

## Tests

Unit: address segments, list filtering, both form parsers. Integration (test database): account without a claim,
adding a business (key, origin, address, renamed business), a taken address gets a suffix, a second add is refused,
an added business cannot bid. Browser: sign up → pick category, city, area → address shown → saved → staff see it.
