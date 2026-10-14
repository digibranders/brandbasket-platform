# One entry page, and Premium that pays first

Date: 2026-09-30. Status: approved by the user ("go with your recommendation and build it").

## Why

Until now there were two doors. A free listing account signed up on the app's `/join`. A website client filled the
lead form on the website (`/get-started`), waited for a call, got a setup link by email, set up, and paid on the last
step. The user wants one door for everyone, and three cases behind it:

1. **Has their own website, wants the free listing.** Signs up, lands in the free listing dashboard.
2. **Has no website, wants Fynix to build it (Premium membership).** Signs up, pays first, and only then gets the
   dashboard a paying client has today.
3. **Has no website, only wants the free listing for now.** Same as case 1, and Premium is highlighted in the
   dashboard so they can upgrade later on the same account.

## What the person sees

### The one page: `/login`

Two views on the same page, switched by a link:

- **Sign in** (default): mobile number or email, password. Unchanged.
- **Create account** (`/login?new=1`):
  1. "Do you have your own website?" Yes / No.
  2. Only after No: "Free listing" or "Premium membership" (with the price of the rupee plan on sale).
  3. Name, mobile number, password, then the texted code. Unchanged.

`/join` stays as an address, because the website's claim links and "List your business" buttons point at it: it
redirects to `/login?new=1` and carries the claim (`listing`, `name`, `sig`) and `plan` along. `plan=premium` opens the
form with No and Premium already chosen.

### After sign-up

| Choice | Stored as | Lands on |
|---|---|---|
| Has own website | `own_website` | Listing page (or Advertise for a claim), as today |
| Free listing | `listing_only` | the same |
| Premium | `premium` | `/premium`, the payment page |

### `/premium`

What the membership includes, the price, and one button to pay.

- A free account opens it from its dashboard (nav item "Premium", and a slim line at the top of the dashboard for
  accounts that said they have no website).
- An account that chose Premium and has not paid is **held here**: every other dashboard page sends it back to
  `/premium`, which is drawn without the dashboard around it. Two ways out: pay, or "Continue with the free listing",
  which changes its choice to `listing_only` and opens the free dashboard.

### After payment

The business becomes a website client on the spot: the full dashboard opens on Home, with setup as the next step.
Setup no longer ends with a payment for these members: the last step just sends.

## How it works

### Data

Migration 0074: enum `signup_choice` (`own_website`, `listing_only`, `premium`) and a nullable
`businesses.signup_choice`. Null for accounts that existed before and for clients made from a setup link. No new
grants: the app role already selects `businesses`, and staff already update it.

### Accounts

Every self sign-up creates the same thing as today: a phone account and a `listing` business. The choice is stored on
the business. Nothing about Premium exists until money arrives.

### Paying first

- `startMembershipCheckoutFor` (platform `lib/server/checkout.ts`) opens the plan's checkout for a `listing` business.
  It shares the decision, locking and recording with `startCheckoutFor` and skips only the two checks that belong to
  the old order: "has a project" and "the setup checklist passes".
- The payment pages (`/billing/pay`, `/billing/confirm`, `/billing/pay/callback`) accept a free listing account that
  is buying the membership, and send it back to `/premium` instead of Check and send.
- `activateFirstPayment` (shared `server/billing-activation.ts`), the one path every first payment takes (fake
  checkout, Razorpay webhook, a payment staff record by hand), also calls `openMembershipForListingBusiness` in the
  same transaction: a `listing` business becomes `website` and gets its onboarding project. It reports
  `openedMembership`, and the callers then create the business's Payload tenant, as the setup link does.
- Razorpay confirms by webhook, which can land after the browser is back. `/premium?payment=received` says the payment
  has arrived and loads itself again every few seconds until the business has become a website client, then goes to
  Home. It only says so while the account really has a checkout that has not settled (`unsettledCheckout`): an
  `incomplete` one, or one Razorpay has already marked authorised before its charge event arrived. After a minute it
  stops and gives the support address.

### The gate

`requireCustomerAccess` reads the business's kind and sign-up choice once per request. A `listing` business whose
choice is `premium` is sent to `/premium` unless the caller passes `membershipCheckout: "allow"` (the `/premium` page,
its actions, the layout and the payment pages).

### The free listing after an upgrade

The business's claim is left as it is, so its page on the local directory stays up. The member's dashboard is the website
client's from then on; "Fynix listing managed for you" is staff creating the Featured listing, as for every client
today. Carrying the owner's own listing, photos and ad bids into the client dashboard is **not** part of this work.

### Owners without an email address

A member who joined here signs in with a mobile number; the account's stored address is a placeholder. The staff
console shows the number instead (`ClientOwner.phone`, `email` null), "Send preview" and "Mark live" email nobody and
tell staff to call or message the owner, and an enquiry on the member's listing is not emailed to the placeholder
(`findListingOwner`).

### Business name

A Premium sign-up with no claim asks for the business's name, so the staff console, the checkout and the receipts name
the business and not its owner. A free sign-up still names the business when the owner adds it on the Listing page.

### Codes while there is no SMS provider

`SIGNUP_OTP_BYPASS=true` (temporary, off by default) lets an account be created with no text sent: the code step stays,
says codes are not being texted yet, and takes any six digits. The step keeps its expiry, single use, country rule and
limits. The mobile number is then not proven to be the owner's. It never applies to a password reset, whose code is
always texted and checked, because any six digits there would let anyone take over any account.

## Not changing

- Setup links for leads staff already have keep working.
- Signing in, forgot password, the code rules, and the free listing dashboard's pages.
- Prices: read from the plan on sale, never typed into a page.

## Tests

- `join-form`: the choice is read, defaults, and refuses a value that is not one of the three.
- `listing-account`: the choice is stored with the business.
- `customer-access`: the gate's decision (pure function) for each kind and choice.
- `checkout`: the membership checkout refuses a website client and opens one for a listing business with no project.
- `billing-activation`: a first payment for a listing business opens the membership; a website client's does not.
- db integration: `openMembershipForListingBusiness` converts once and creates the project; a second call does nothing.
- Browser: the three cases end to end on the local stack, with the fake payment provider.
