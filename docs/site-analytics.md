# First-party site analytics

Every customer website can report its own visits, taps and form sends to the platform, with no Google account connected. The
monthly reports read the numbers this produces. Plan: `docs/plans/56-first-party-site-analytics.md` in the Brandbasket workspace.

## What is collected, and what is not

A page view (path, the referring site's origin, the campaign words in the address), and a tap on a call, email, WhatsApp,
directions, social, download or other outside link, a form send, and the time and furthest scroll on a page. Never stored: IP
address, user agent, exact location, cookies, any identifier that lasts past the day, form contents, text typed anywhere.

The visitor is a daily hash of the address, the browser and the business, with a random salt that is deleted after two days. The
address and the browser are discarded as soon as the hash is made. The script uses no cookie and no storage, and stops for a
visitor who sends Do Not Track or Global Privacy Control. Whether this needs a consent notice anywhere is a legal question for
counsel; do not switch it on for customers before that is answered and the privacy wording is approved.

## Parts

| Part | Where |
|---|---|
| The script | `apps/platform/public/t/v1.js`, served at `/t/v1.js` (cached for an hour). Tests: `apps/platform/lib/tracker/v1.test.ts`, including a 3 KB gzip budget |
| The ingest route | `POST /api/t`: `app/api/t/route.ts`, decisions in `lib/server/site-hit-handler.ts`, connections in `lib/server/site-hit-deps.ts` |
| The store | `site_keys`, `site_hits`, `visitor_salts` (migration 0202), queries in `packages/db/src/queries/site-hits.ts` |
| The pure rules | `packages/shared/src/lib/analytics/` |
| The nightly roll-up | `POST /api/internal/roll-up-site-analytics`, run by `brandbasket-site-rollup.timer` |
| The install panel | The client's Website tab in the console: Site tracking |

## Installing it on a customer's site

1. In the console, open the client's Website tab and press **Create tracking key** (Site tracking).
2. Copy the snippet into every page of their site. It is one line:
   `<script defer src="https://app.brandbasket.in/t/v1.js" data-key="bbk_..."></script>`
3. A site we build also adds `data-bb-forms="server"` to the tag, because its own server already counts form sends.
4. Load the site once and reload the console page: "Last event received" shows a time.

`data-endpoint` overrides where the script sends. A site we build can point it at a path on the customer's own domain that
rewrites to `https://app.brandbasket.in/api/t`, which keeps ad blockers from dropping the events. `window.bb("name")` sends an
event of the site's own; `data-bb-event="name"` on any element does the same on a click.

The browser's page host must be one of the business's own hostnames (the domains on its record), or a subdomain of one. A site
with no hostname yet, such as one still on a preview address, is not counted.

## The nightly job

`brandbasket-site-rollup.timer` starts at 21:00 UTC (02:30 in India). It calls the dashboard's own
`/api/internal/roll-up-site-analytics` on 127.0.0.1 with `SITE_ANALYTICS_TOKEN` from `/srv/brandbasket/shared/platform.env.local`
(`make-env-files.sh` generates it; add it by hand to a file made before this existed, then restart the app). It:

1. Rolls the last two Indian days (yesterday and the day before) into `metric_daily` (`own.*`) and the month so far into
   `metric_breakdowns` (source `own`), for every business that has sent a hit or used the older server route.
2. Notes each measured day in `report_source_runs`, so a report can tell a measured zero from a day not measured.
3. Deletes hits older than 90 days and salts older than yesterday.

A business whose script is live gets every metric (a quiet day is a measured zero). A site with no script gets only call,
WhatsApp and form numbers, from the older `site_events` route, and only on days it counted something. One business failing is
recorded in `report_source_runs` and the rest carry on. Running it twice writes the same numbers.

Preview without changing anything:

```bash
runuser -u brandbasket -- /usr/local/sbin/brandbasket-site-rollup-job --env-file /srv/brandbasket/shared/platform.env.local --dry-run
```

The answer is a JSON report: days rolled, businesses, days written and skipped, lists written, failures (business id and error
class only) and how many hits and salts were deleted.

## Numbers will differ from Google Analytics

Visitors are counted per day, so the same person on two days is two visitors. Bots, ad blockers and definitions differ. The report
footer says so. Treat these as a floor, and as one definition used for every customer.

## When something looks wrong

| Sign | Check |
|---|---|
| "No event received yet" after loading the site | The tag is on the page; the page's host is one of the business's hostnames; the business's plan is live; the visitor is not sending Do Not Track |
| The job fails with 503 | `SITE_ANALYTICS_TOKEN` is missing or under 32 characters in `platform.env.local` |
| The job fails with 401 | The token in the file differs from the one the running app loaded; restart the app |
| A business shows in `failures` | `report_source_runs` has a failed `own` row for it with the error class; run the dry run for that night again |
