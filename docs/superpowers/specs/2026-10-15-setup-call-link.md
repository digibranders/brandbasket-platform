# The setup call link

2026-10-15.

## What

The Set up your website page offers a short call beside the steps: a card, "Want to set this up together?", with a Book a call
button that opens a booking page in a new tab. A customer who prefers to fill the steps in carries on below it. The card shows
until the setup has been sent, and only while a link is set.

## Why it is a setting, not code

The link is a team booking page (Calendly or similar) and it will change: a person leaves, a plan changes. A link in the code
needs a developer and a deploy for each change. It is therefore one row in `site_settings` (migration 0173), changed from the
console's Settings page, which is reached from the account menu and open to any staff member. A change is on the customer's page
at once: the page reads the row each time it is drawn, and shows nothing when it cannot be read.

## Rules

- Only a secure web address is kept (`readSetupCallUrl`, packages/shared/src/lib/setup-call-link.ts): `https`, a real host, no
  user name or password, at most 300 characters. Anything else is refused with a plain message and the saved link stays.
- An empty box clears the link, and the card goes away.
- The platform checks the saved value again when it reads it, so a value put in the table by other means is never shown.
- The row records who last changed it and when; the Settings page shows both.
- The table is staff only (row-level security), like the Razorpay plan tables. The platform reads it on its staff connection.

## Not done

- No record of who booked. The link is a plain address with no booking system behind it.
- Settings is one setting. The table takes more (key and text value) without another migration.
