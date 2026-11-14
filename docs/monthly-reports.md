# Monthly customer reports

Every customer gets a report each month for each service they have: Website, Social & Ads and Local SEO + AEO. A report is written
from real records only, reviewed by staff in the console, and then sent: the customer reads it in the app (Reports) and can
download it as a PDF, and the owner gets an email. Plan: `docs/plans/53` to `55` and `58` in the Brandbasket workspace.

## The rules a report follows

- Every figure comes from a record: the site checks, the enquiries table, the work staff logged (posts, pages, listings, "What we
  did" lines) and the figures staff entered (reach, followers, ad campaigns, keywords on page one). Nothing is estimated.
- A figure that was not measured is left out. It is never shown as zero. An enquiry channel counts as measured only once the
  business has had at least one enquiry on it, so a site that never sent a call tap is not told "0 calls".
- A service with nothing measured for the month gets no report.
- Every figure carries its unit and its month or date in its label. There is no combined score.
- A change against the month before is shown only when both months were measured the same way. A fall is worded as plainly as a rise.
- Months are Indian calendar months (a check at 01:30 on 1 November in India belongs to November).
- Prices and ad spend use the business's currency. Dollar customers never see tax wording.

## Visitors and Google search

The report reads these from the stored metrics, whoever collects them: `ga4.*` (Google Analytics) and `own.*` (our site script) for the
Website report, `gsc.*` (Search Console) for the Local SEO + AEO report. Daily numbers are in `metric_daily`, ranked lists in
`metric_breakdowns` (`channel` and `page` for `ga4` and `own`, `query` and `page` for `gsc`, rows `{ key, count }`), and the days each
source was pulled in `report_source_runs`.

- A source is reported only when successful runs cover at least 90 percent of the month's days, so a source connected on the 20th does
  not report a "month" of 11 days. Inside a covered month a day with no row is zero.
- Google Analytics is used for visitors when it measured the whole month, otherwise our own script when it did, otherwise the figure
  is left out. The month before is compared only when the same source measured it completely.
- Search Console's average position is weighted by each day's views (it cannot be summed or averaged across days).
- Lists (where enquiries came from, how visitors found the site, most viewed pages, top searches, top pages from Google) are stored in
  the report's optional `lists`. A reader that does not know `lists` ignores it.
- Nothing here connects to Google. How the customer's Google data is collected (service account or OAuth) belongs to the collectors;
  a collector only has to write the metrics above.

## Parts

| Part | Where |
|---|---|
| Report content, version 1 (`headline`, `figures`, `whatWeDid`) | `packages/shared/src/lib/reports/content.ts` |
| The sentences (pure, tested) | `packages/shared/src/lib/reports/compose.ts` |
| Visitor and search figures (pure) | `packages/shared/src/lib/reports/traffic.ts` |
| Raw records for one business and month | `packages/db/src/queries/report-facts.ts` |
| Composing drafts, sending a report | `packages/shared/src/server/monthly-reports.ts` |
| The PDF (pdf-lib, Hanken Grotesk, rupee sign as a vector) | `packages/shared/src/server/report-pdf.ts` |
| The owner's email | `packages/email/src/templates/monthly-report.ts` |
| Staff review | the console, Clients, Reports (`apps/admin/app/(protected)/reports`) |
| The monthly job | `pnpm reports:run`, `brandbasket-monthly-reports.timer` |
| Customer reading and downloading | `apps/customer/src/features/reports`, `/reports/[month]/pdf` |

## How a month goes

1. On the 1st (21:30 UTC, 03:00 on the 2nd in India) the job writes a draft for every business and service. Run again, it rewrites
   drafts and held reports from the latest records, and leaves approved and sent ones alone.
2. Staff open Clients, Reports. Each row opens the report as the customer will read it. Staff can **Hold** a report (a figure looks
   wrong) or **Send to customer**.
3. Sending approves the report, makes the PDF, stores it in media storage at `reports/<id>/pdf`, sets `pdf_key` to
   `reports/<id>.pdf`, marks the report sent and emails the owner. The PDF is stored before the report is marked sent, so a customer
   never sees a Download PDF link with nothing behind it. If a step fails the report stays approved and Send can be pressed again.
4. The email goes to the business owner unless they turned off the `monthly_report` email in their notification settings. The owner
   is told once per report: a second press of Send emails nobody.

## Running the job

```bash
pnpm reports:run -- --dry-run                    # last full month, writes nothing
pnpm reports:run -- --month 2026-10              # a named month
pnpm reports:run -- --business <business id>     # one business
```

The output lists each business and service as `composed`, `nothing-measured`, `frozen` (already approved or sent) or `failed`. A
failure makes the run exit 1.

`brandbasket-monthly-reports.timer` is installed by `deploy/vps/install.sh` and **not enabled**. To turn it on: deploy a release that has
this code, run `pnpm reports:run -- --dry-run` in `/srv/brandbasket/current-customer` and read the list, then
`systemctl enable --now brandbasket-monthly-reports.timer`. To stop it: `systemctl disable --now brandbasket-monthly-reports.timer`.

## Not built here

- Ad and social numbers come from what staff enter (monthly figures and ad campaigns). Another developer is building the
  automation for them; the report reads the same tables, so it will pick the numbers up unchanged.
- No API connection to Meta or Google Ads.
