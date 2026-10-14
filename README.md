# Fynix platform

The customer dashboard and staff console behind Fynix Digital's Local Business plans. A business owner creates an
account with their **email address**, chooses **Care** or **Premium**, pays, and manages their website, chatbot,
billing and support from the dashboard. Fynix staff run the same data from a separate staff console.

It will live at `localbusiness.fynix.digital`, on Fynix's own server. This repository is fully separate from Firstfold:
its own database, its own staff console, its own secrets. It was started from Firstfold's platform and still carries
Firstfold-only code (directory and listing features, the free plan, SMS sign-up) that a later clean-up removes;
`PLATFORM_BRAND=fynix` makes every host wear the Fynix brand, sell Care and Premium only, and register with email.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4, zod, PostgreSQL, Drizzle and Better Auth, in a pnpm
workspace. The Fynix marketing site (`fynix.digital`) is a separate repository.

## Local setup

Requires Node 24+, pnpm 10 and a local PostgreSQL where your macOS user can create databases and roles.

```bash
pnpm install
pnpm env:init                                   # writes both apps' .env.local with fresh secrets
createdb fynix_platform && createdb fynix_platform_test && createdb fynix_platform_payload
pnpm db:roles                                   # application roles (cluster-wide: shared by every database on this Postgres)
pnpm db:migrate && pnpm db:migrate:test
pnpm staff:create --email you@example.com --name "Your Name"
```

Then edit `apps/platform/.env.local` (and `apps/admin/.env.local`) so the database URLs name the databases above, and set:

```
PLATFORM_BRAND=fynix
APP_ORIGIN=http://localbusiness.localhost:3098
NEXT_PUBLIC_APP_URL=http://localbusiness.localhost:3098
ADMIN_ORIGIN=http://admin.localbusiness.localhost:3099
EMAIL_CODE_BYPASS=true        # local only: any 6 digits confirm an email sign-up
```

Start the dashboard with `cd apps/platform && npx next dev -p 3098`, and the staff console with
`cd apps/admin && npx next dev -p 3099`. Use Chrome or Firefox, which resolve `*.localhost` to your machine.

| Surface          | URL                                         |
| ---------------- | ------------------------------------------- |
| Customer sign-in | http://localbusiness.localhost:3098         |
| Staff console    | http://admin.localbusiness.localhost:3099   |

Payload keeps its own schema in `fynix_platform_payload` with its own migrations (`pnpm cms:migrate`); in development
Payload pushes schema changes itself.

## Accounts and email

- **Create account** (`/login?new=1`): business name, your name, email, password (at least 10 characters), the Terms
  box, and a plan (Care or Premium). A 6-digit code is emailed to the address (10 minutes, 5 tries, rate limited per
  network, per address and overall); the account is opened only once it is entered, with the address already confirmed.
  The owner then pays on the plan's page and lands on the dashboard.
- **Sign in**: email and password. **Forgot password**: a one-time link by email.
- **Email delivery**: with `BREVO_API_KEY` set, mail goes out through Brevo (API v3) as "Fynix Digital" from
  `FYNIX_MAIL_FROM` (default `no-reply@fynix.digital`), with a redacted copy in the database outbox. Without it, mail is
  only recorded in the outbox (`email_messages`, which staff read in the console); locally the sign-up code and reset
  links stay readable there. A server that real customers can reach (an https `APP_ORIGIN`) refuses to start without
  `BREVO_API_KEY`, and refuses `EMAIL_CODE_BYPASS`.
- Accounts opened with a mobile number (Firstfold's path) still sign in with it.

## Scripts

| Command                 | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm dev`              | Start both apps (ports 3001 and 3003; use the commands above for 3098 and 3099) |
| `pnpm build`            | Production build of both apps                                    |
| `pnpm lint`             | ESLint across both apps                                          |
| `pnpm typecheck`        | Type-check every workspace package                               |
| `pnpm test`             | Unit tests (Vitest)                                              |
| `pnpm test:integration` | Migrate the test database, then run database-backed tests        |
| `pnpm db:migrate`       | Apply migrations to the development database                     |
| `pnpm cms:migrate`      | Apply Payload's migrations (production; dev pushes automatically)|
| `pnpm staff:create`     | Make someone the superadmin (creates the account if needed)      |

## Paying locally

Unset, `BILLING_PROVIDER` is the fake provider: Pay opens a local "Test payment" page and no money moves. To use
Razorpay's real Checkout instead, set `BILLING_PROVIDER=razorpay` with Razorpay **test** keys in both apps'
`.env.local`, and `RAZORPAY_WEBHOOK_SECRET` in the platform's (variables in `apps/platform/.env.example`). A plan only
activates when Razorpay's signed webhook arrives, which cannot reach localhost: run `pnpm dev:tunnel` beside the
dashboard and set the webhook URL in Razorpay's dashboard to the address it prints.

## Where things live

```
apps/
  platform/   customer dashboard and API routes
  admin/      staff console, its own Next app with its own build and deploy
packages/
  shared/     UI, helpers and theme CSS
  db/         schema, migrations, row-level security, scoped queries, rate limiting
  auth/       Better Auth setup. Accounts can only be created by this repository's own server code.
  billing/    payment providers and billing rules
  email/      email templates, the Brevo transport and the local outbox
  cms/        Payload collections, config and migrations: its own database, shared by both apps
docs/         operations notes, and the platform specs and plans written while this was Firstfold's
```

The package scope is still `@firstfold/*`; renaming it is a later step.

## How access works

- The dashboard and the console are separate apps on separate origins, and each session cookie is host-only, so a customer session is never valid in the staff console.
- Accounts cannot be created from the outside: only the sign-up's server code (after a confirmed email code) and the staff command can create one.
- Customer data is protected by PostgreSQL row-level security. The app connects as a role that can only read rows belonging to the signed-in user's business.
- Every page and server action checks access itself; layouts alone are never relied on.

## Content rules

- Never add invented clients, results, testimonials or logos.
