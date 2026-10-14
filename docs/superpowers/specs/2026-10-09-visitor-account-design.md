# Visitor account and MSG91 texts (2026-10-09)

## What it is
A website visitor whose number a texted code has proven gets an account: a name and a verified phone, nothing else (no
password, no email). The browser then remembers them, so a later review, comment or enquiry anywhere on the site goes
under that number with no further code. The header's top-right menu shows their name and masked number, and Sign out.

## How it works
- `directory_visitors` (0118): `phone` (E.164, unique), `name`, `created_at`, `last_seen_at`. Staff-only, like the rest
  of the directory; the website reaches it through `/api/directory/*`.
- A confirmed review or comment code opens (or finds) the account for that number and answers with
  `visitor: { token, name, phoneHint }`. The website stores the token in an httpOnly cookie and a readable label cookie.
- The token (`lib/server/visitor-token.ts`) is `<visitor id>.<expiry>.<HMAC>`, signed with the platform's OTP secret,
  valid 30 days and renewed on every use. The website cannot forge or extend one.
- With `visitorToken` on a review, comment or enquiry request the platform takes the name and number from the account
  (whatever the form carried is ignored), sends no code, and publishes at once through the same path a confirmed code
  takes (so a second review from the number still replaces the first). Limits apply under their own keys.
- A token that is forged, expired or names a deleted account is answered `signed_out` (401); the website forgets the
  cookies and the form asks for the name and number again.
- Changing the number or deleting an account is not part of this: it would need a fresh code.

## Not covered
- A returning visitor on a new browser or after 30 days confirms a code again (the account is found by the number).
- Booking OTPs on client websites are separate and unchanged.
- The visitor account is only as trustworthy as the code that opened it: with `BOOKING_OTP_BYPASS=true` any number can
  open one. Turn the bypass off once SMS is live.

## SMS
`SMS_PROVIDER=msg91` sends through MSG91's Flow API with one DLT template: a single code text used for every code
(bookings, reviews, comments, account codes, business verification, password reset). See `apps/platform/.env.example` for
the variables and the exact wording to register.
