# Client website starter

The parts every Brandbasket client website needs to read its content from the platform, and to go down properly when the client's plan ends.

| File | What it is |
| --- | --- |
| `lib/brandbasket.ts` | `brandbasketGet(path)`: calls `/api/site/*` with the site token and returns `ok`, `offline` or `error`. |
| `components/maintenance.tsx` | The full-page "under maintenance" notice, with the Brandbasket builder typing at his laptop, glancing up now and then (`components/builder.tsx`). |
| `app/layout.tsx` | Example root layout: shows the notice instead of every page while the plan has ended. |
| `proxy.ts` | Answers every request with the notice as a 503 (with `Retry-After` and `noindex`) while the plan has ended, so the site's own API routes and form posts are covered too. Uses `lib/offline-check.ts` (the answer kept for a minute) and `lib/maintenance-response.ts` (the notice as plain HTML, because Next refuses `react-dom/server` inside the proxy). |

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

With `proxy.ts` in place a request from outside the layout (a booking form's submit, for example) is stopped before it reaches the site, with the same notice as a 503. Without it, handle `offline` there yourself: show the same notice, never a raw "HTTP 403".

The platform also pauses the site's Vercel project once the plan has ended (`docs/site-hosting.md`), so a site that skips the template still goes down.
