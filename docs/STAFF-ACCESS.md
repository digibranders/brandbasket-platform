# Staff access

The staff console is its own app (`apps/admin`) on its own address: **https://console.brandbasket.in** in production, beside the
customer dashboard at https://app.brandbasket.in. Set `ADMIN_ORIGIN=https://console.brandbasket.in` in both apps'
environments (`apps/admin/.env.production.example`, `apps/platform/.env.production.example`).

## Two origins, no shared cookie

Each app signs people in on its own host and sets a **host-only** session cookie (no `Domain` attribute), so the browser never
sends the dashboard's cookie to the console, or the console's to the dashboard. Nothing is configured to share a cookie
across `brandbasket.in`; do not add a `Domain=.brandbasket.in` cookie or Better Auth's `crossSubDomainCookies`. Staff get a
12-hour session (customers get longer). Both apps list the two origins as trusted (`trustedOrigins`); every other origin is
refused. Checked locally with the dashboard on `app.localhost:3098` and the console on
`staff.localhost:3099`: two cookies, one per host, neither with a domain; a customer's session cookie sent to
the console opens nothing (redirected to sign-in), because reaching a console page also needs an active staff record.

## Creating the first staff user (production)

There is no sign-up for staff and none from the web: accounts are made only by this command, run on the server, from the
repository root, with the production environment loaded (it reads `ADMIN_ORIGIN`, `DATABASE_URL_STAFF`,
`BETTER_AUTH_SECRET`):

```bash
pnpm staff:create --email you@brandbasket.in --name "Your Name" --role admin
```

It asks twice for a password with no echo (at least 8 characters with a letter, a number and a symbol, the same rule as
customers, and not in a known data breach: it checks Have I Been Pwned by sending only a 5-character hash prefix; if that
service is unreachable it creates nothing). It needs an interactive terminal. Run it again with another email for each person; run it for an email that already has an account to give that
account console access without changing its password. `--role` is `support`, `finance` or `admin` (default `admin`).
To take access away, set `active = false` on the person's row in `staff_members` (their record and log stay).

## Roles

| Role | Can do |
| ---- | ------ |
| `support` | The day to day: leads, clients and support requests. Nothing that moves money, and no access log. |
| `finance` | Everything `support` can, plus Pricing, Invoices and their export, payments, charges, waivers, upgrades. |
| `admin` | Everything, including the access log. |

The console's directory sections (Directory, Places, Ads, Deals, Affiliates) are switched off for Brandbasket: those addresses answer
"not found".

## The access log

Every sign-in and every opening of personal data in the console writes a row to `staff_access_log` (shown on the console's
**Access log** page, `admin` only): who (the staff member), what (`staff.sign_in`, `client.view`, `lead.view`, `invoice.view`,
`invoice.export`, `support_ticket.view`, `support_attachment.view`, `outbox.view`, `privacy_request.*`, `breach.*`,
`access_log.view`, `access.denied`), which record, which business, the result (`ok`, `failed` for a wrong password or a wrong
sign-in code, `denied` for a refused request), the IP address, and a short note with no personal data. It is append-only: the staff database role can
read and insert, never edit or delete. Rows are deleted by the nightly retention job once they are past 400 days
(`docs/operations/retention-schedule.md`). A nightly email (`apps/platform/lib/security-review.ts`) lists staff whose activity
is unusually high; bursts of blocked sign-ins also email the team (`docs/operations/security-alerts.md`).

## Signing in: password, then an emailed code

Every console sign-in has two steps, for every role:

1. **Password.** The email and password are checked, with the robot check and the rate limits below. A right password
   starts **no session**. It emails a 6-digit code to the address on the account and shows the code step.
2. **Code.** The session is made only when that code is entered. Until then no session cookie exists and no console page loads.

The code:

- is 6 digits, valid for **5 minutes**, works **once**, and allows **5 tries**; the fifth wrong try ends it and the person
  signs in again from the password;
- is stored only as an HMAC (keyed with `BETTER_AUTH_SECRET`, salted with the row's id) in `account_otps`, purpose
  `staff_sign_in`; the outbox copy of the email has the code removed;
- is limited per network (10 codes an hour, 30 checks an hour), per address (3 codes in 10 minutes, 10 a day) and overall
  (500 codes a day), with the same limiter as the other emailed codes;
- is sent only after a right password, so a wrong password, an unknown address and an address with no password all get the
  same answer and no email: nothing says which addresses are staff.

Two details that make the second step real, not decoration:

- A session made by the console's sign-in carries `sessions.second_factor_at`. The console treats a session without it as no
  session. So a password-only session made elsewhere (the same person signing in at app.brandbasket.in) cannot be carried to
  the console.
- An invited person who sets a password at the invite link is not signed in by that; they sign in with the code like anyone else.

Every step is in the access log (`staff.sign_in`): `ok` when the code finished the sign-in; `failed` with the note `wrong password`,
`wrong code` or `code tries used up` for a staff account. Bursts of failed sign-ins already email the team
(`docs/operations/security-alerts.md`).

Local development: the code is written to the outbox like other mail. The outbox is inside the console, so to read the first
one, set `EMAIL_CODE_BYPASS=true` in `apps/admin/.env.local` (any 6 digits then finish the step, as for the sign-up code), or
read the `email_messages` table. A real deployment (https `APP_ORIGIN`) refuses to start with the bypass set and refuses to
start without `BREVO_API_KEY`, so codes always go out by email there.

### When this was released

Sessions that existed before the release have no `second_factor_at`, so the console stops honouring them: every staff member
is sent to the sign-in page once and signs in with the code. Nothing is deleted and no one is locked out. Their dashboard
sessions (app.brandbasket.in) are untouched.

### A locked-out staff member

What can lock someone out, and what to do. Run the command on the server, from the repository root, with the production
environment loaded (as for `staff:create`):

```bash
pnpm staff:reset-2fa --email asha@brandbasket.in
pnpm staff:reset-2fa --email asha@brandbasket.in --new-email asha.rao@brandbasket.in
```

| Situation | What to do |
| --------- | ---------- |
| The code does not arrive | Check spam; wait for a minute; sign in again for a new one (3 in 10 minutes). If Brevo is down, codes cannot be sent until it is back: the Brevo dashboard shows delivery. |
| They hit a limit (3 codes in 10 minutes, 10 a day) | Wait, or run `pnpm staff:reset-2fa --email <address>`: it lifts the code limits and the account-wide sign-in limit, removes unused codes and ends their sessions. |
| They lost the mailbox, or the address changed | `pnpm staff:reset-2fa --email <old> --new-email <new>`: moves the account to the new address; the next code goes there. The password does not change. |
| They suspect their password is known | `pnpm staff:reset-2fa --email <address>` ends their sessions; they then use **Forgot password** on the sign-in page, which also ends every session. |

The command refuses an address that is not a staff account, so it cannot hand an address to a customer. It issues no code and
cannot sign anyone in. It needs the server (`DATABASE_URL_STAFF`), which is the same trust as `staff:create`. Do it only for a
person you have recognised outside the console (a call, in person).

## Sign-in protection besides the code

- Rate limits per network, per account and overall on the password step (the tightest: 8 tries per account from one network
  in 15 minutes), and the robot check (Cloudflare Turnstile) when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` are set. Without
  them the check is off, and the server logs a warning at start.
- A long password, checked against known breaches when it is first set.
- 12-hour sessions.

The code is a second factor in the sense that the mailbox is a second thing to get into, but it is not independent of
everything: someone who controls both the password and the staff member's mailbox (for example the same reused password) passes
it. That is why Cloudflare Access (below) is still recommended: it puts a separate identity check in front of the page.

## Recommendations

1. Put the console behind **Cloudflare Access** with an allow-list of the team's emails, so `console.brandbasket.in` is not
   reachable at all without a second, independent login. Step by step: `docs/deployment/cloudflare-access.md`. It is not done
   yet; the owner does it in the Cloudflare dashboard.
2. Use `admin` for as few people as possible; day-to-day staff are `support` or `finance`. Review the Access log weekly.
3. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` in production, and `SECURITY_ALERT_EMAIL` to a monitored inbox.
4. Keep `console.brandbasket.in` off search engines and links (the console already sends `noindex`); do not put its address in
   customer emails.
5. Deactivate people the day they leave (`active = false` on their `staff_members` row). Rotate `BETTER_AUTH_SECRET` after a
   suspected leak (this signs everyone out and ends any code in flight).
6. Staff should not share one mailbox: the code goes to the address on the account.
