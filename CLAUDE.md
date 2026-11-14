# brandbasket-platform

The customer dashboard and staff console behind Brandbasket's Local Business plans. A business owner signs up with an email address, picks Managed Website, pays, then manages their website, social and search work, billing and requests. Staff run the same data from a separate console. `README.md` has local setup; `docs/` has operations and deployment runbooks.

Stack: pnpm 10 workspace · Node 24 · Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · zod · PostgreSQL with row-level security · Drizzle · Better Auth · Payload CMS · Razorpay · Brevo · Sentry · Vitest.

Each app has its own `CLAUDE.md` (`apps/customer/`, `apps/admin/`) with app-specific rules, and its own `DESIGN.md`.

## Branches and deploys

- Work on `development`. `main` is production and only changes through a PR from `development`.
- CI (`.github/workflows/ci.yml`) runs on every PR and on pushes to `development` and `main`: lint, typecheck, unit tests and build, and in parallel a job that creates a Postgres, runs `db:roles`, migrations, Payload migrations and the integration tests.
- Deploys: `.github/workflows/deploy.yml` builds `main` on a GitHub runner after CI passes and ships it to the Firstfold VPS, which installs, migrates and switches `customer` and `admin` with health checks (`deploy/vps/`, runbook `docs/deployment/brandbasket-vps.md`). The VPS's own pull-based autodeploy and CI timers are paused while this is in use; `docs/deployment/brandbasket-droplet.md` is superseded.

| Surface | App | Production | Local (README) |
|---|---|---|---|
| Customer app | `apps/customer` | https://app.brandbasket.in | http://localhost:3197 |
| Staff console | `apps/admin` | https://console.brandbasket.in (behind Cloudflare Access) | http://console.brandbasket.localhost:3199 |

`apps/customer` is the only customer app: the dashboard, the public APIs the client websites call (`/api/site`, `/api/t`, `/api/leads`, `/api/pricing`), the payment and other webhooks (`/api/webhooks/*`), the timer jobs (`/api/internal/*`) and the blog image routes. In production it is the systemd unit `brandbasket-customer` on port 3202, and the console is `brandbasket-admin` on 3203.

`pnpm dev` starts both on 3197 (customer) and 3199 (admin), with the hosts above. Fynix uses `app.localhost:3098` and `staff.localhost:3099`; the different host names keep the two apps from sharing cookies.

## Packages

| Package | Import | Holds |
|---|---|---|
| `packages/db` | `@brandbasket/db` | Schema (`src/schema/*.ts`), migrations (`migrations/`), scoped queries (`src/queries/`), scope helpers (`src/scope.ts`), rate limiting, env and role scripts |
| `packages/shared` | `@brandbasket/shared/...` | UI (`src/ui`, `src/ui/panel`, `src/ui/forms`), helpers (`src/lib`: `cn`, `money`, `access`, calendar), server logic (`src/server`: charges, add-ons, plan upgrades, tax invoicing), theme CSS (`src/styles/theme.css`) |
| `packages/auth` | `@brandbasket/auth` | Better Auth setup and the `staff:create` command |
| `packages/billing` | `@brandbasket/billing` | Fake and Razorpay providers, Razorpay webhook verification, billing rules |
| `packages/email` | `@brandbasket/email` | Templates, Brevo transport, the `email_messages` outbox |
| `packages/cms` | `@brandbasket/cms` | Payload collections, config and migrations, in its own database `brandbasket_platform_payload` |

The scope is still `@brandbasket/*`; renaming it is planned.

## Data access rules

- Three database roles, three connections. The customer app uses the app role for customer work (row-level security, scope every query with `withUserScope` or `withTenantScope` from `@brandbasket/db`), the public role only for lead intake, and the staff role for console and system work. The console has only the staff connection.
- Every page, route handler and server action checks access itself. Layouts are never the only guard.
- Accounts are only created by server code: the email-confirmed sign-up and `pnpm staff:create`. There is no public account API.
- The customer app and the console are separate origins with host-only session cookies. Never add a `Domain=.brandbasket.in` cookie or Better Auth `crossSubDomainCookies` (`docs/STAFF-ACCESS.md`).
- Nothing is sent to phones; every code is emailed. Without `BREVO_API_KEY`, mail is only written to the outbox, which staff read in the console. A server with an https `APP_ORIGIN` refuses to start without Brevo or with `EMAIL_CODE_BYPASS`.
- Unset `BILLING_PROVIDER` means the fake provider: no money moves. Razorpay test mode needs the signed webhook, so run `pnpm dev:tunnel`.
- Never add invented clients, results, testimonials or logos.

## Dormant code

The dashboard's directory and clinic pages and the public directory and booking endpoints were removed in plan 35. Still in the tree and switched off: the free-listing account type (`signup_choice = listing_only`, a business of kind `listing`), the directory and clinic tables and queries in `packages/db`, and the console's directory sections. Do not build on them without asking.

## Tests

- Unit tests are `*.test.ts(x)` next to the source, run by `pnpm test`.
- Integration tests are `*.integration.test.ts` and need Postgres: `pnpm test:integration` migrates `brandbasket_platform_test` first, then runs them one package at a time. Run them when you touch `packages/db`, RLS, billing, tax invoicing or email.

## Commands

```bash
pnpm install
pnpm dev                     # customer (3197) and admin (3199)
pnpm dev:customer            # customer only; dev:admin for the console only
pnpm lint
pnpm typecheck               # next typegen + tsc in every package
pnpm test
pnpm test:integration
pnpm build
pnpm --filter @brandbasket/db db:generate   # new migration from the schema
pnpm db:migrate              # dev database; db:migrate:test for the test database
pnpm cms:migrate             # Payload migrations; cms:migrate:create to add one
pnpm staff:create --email you@example.com --name "Your Name" --role admin
pnpm env:check --customer <file> --admin <file>   # validate server env files
```

Before calling a change done, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build`, plus `pnpm test:integration` for the areas listed under Tests.
