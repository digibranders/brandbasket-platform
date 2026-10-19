@AGENTS.md

# apps/admin: staff console

The app at console.brandbasket.in where Brandbasket staff run clients, billing, support and compliance. Production sits behind Cloudflare Access. Repo-wide rules are in `../../CLAUDE.md`; visual rules are in `DESIGN.md` here.

## Access

- Staff accounts are created only with `pnpm staff:create` on the server (`docs/STAFF-ACCESS.md`). Roles are `support`, `finance` and `admin`.
- Every page and server action starts with `requireStaffAccess()` from `lib/server/staff-access.ts`. It also checks the session belongs to an active staff record, so a customer session opens nothing here.
- Sessions are host-only cookies on this origin and last 12 hours.

## Data

- This app has one connection: `getStaffDb()` in `lib/server/db.ts`. There is no row-level security here, so every query must name the business it acts on explicitly.
- Staff opening customer data is recorded for DPDP Rules 2025 r.6(1)(c) through `lib/server/staff-access-log.ts`, shown at `/access-log`. Call `logStaffAccess` on new customer-data pages, and `logStaffAccessOrThrow` on exports and downloads so nothing is served unlogged.
- Shared domain logic (charges, add-ons, plan upgrades, tax invoices) comes from `@brandbasket/shared/server` and `@brandbasket/db`. Do not fork it into this app.

## Where things live

| Path | Holds |
|---|---|
| `app/(protected)/` | Console sections: home, clients, leads, invoices, pricing, coupons, referrals, affiliates, ads, deals, support and `support/errors`, outbox, privacy requests, breaches, access log, leaving, geography, directory, settings |
| `app/login/` | Staff sign-in |
| `app/(protected)/**/actions.ts` | Server actions, beside the page that uses them |
| `lib/server/` | Console server logic, auth, session, staff access, access log |
| `lib/*.ts` | Form state, notices and view helpers, most with a `.test.ts` beside them |
| `components/console/` | Console building blocks |
| `app/console.css` | Console-only surfaces (glass, Journey motion) |

## UI

Tokens come from `packages/shared/src/styles/theme.css`. Follow `DESIGN.md`, including its "Money" and "Not allowed" sections.

## Commands (from this folder)

```bash
npx next dev -p 3199     # with ADMIN_ORIGIN=http://console.brandbasket.localhost:3199 in .env.local
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Env template: `.env.example` (local) and `.env.production.example`.
