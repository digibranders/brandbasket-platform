# Rules for every implementation agent

Read this fully before touching code. These rules come from the repo's `CLAUDE.md` files (root, `apps/customer`, `apps/admin`), the owner's decisions, and the audit.

## 1. What you are working on

BrandBasket platform: a pnpm 10 workspace, Node 24, Next.js 16 (App Router), TypeScript, Tailwind v4, zod, Postgres with row level security, Drizzle, Better Auth, Payload CMS, Razorpay, Brevo, Vitest. Apps: `apps/customer` (customer app, `app.brandbasket.in`) and `apps/admin` (staff console, `console.brandbasket.in`). Packages: `packages/db`, `shared`, `auth`, `billing`, `email`, `cms`. The customer app is the only customer app: dashboard, public APIs, webhooks, timer jobs.

## 2. Product facts you must not break

- Services: Website, Social Media, Paid Ads at ₹2,999 a month each (USD 59 outside India), GST included. Dedicated Expert Monitoring ₹6,000 (USD 99), free with all three plans. Live offers stay as they are: ₹1 first month on Social and Ads, "Yearly, Save 10%". Do not change prices or offers.
- Paid Ads is display only for now. Do not build Paid Ads workflows.
- Social is automated by social-auto (`social.digibranders.com`, repo `digibranders/social-auto`). The customer sets it up and runs it in the app. There is no Social staff work.
- There is one staff account (admin role). All BrandBasket staff work is done from it in the staff console. Do not build per-person owners, "Unowned" lists or role splits.
- Managed only. No DIY mode.
- Kickoff call wording: "Call completed" (never "held"). Customer messages: before the call "Your kickoff call is booked for <time>"; after the call time and before confirmation "We will start your website right after your call"; after Call completed "Thanks for the call. We are getting your website started".
- Approved homepage copy and the "Start my plan" button text are locked. New copy needs the owner's approval: put it in your report.

## 3. Code rules

- TypeScript strict. No `any`. Explicit return types on exports. Validate input at boundaries with zod. Throw specific errors.
- Check existing patterns before inventing new ones. Reuse components in `packages/shared/src/ui` and the design tokens. Light theme only. Never use raw colours.
- Every page, route handler and server action checks access itself. Scope every database query with `withUserScope` or `withTenantScope`. Never add a `Domain=.brandbasket.in` cookie.
- Tests first for logic: write the failing test, then the change. Unit tests sit next to the source as `*.test.ts(x)`. Database behavior needs `*.integration.test.ts` and a `_test` database.
- No unrequested UI: build exactly what your spec says, no extra buttons, helper text or clever interactions.
- Money, entitlement and deletion code must stay idempotent and keep their existing guards. When unsure, stop and write the question in your report.
- Comments only for the why. No placeholders, no "fix later".

## 4. Your environment

- Work only in your worktree (`../bb-wpNN`) on branch `wp/NN-short-name`.
- Create your own databases: `createdb brandbasket_platform_wpNN` and `createdb brandbasket_platform_wpNN_test`. Run `pnpm db:roles` once. Roles are shared and idempotent.
- Build your environment in the shell only, never in a file: copy the role passwords from `apps/customer/.env.local` at run time without printing them, point `DATABASE_URL`, `DATABASE_URL_STAFF`, `DATABASE_URL_PUBLIC`, `DATABASE_URL_OWNER` to your database, set `DATABASE_URL_PAYLOAD` to a separate payload database or reuse `brandbasket_platform_v4b_payload`, then:
  `BREVO_API_KEY=` `RAZORPAY_KEY_ID=` `RAZORPAY_KEY_SECRET=` `RAZORPAY_WEBHOOK_SECRET=` `SOCIAL_AUTO_URL=` `SOCIAL_AUTO_KEY=` (all blank), `BILLING_PROVIDER=fake`, `EMAIL_CODE_BYPASS=false`, `APP_ORIGIN=http://localhost:<customer port>`, `ADMIN_ORIGIN=http://console.brandbasket.localhost:<admin port>`, `CLIENT_SITE_BASE_DOMAIN=sites.example.test`.
  Blank values (not unset) stop Next from reloading real values from `.env.local`.
- Sign-up codes appear in the local outbox (`email_messages` table). Sign-up allows 10 code requests an hour per network; clear `rate_limit_buckets` in your own database when testing.
- Seed data: `pnpm --filter @brandbasket/db db:seed:v4` only works on `brandbasket_platform_v4`, `_v4b` or `_preview`. For your own database create fixtures in tests or by signing up through the app with fake billing.
- Never print secrets. Never edit `.env*`. Never call production or real third party services.
- Follow the repo dev server rule: check what is already listening before starting a server, never kill a process on a port you did not start, use your own ports.

## 5. Before you call a package done

Run from your worktree root and record the results in your report:

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration     # required if you touched packages/db, RLS, billing, tax invoicing, email or payments
```

Fix failures. Do not skip checks. If an unrelated test flakes under load, rerun that file alone and say so in the report.

## 6. Git rules

- Commit to your branch with a plain first line saying what changed for the customer or the team, then why. No attribution lines, no emoji, no em or en dashes.
- Do not merge into `development` yourself unless you are the merger agent. Push your branch and open a pull request into `development`.
- Do not touch files outside your package's owned paths unless the spec lists them under "shared". If you must, make the smallest change and list it in your report.

## 7. When you are blocked

Write the question in your report under "Open questions" and do the safe part of the package. Do not guess about pricing, roles, deletion, payments or customer copy.
