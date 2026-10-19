# Client website starter

The parts every Brandbasket client website needs to read its content from the platform, and to go down properly when the client's plan ends.

| File | What it is |
| --- | --- |
| `lib/brandbasket.ts` | `brandbasketGet(path)`: calls `/api/site/*` with the site token and returns `ok`, `offline` or `error`. |
| `components/maintenance.tsx` | The full-page "under maintenance" notice, with the Brandbasket builder typing at his laptop, glancing up now and then (`components/builder.tsx`). |
| `app/layout.tsx` | Example root layout: shows the notice instead of every page while the plan has ended. |

## Environment

Set these in the site's hosting (Vercel), not in the code:

- `BRANDBASKET_API_ORIGIN`: `https://app.brandbasket.in`
- `BRANDBASKET_SITE_TOKEN`: the Site API token from the client's page in the console.

Optional, for the maintenance notice (the platform sends no business details once a plan has ended):

- `SITE_BUSINESS_NAME`: "Riverside Dental is taking a short break".

## When the plan ends

The platform answers `403 { "code": "site_offline" }` to every `/api/site/*` request. `brandbasketGet` returns `{ kind: "offline" }`,
and the layout renders `Maintenance` in place of the whole site. When the client pays again the next request succeeds and the
site comes back by itself, within a minute (the pages are reused for 60 seconds).

Handle `offline` wherever the site calls the platform from outside the layout too (a booking form's submit, for example): show
the same notice, never a raw "HTTP 403".
