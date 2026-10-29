@AGENTS.md

# apps/platform: customer dashboard

The app at app.brandbasket.in: sign-up and sign-in, onboarding, the business dashboard, billing and the public APIs that client websites call. Repo-wide rules are in `../../CLAUDE.md`; visual rules are in `DESIGN.md` here.

## Routing

`proxy.ts` (Next 16's replacement for `middleware.ts`) reads the `Host` header, resolves the surface with `resolveSurface` in `lib/surfaces.ts`, and rewrites the request into the `app/app-host/` route group. Every response is marked `noindex`.

- `/api/*` is not rewritten, so API routes answer on any dashboard host.
- Payload's `/admin` UI (`app/(payload)/admin`) is refused with a 404; nobody signs in to Payload. Its REST and GraphQL routes under `app/(payload)/api` sit outside the proxy and 404 on every host but the admin one through `requireAdminHost` (`lib/server/require-admin-host.ts`).
- The directory and clinic pages (Listing, Leads, Reviews, Deals, Advertise, Business, Appointments, Patients) and their public endpoints were removed in plan 35. Their addresses reach the dashboard's missing-page route like any unknown path.

| Path under `app/app-host/` | Holds |
|---|---|
| `(protected)/` | Signed-in dashboard: Home (`page.tsx`, one of four layouts from the project and kickoff state: kickoff, progress, review, ongoing), personalize (the first questions, before payment), requests (and `requests/new`, the intent-first new request form, and `requests/calls`, the Calls page), website (and `website/pages`, `website/enquiries` which holds OyeChats), social and search (each with a card for what we need to start), onboarding, domain, content (blog, authors, categories), details (Business: contact details for every customer, website facts for website clients), billing, services (Your services), plan (checkout before the first payment), settings (and `settings/privacy`, `settings/delete`), changelog (What's new). `todo`, `oyechats`, `monitoring` and `project` only redirect |
| `(support)/support` | Old support links: the list and a ticket redirect to Requests; `actions.ts` keeps the reply and read-receipt actions Requests uses |
| `login`, `join`, `forgot-password`, `reset-password/[token]`, `confirm-email/[token]`, `setup/[token]`, `restore-account` | Account entry points |
| `billing/*` | Pay and confirm pages for plans, charges and services, and the receipts download |
| `affiliate/` | Affiliate portal and setup |

`app/api/` holds the public endpoints: `site/*` (called by client websites with a site token: info, events, posts, media), `leads`, `pricing`, `webhooks/razorpay`, `webhooks/oyechats`, `webhooks/calcom`, upload routes (including `product-photos`), privacy requests and error reports.

## Server code

- Business logic lives in `lib/server/` (one file per concern, about 130 of them). Pages and actions stay thin and call into it. Shared domain logic used by both apps belongs in `packages/shared/src/server`.
- Server actions are `actions.ts` files (a few sections use `commands.ts`) beside the route that uses them, marked `"use server"`.
- Access guards: `requireCustomerAccess`, `requireBillingAccess`, `requireWebsiteAccess` (billing plus the Managed Website service, for blog, details and media writes), `requireWebsiteClient` (the website's pages: onboarding, project, domain, OyeChats, content, details), `requireAffiliateAccess`, and the ownership checks `requireOwnedBlogPost` and `requireOwnedTaxonomyDoc`. Call the right one at the top of every page and action.
- Connections (`lib/server/db.ts`, `lib/server/public-db.ts`):
  - `getAppDb()`: customer work under row-level security. Scope with `withUserScope` or `withTenantScope`.
  - `getPublicDb()`: lead intake only (`POST /api/leads`). That role can only insert leads, rate-limit rows and outbox messages.
  - `getStaffDb()`: system work. Only the exceptions listed in the comment in `lib/server/db.ts` may use it from customer-facing code. Adding a new one needs the same justification written there.
- Take the business id from the session, never from the request body or URL.

## UI

- Tokens come from `packages/shared/src/styles/theme.css`. Shared pieces are in `@brandbasket/shared/ui/panel` and `@brandbasket/shared/ui/forms`; app-only pieces are in `components/panel/`.
- Follow `DESIGN.md`, including its "Not allowed" list and its list of pages still on the older style. Build every new or reworked screen with `components/v2/page.tsx` and `components/v2/classes.ts`.
- Every signed-in page sits in `PageFrame` from `components/v2/page.tsx` (gutters, width, header, rhythm, columns, empty states): `docs/page-frame.md`.

## Commands (from this folder)

```bash
npx next dev -p 3198     # with APP_ORIGIN=http://app.brandbasket.localhost:3198 in .env.local
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Env template: `.env.example` (local) and `.env.production.example`. `pnpm env:init` at the repo root writes `.env.local`.
