# Staff access

The staff console is its own app (`apps/admin`) on its own address: **https://staff.fynix.digital** in production, beside the
customer dashboard at https://localbusiness.fynix.digital. Set `ADMIN_ORIGIN=https://staff.fynix.digital` in both apps'
environments (`apps/admin/.env.production.example`, `apps/platform/.env.production.example`).

## Two origins, no shared cookie

Each app signs people in on its own host and sets a **host-only** session cookie (no `Domain` attribute), so the browser never
sends the dashboard's cookie to the console, or the console's to the dashboard. Nothing is configured to share a cookie
across `fynix.digital`; do not add a `Domain=.fynix.digital` cookie or Better Auth's `crossSubDomainCookies`. Staff get a
12-hour session (customers get longer). Both apps list the two origins as trusted (`trustedOrigins`); every other origin is
refused. Checked locally with the dashboard on `localbusiness.localhost:3098` and the console on
`admin.localbusiness.localhost:3099`: two cookies, one per host, neither with a domain; a customer's session cookie sent to
the console opens nothing (redirected to sign-in), because reaching a console page also needs an active staff record.

## Creating the first staff user (production)

There is no sign-up for staff and none from the web: accounts are made only by this command, run on the server, from the
repository root, with the production environment loaded (it reads `ADMIN_ORIGIN`, `DATABASE_URL_STAFF`,
`BETTER_AUTH_SECRET`):

```bash
pnpm staff:create --email you@fynix.digital --name "Your Name" --role admin
```

It asks twice for a password with no echo (at least 14 characters, and not in a known data breach: it checks Have I Been
Pwned by sending only a 5-character hash prefix; if that service is unreachable it creates nothing). It needs an interactive
terminal. Run it again with another email for each person; run it for an email that already has an account to give that
account console access without changing its password. `--role` is `support`, `finance` or `admin` (default `admin`).
To take access away, set `active = false` on the person's row in `staff_members` (their record and log stay).

## Roles

| Role | Can do |
| ---- | ------ |
| `support` | The day to day: leads, clients and support requests. Nothing that moves money, and no access log. |
| `finance` | Everything `support` can, plus Pricing, Invoices and their export, payments, charges, waivers, upgrades. |
| `admin` | Everything, including the access log. |

The console's directory sections (Directory, Places, Ads, Deals, Affiliates) are switched off for Fynix: those addresses answer
"not found".

## The access log

Every sign-in and every opening of personal data in the console writes a row to `staff_access_log` (shown on the console's
**Access log** page, `admin` only): who (the staff member), what (`staff.sign_in`, `client.view`, `lead.view`, `invoice.view`,
`invoice.export`, `support_ticket.view`, `support_attachment.view`, `outbox.view`, `privacy_request.*`, `breach.*`,
`access_log.view`, `access.denied`), which record, which business, the result (`ok`, `failed` for a wrong password, `denied`
for a refused request), the IP address, and a short note with no personal data. It is append-only: the staff database role can
read and insert, never edit or delete. Rows are deleted by the nightly retention job once they are past 400 days
(`docs/operations/retention-schedule.md`). A nightly email (`apps/platform/lib/security-review.ts`) lists staff whose activity
is unusually high; bursts of blocked sign-ins also email the team (`docs/operations/security-alerts.md`).

## Sign-in protection that exists today

- Rate limits per network, per account and overall on staff sign-in (the tightest: 8 tries per account from one network in 15 minutes), and the robot check
  (Cloudflare Turnstile) when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` are set. Without them the check is off, and the server
  logs a warning at start.
- A long password, checked against known breaches when it is first set.

## Two-factor authentication: it does not exist

There is **no second factor** in this console today: not an authenticator app, not an email or SMS code, not a passkey. A
staff account is protected by its password alone (plus the limits above). Treat that as the main risk of exposing the console to the internet.

## Recommendations

1. Put the console behind **Cloudflare Access** (or another identity-aware proxy) with the team's own identity provider and a
   second factor, so `staff.fynix.digital` is not reachable at all without it. This is the quickest real second factor.
2. Or, at least, an **IP allow-list** (Cloudflare WAF rule or the server's firewall / nginx `allow`) for `staff.fynix.digital`
   to the office and the team's VPN.
3. Use `admin` for as few people as possible; day-to-day staff are `support` or `finance`. Review the Access log weekly.
4. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` in production, and `SECURITY_ALERT_EMAIL` to a monitored inbox.
5. Keep `staff.fynix.digital` off search engines and links (the console already sends `noindex`); do not put its address in
   customer emails.
6. Deactivate people the day they leave. Rotate `BETTER_AUTH_SECRET` after a suspected leak (this signs everyone out).
7. Plan real two-factor sign-in (Better Auth has a two-factor plugin) before the console is reachable without 1 or 2.
