# Staff link ads and "booked until" (2026-10-12)

Staff can place an ad that opens a web address they choose, for as long as they like (a month or two), and an owner who
looks at the Advertise page sees the spot as booked until the last day of that booking.

## What staff do

Ads → Placed by staff → Place an ad. "The ad leads to" has two choices:

- **A business page on the website** (as before): paste the page, the ad shows the business's name and line and leads to its page.
- **A link I choose** (new): a headline, an optional line, and the address the ad opens. No business is behind it, so staff
  choose the category and area (or, for a home page tile, the city).

**Picture (optional, for either kind).** Staff choose a JPEG, PNG or WebP. The form cuts it to the spot's shape in the
browser (tall 960×1080 for the first side spot and the first home tile, wide 960×600 for every other spot), shows exactly
how it will look, and lets staff drag it to choose what shows. Only the cut WebP is posted (a server action takes 1 MB); the
server checks it is a picture, cuts it to the exact size again and stores it (`staff-ads/{id}/display`). Without a picture
the ad uses the business's own picture or the category's stock photo. The same picture serves every week of a booking and
its file is deleted when the last ad using it is taken down.

Either way staff pick the spot (a home page tile, a side spot, the business page card), when it starts, and how long:
**1 month, 2 months, 3 months** (4, 8 or 12 whole weeks, because auctions run Monday to Sunday) or any number of weeks up
to 12. There is no account, bid or charge. The Placed list shows one line per booking ("12 Oct – 6 Dec · 8 weeks") and one
**Take down** removes every week of it at once; the spot is free again straight away.

## What an owner sees

On Advertise, a placement staff hold in full says **"Booked until Sun 8 Nov"** (the last day of the unbroken run of weeks),
with a line explaining that it takes no bids until then. The "showing now" column says when each ad ends, per ad when they
end on different days. A placement with a spot left stays open for bids ("From ₹499 · 1 free").

## What a visitor sees

A link ad is an ordinary ad card marked **Ad**, with its own headline and line. Clicking it opens the address in a new tab,
as a plain link marked `rel="sponsored noopener noreferrer"`. Its call to action says "Learn more" (a business's ad says "View in <area>").

## Data

`directory_staff_ads` (migration 0138): `listing_key` is optional, new `link_url`; exactly one of the two is set; `link_url` is
an http or https address with no spaces, 12 to 500 characters. One row per week, as before.

The ads answer (`GET /api/directory/ads`) adds `link` to an ad. A link ad's `key` names only its market
(`<category>/<city>/<area>/link-ad`, in the shape of a listing key), so a website that does not know `link` finds no
business behind it and drops the ad instead of rejecting the whole answer. Deploy the website before staff place a link ad.

Pictures: `directory_staff_ad_pictures` and `directory_staff_ads.picture_id` (migration 0139). The platform's picture route
(`GET /api/directory/pictures/<id>`) serves one only while a staff ad that uses it is up; the website needs no change to
fetch it (the ad answer's `pictures.tall` / `pictures.wide` carry its id, which the website already turns into its own
`/api/directory-picture/<id>` address). Staff see it as a thumbnail on the Placed list (`/staff-ad-pictures/<id>` on the admin host).

## Not in this change

- **Views and clicks are not counted for link ads.** Counting is by a business's permanent id, and a link ad has none.
- A picture of an ad whose weeks have all passed (not taken down) keeps its file; only a take-down deletes it.
- A link ad is not linked to a business, so it appears in no owner's results.
