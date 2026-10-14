# Directory ads: free listing accounts and weekly ad auctions (design)

Date: 2026-09-30. Status: approved by the user in chat ("start implementing it", after the flow analysis; "the
pricing and all will be set by staff per category").

## Goal

Local businesses on Firstfold Local (firstfold.io/in) can advertise on the directory's list pages. To advertise, a
business first signs up for a **free listing account** for its listing and Firstfold confirms it owns it. It then bids
for ad spots **week by week** in a sealed-bid auction. Staff set the **base price per category**, which is also the
lowest bid.

Out of scope for this phase: pay-per-lead bidding, uploaded ad images (ads use the stock photo for the category and
the business's own name), advertising outside the business's own area, "Add my business" for businesses that are not
in the directory yet, SMS or email notices (everything is shown in the dashboard).

## Accounts

- `businesses.kind` (`website` | `listing`, default `website`). Website clients are unchanged. A `listing` business is
  a free account: no subscription, no website project, no Payload tenant.
- **Sign up**: the website's business page links "Own this business? Claim it and advertise" to
  `app.firstfold.io/join?listing=<key>&name=<business name>`. The form takes your name, email, password and mobile
  number, and creates the user, a `listing` business (currency INR), the owner membership and a pending claim in one
  go, then signs them in and opens `/advertise`. Rate limited per network (5 an hour). An email that already has an
  account gets "Sign in instead".
- The listing's name comes from the website link and is only a label: staff check it when they call.
- In the dashboard a `listing` account sees **Advertise**, **Billing** and **Settings** only; every other page sends it
  to `/advertise` (the gate is in `requireCustomerAccess`, so a page is closed to it unless it opts in).
- Staff lists of clients leave `listing` accounts out.

## Claims (proving the business is theirs)

`directory_claims`: one per account. `listing_key`, `business_name`, `phone` (E.164), `status`
(`pending` | `approved` | `rejected`), `decided_at`, `decided_by_user_id`, plus the ad's `tagline` (optional, up to 80
characters, single line) and `tagline_approved`.

- Staff call the number and approve or reject in the staff console (**Ads → Claims**). Approving also marks the
  listing verified (writes `directory_verifications` with the claim's phone), so it gets the ✔ and its number shows.
- At most one approved claim per listing.
- Editing the tagline sets `tagline_approved` back to false; staff approve it in the same tab. Until approved the ad
  shows the category's default line.

## What is sold

A **market** is one category in one area, e.g. dentists in Naupada: the website page
`/in/dentists/mh/thane/naupada`. A business can advertise only in its own listing's market (from its listing key).

Each market has two placements, each sold by the week (Monday 00:00 to the next Monday 00:00, Asia/Kolkata):

| Placement | Spots | Where |
|---|---|---|
| `top` | 1 | First row of the list, marked "Ad" |
| `side` | 2 | The side column's ad spots (spot 1 above spot 2) |

## Prices (staff, per category)

`directory_ad_prices`: `category_slug` (primary key), `top_week_paise`, `side_week_paise`, whole rupees from ₹100 to
₹1,00,000. A category without a row is **not open for ads** yet. The price applies to every area of the category and
is the lowest bid (the reserve).

## Auction rules

- Bidding for a week opens as soon as it is one of the next **two** weeks and **closes on the Saturday before it at
  20:00 IST**.
- A bid is a whole number of rupees, at least the category's price, at most ₹1,00,000. One bid per business per
  placement per week; it can be raised at any time before the close, and lowered or withdrawn until 24 hours before
  the close.
- Sealed: an advertiser sees the price, how many businesses have bid, and last week's winning prices; never who bid
  or how much.
- **Second-price**: bids are ranked (amount, then earliest). The winner of spot *i* pays the bid below it plus ₹10,
  never more than its own bid and never less than the price. A single bidder pays the price.
- `top` is settled before `side`; a business that won `top` in that market and week cannot also win a `side` spot.
- Winners owe the price plus 18% GST, as a charge (kind `directory_ad`), and must pay **within 24 hours of the close**
  (Sunday 20:00 IST). An unpaid win lapses: its charge is cancelled and the spot goes to the next bidder at the same
  second-price rule, with another 24 hours to pay, for as long as the week has not ended.
- A paid win's ad shows from the moment of payment until the week ends.

Settlement is a pure function of the bids and the clock, so it runs lazily and idempotently whenever ads are read
(the website's ads request, the advertiser's page, the staff console) under one advisory lock. There is no scheduler.

## The advertiser's page

Rebuilt 2026-09-30 after the user found the first version confusing ("think as a user"): four identical bid forms,
auction jargon, no picture of what is being bought, GST only after winning, and no reason on "Not won".

- **One thing first.** The top of `/advertise` shows, in this order, what is owed (the amount with GST, one Pay button
  and "or the spot goes to the next business"), what is showing, and a bid waiting for its result with the time to
  come back. With none of those, the bid panel is the page.
- **One bid panel.** A week switch ("Next week", "Week after next"), a small picture of the list page whose top row
  and side cards are the spots to tap, and one box: "The most you'd pay for the week", with ₹, quick chips (lowest,
  last week's price, + ₹100) and a live "At most ₹X + GST = ₹Y". Beside it: how many businesses have bid and what the
  spot went for last week. A four-step line dates what follows: Bid, Result, Pay if you win, Ad shows.
- **Plain words.** "You never pay more than your bid. If others bid less, you pay less." No "sealed", no "reserve".
- **Your ad** shows the ad as the directory does, with its line editable beneath.
- **Not won** gives the reason: another business bid more, you already hold the top spot, or not paid in time.
- Paying for a won spot returns to `/advertise` (not Billing), where the ad is shown as on.
- Visit figures appear only once there is something to show.

## Staff-placed ads

Added 2026-09-30 at the user's request: "if anyone requests the staff to get their ads listed, the staff console has
the whole authority of where and to which category they could place that customer's ads".

- Staff place an ad by hand from **Ads → Placed by staff**: the business's page on the website (any listing, with or
  without an account), its name and optional ad line, the category and area to show it under (any, not only the
  business's own; blank means its own), the spot (top, side 1 or side 2), the starting week (this week or up to eight
  ahead) and how many weeks in a row (1 to 12).
- No account, bid or charge is involved. The agreed weekly price and a note (how it was paid) are recorded for the
  team only; the platform raises no bill for these.
- A staff-placed ad **holds its spot**: it cannot be placed on a spot another staff ad or an auction win (paid or
  still to be paid) already holds that week, and that week's auction sells only the spots left. With no spot left the
  advertiser's page shows "Booked for this week" and new bids are refused; bids already placed simply do not win.
- Staff can take an ad down at any time, which frees the spot.
- `directory_staff_ads` (one row per week; `removed_at` instead of DELETE), staff-only. Two triggers keep a spot to one
  ad whoever writes it.

## Data (platform migrations 0063–0067)

- `business_kind` enum and `businesses.kind`.
- `charge_kind` gains `directory_ad`; a `directory_ad` charge may be cancelled without a staff id (the auction lapses
  it).
- `directory_claims`, `directory_ad_prices`, `directory_ad_bids` (`business_id`, `listing_key`, market columns,
  `placement`, `week_start`, `amount_paise`, `status` `active` | `withdrawn` | `won` | `lost`), `directory_ad_wins`
  (`bid_id`, `business_id`, market, `placement`, `week_start`, `spot`, `price_paise`, `charge_id`, `status`
  `awaiting_payment` | `paid` | `lapsed`, `pay_by`, `paid_at`, `lapsed_at`).
- Customer role reads its own claim, bids and wins through row-level security and may update only its claim's tagline;
  everything else is written on the staff connection after the server has checked the customer. No DELETE for anyone.
- Paying a `directory_ad` charge marks its win paid in `recordChargePayment`'s transaction.

## API for the website

`GET /api/directory/ads?market=<category>/<city>/<area>` (Bearer `LEADS_API_TOKEN`) →
`{ top: Ad | null, side: Ad[] }` where `Ad = { key, name, tagline }`: this week's paid wins of approved claims, in spot
order. `tagline` is null until approved. Cached 60 s. Contract in `lib/directory-api.ts` (both repos, additive).

## Website

- Category-in-area pages: the `top` ad as the first row, marked "Ad"; paid `side` ads fill the side spots (the demo
  ads stay local-only). Free spots link to how to advertise.
- Business pages: "Own this business? Claim it and advertise" → the join page.

## Staff console

New **Ads** page: **Claims** (pending first; approve, reject, approve tagline), **Auctions** (this week and next:
every market with bids, winners, amounts, payment state), **Prices** (per category, top and side).
