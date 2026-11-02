# Cloudflare Access for the staff console

**Status: not done.** This page is for the owner. Nothing here has been applied; every step is in the Cloudflare dashboard (and
one check on the server). Until it is done, `console.brandbasket.in` is protected by the console's own sign-in only: a password
(`docs/STAFF-ACCESS.md`).

What it adds: before anyone reaches the console's sign-in page, Cloudflare asks them to prove their email address with a
one-time PIN and checks it against a list. A stranger with a stolen password never sees the page.

What it does not change: the console keeps its own password. Access is a second wall in front, not a replacement.

## Before you start

- You need the Cloudflare account that holds the `brandbasket.in` zone, with the Zero Trust product available. The Free plan covers
  up to 50 users, which is enough.
- The console host must already be proxied (orange cloud) in the zone. It is: `console` is a proxied AAAA record
  (`docs/deployment/brandbasket-vps.md`, step 9).
- Have the list of staff email addresses ready. They must be addresses that can receive mail, because Access sends each person a
  PIN. They do not have to be the same as the console accounts, but using the same ones is simplest.
- Keep a way back in: stay signed in to the Cloudflare dashboard in one tab while you test, so you can switch the application off.

## 1. Set up Zero Trust (first time only)

1. Open https://one.dash.cloudflare.com and choose the Brandbasket account.
2. If asked, create the team: pick a **team name** (for example `brandbasket`). People will see `brandbasket.cloudflareaccess.com`
   when they log in. Choose the Free plan.

## 2. Allow one-time PIN logins

1. **Settings** > **Authentication** > **Login methods**.
2. Make sure **One-time PIN** is listed. Add it if not. This needs no identity provider: Cloudflare emails a 6-digit PIN to the address.
   (If the team already uses Google Workspace or Microsoft sign-in, add that instead and use it in the policy below.)

## 3. Create the application

1. **Access** > **Applications** > **Add an application** > **Self-hosted**.
2. Application name: `Brandbasket console`.
3. Session duration: **12 hours** (the console's own session is 12 hours, so the two end together).
4. **Add public hostname**: type `Input`, subdomain `console`, domain `brandbasket.in`, path empty. Do not add `app.brandbasket.in`:
   the customer dashboard must stay public.
5. Accepted identity providers: tick **One-time PIN** (or your provider). Leave "Instant Auth" off.
6. Continue to the policy step.

## 4. Create the policy (who is allowed)

1. Policy name: `Staff`. Action: **Allow**. Session duration: same as the application.
2. **Include** rule: selector **Emails**, then enter each staff address, one at a time (or choose **Emails ending in** and enter
   `@brandbasket.in` if every staff address uses that domain and nobody outside the team has one).
3. Add no other Include rule. In particular, do not choose **Everyone**, and do not add a **Bypass** policy.
4. Under **Rules** > **Require**, nothing is needed. If you want Access to insist on a country as well, add **Country** there.
5. Save the application.

Cloudflare evaluates policies top to bottom and denies anyone who matches none, so the application is closed to everyone not listed.

## 5. Application settings worth turning on

In the application's **Settings** (the edit page):

- **Enable HTTP Only cookie attribute**: on.
- **Same Site cookie attribute**: leave at the default, or `Lax`. Do not use `None`.
- **Enable binding cookie**: on, if shown.
- **App Launcher visibility**: off (the console should not be listed to everyone).

## 6. Service token for health checks: none needed

The server's own health checks (`deploy/vps/brandbasket-platform-release`) ask `http://127.0.0.1:3203/login` directly on the
VPS, not through Cloudflare, so Access never sees them and no service token is required.

Only if you later add an **outside** uptime monitor that fetches `https://console.brandbasket.in/login` through Cloudflare:

1. **Access** > **Service credentials** > **Service Tokens** > **Create Service Token**. Name `uptime-monitor`, duration as short
   as you can tolerate. Copy the Client ID and Client Secret now: the secret is shown once.
2. Edit the application, add a second policy named `Monitor`: Action **Service Auth**, Include **Service Token**, choose
   `uptime-monitor`.
3. Give the monitor the two headers `CF-Access-Client-Id` and `CF-Access-Client-Secret`.
4. Never use **Bypass** for a path or a monitor: a bypass is open to everyone, not just the monitor.

No other service calls the console from outside: the Razorpay webhook and the sign-up pages are on `app.brandbasket.in`.

## 7. Test it

1. Open a private browser window and go to `https://console.brandbasket.in/login`. You should land on a Cloudflare Access page
   (`brandbasket.cloudflareaccess.com`), not on the console's sign-in.
2. Enter an email that is **not** on the list. You should get no PIN and no way in.
3. Enter a listed email, then the PIN from your inbox. You should now reach the console's own sign-in page; sign in with the
   password as usual.
4. From a terminal (no cookie), `curl -sI https://console.brandbasket.in/login | head -3` should show `302` with a `location`
   on `cloudflareaccess.com`, not `200`.
5. Check `https://app.brandbasket.in/login` still opens normally with no Access page.

If something is wrong, open the application in the Cloudflare dashboard and switch its policy off or delete the application;
the console is then back to password only.

## 8. nginx and the origin: what to check on the server

Access is enforced by Cloudflare, so the server must only accept traffic that came through Cloudflare. It already does; check it
still does after any nginx change.

Run these from the Mac and on the server (they are the ones in `docs/deployment/brandbasket-vps.md`):

```bash
# From anywhere: the origin address must not answer (ufw admits 80 and 443 from Cloudflare's ranges only). Expect 000 or a timeout.
curl -m 5 -sk --resolve console.brandbasket.in:443:201.18.196.170 https://console.brandbasket.in/login -o /dev/null -w '%{http_code}\n'

# On the server, as the owner: loopback still works (this is what the release health check uses). Expect 200.
curl -sk --resolve console.brandbasket.in:443:127.0.0.1 https://console.brandbasket.in/login -o /dev/null -w '%{http_code}\n'

# On the server: the site file still refuses non-Cloudflare peers. Expect the 403 rule to be present.
grep -n 'console_denied' /etc/nginx/sites-available/brandbasket
sudo nginx -t
```

Know the limit: `nginx` checks that the request came **from a Cloudflare address**, not that it came **through your Cloudflare
zone and Access**. Someone with their own Cloudflare account could, in theory, point a record of theirs at the server's IPv6
address and reach the console without passing your Access policy. They would still face the console's password.
To close this fully, either validate the `Cf-Access-Jwt-Assertion` header at the origin (Cloudflare documents the keys at
`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`) or enable per-zone Authenticated Origin Pulls with your own client
certificate and `ssl_verify_client on` in the console's server block. Neither is set up; they are changes to `deploy/vps/nginx/`
that need their own review and a deploy, so ask for them as a follow-up if you want them.

## 9. After it is live

- Add a person: edit the `Staff` policy and add their email. Remove a person the day they leave, in the policy **and** by setting
  `active = false` on their `staff_members` row (`docs/STAFF-ACCESS.md`).
- A person who is locked out of Access, not the console: check that their address is on the list and spelt as they type it.
- Update `docs/STAFF-ACCESS.md` recommendation 1 and the "Owner decisions" note in `docs/deployment/brandbasket-vps.md` once it is done.
