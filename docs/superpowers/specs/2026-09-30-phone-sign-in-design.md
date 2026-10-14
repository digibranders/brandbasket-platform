# Phone sign-up, sign-in and password reset for free listing accounts

Asked for by the owner on 2026-09-30: a free listing owner signs up with their name, mobile number and a new
password, confirms the number with a code we text, and is in. They sign in with the number and the password. If they
forget the password, a code is texted to the number and they choose a new one. Under the sign-up form, "Already a
customer? Sign in" goes to the sign-in page.

## What the owner does

**Sign up** (`/join`, with or without a claim link)

1. Name, mobile number, password → "Send me a code".
2. We text a 6-digit code to the number. The form shows a code box, "Send a new code" and "Change number".
3. The right code opens the account and signs them in. A claim lands on Advertise; a business that is not in the
   directory lands on Listing, where the add-business form starts with their number filled in.

**Sign in** (`/login`): mobile number (or email) and password. Website clients still sign in with the email their
account was made for; the one field takes either, and anything with an `@` is read as an email.

**Forgot password** (`/forgot-password`): mobile number (or email). A number is texted a code, and the same form then
asks for the code and the new password twice; afterwards they sign in with the new password. An email is sent the
one-time link, as before.

## Rules

- A number is read as Indian unless it carries a country code, and stored as E.164 in `users.phone_number`, unique.
  Only a verified number signs in or resets a password.
- Nothing about the owner is stored before the code is confirmed: the form sends the name, number and password again
  with the code. `account_otps` holds the number and the hashed code only.
- Codes follow the booking and review code rules: 6 digits, 10 minutes, 5 tries, HMAC with `BOOKING_OTP_SECRET`,
  salted with the row's id, used once, purged an hour after they run out. One fixed SMS text for both purposes:
  "`<code>` is your Firstfold code. It expires in 10 minutes. Do not share it."
- Budgets for asking: 10 an hour per network, 3 per 10 minutes and 8 a day per number, 1,000 a day overall. For
  confirming: 30 an hour per network. Only countries on `SMS_ALLOWED_COUNTRY_CODES` (India by default) are texted.
- A number that already has an account is told to sign in at sign-up, and is texted nothing. Because that answer
  says which numbers have accounts, the sign-up answers at most 10 numbers an hour per network.
- A password reset for a number with no account is answered exactly like one with an account: a code is stored (so
  guesses at it are answered the same way, try for try) but nothing is texted, and nothing is done if it is ever
  guessed.
- The placeholder address is not a way in: typing it on either sign-in page is refused, and no email account can be
  created in its domain. Receipts and the payment form show the number, not the placeholder.
- **No bypass.** `BOOKING_OTP_BYPASS` does not apply: a code that any six digits satisfy would let anyone reset
  anyone's password. Where production has no SMS provider (today it has none: `SMS_PROVIDER=outbox` is refused in
  production), asking for a code answers "We can't text a code right now". Going live needs a real SMS provider and,
  for Indian numbers, the text above registered as a DLT template.
- Better Auth signs in by email, so a phone account holds a placeholder address, `<digits>@phone.firstfold.invalid`
  (`phoneAccountEmail`). It is never shown and never written to: the account bar, Settings and the staff console
  show the number; the confirm-email banner, the confirmation email, the enquiry email and the emailed reset link
  are all skipped for it (`isPhoneAccountEmail`, `SessionUser.phone`).
- Staff may approve a claim whose owner has either confirmed their email or verified their phone.
- A claim made at sign-up uses the number just verified as the number staff call.
- A business that is not in the directory is named after its owner until they add it; the add form does not offer
  that name as the business's.

## Pieces

| Piece | Where |
| --- | --- |
| `users.phone_number`, `phone_number_verified`; `account_otps` | `packages/db` schema, migrations 0072, 0073 |
| Code rows, `findUserByPhone` | `packages/db/src/queries/account-otps.ts` |
| Placeholder address | `packages/db/src/phone-account.ts` |
| Phone account, set password | `packages/auth/src/phone-account.ts`, `create-auth.ts` (additional fields) |
| Ask for / confirm a code | `apps/platform/lib/server/account-otp.ts` |
| Sign-up steps | `lib/join-form.ts`, `lib/server/listing-account.ts`, `app/app-host/join`, `components/panel/join-form.tsx` |
| Sign-in | `lib/server/customer-sign-in-form.ts`, `lib/server/sign-in.ts`, shared `SignInForm` (`identifier`) |
| Reset by code | `lib/server/phone-password-reset.ts`, `app/app-host/forgot-password`, `components/panel/forgot-password-form.tsx` |
| Showing the number | `lib/server/account-label.ts`, layout, Settings |

## Out of scope

- A real SMS provider.
- Changing the number an account signs in with (email us).
- Moving existing email listing accounts to a number.
- Texting the owner when a visitor sends an enquiry (the email notice is skipped for a phone account).
