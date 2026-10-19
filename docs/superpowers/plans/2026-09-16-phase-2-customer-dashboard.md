# Phase 2: Customer Dashboard and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer who signs in to `app.localhost` finds a real dashboard: a home screen that tells them their next step, a five-step onboarding form that collects everything we need to build their website, and a project page showing where their build is.

**Architecture:** Onboarding data lives in its own tenant-scoped tables (profile, hours, services, brief, domain, media), written by the customer through the RLS-bound app connection, so no customer write needs staff privileges. A `projects` row carries the build's state machine; the home card, the onboarding lock and the project timeline are all derived from it. Uploaded images go through a `MediaStorage` interface with a local-disk adapter, and are re-encoded on upload so no customer file is ever served as it arrived.

**Tech Stack:** pnpm workspace, Next.js 16 App Router (server actions, route handlers), drizzle-orm + PostgreSQL 14 with RLS, zod 4, sharp, Vitest.

---

## Ground rules for the engineer

- **Source of truth:** `docs/superpowers/specs/2026-09-15-fynix-platform-design.md` §3 (journey), §3.2 (dashboard home), §4.3–4.5 (data model), §5.3 (project lifecycle), §5.5 (domain), §6 (media). This plan wins where they disagree.
- **Billing is on hold** (decided 2026-09-16). The payment wall is being built separately and has been paused. Onboarding must work without it.
- **Drafts save freely; submitting is the gated action.** Saving an onboarding step is allowed before payment, so a customer can prepare everything. **Submitting** onboarding starts the build and ends refund eligibility, so it will require payment. Build `submitOnboarding` so the billing check is one clearly-named call (see Task 11); if `requireBillingAccess` exists in `apps/web/lib/server/billing.ts` when you get there, call it; if it does not, leave submission open and record that in this plan's "Deliberately deferred" list.
- **A domain is required to submit.** The customer's decision: domain problems are sorted on the sales call, there is no free Fynix fallback address, and onboarding cannot be submitted without a domain the customer says they own. The team never asks for registrar logins.
- **Customers write through the app connection only.** Every new tenant table gets RLS policies that let `fynix_app` read and write its own business's rows. No new exception to the staff-connection rule in `apps/web/lib/server/db.ts`.
- **After submission the onboarding data is read-only for the customer.** Enforce it in the server actions, not just the UI.
- **No invented timelines or claims.** The only promised duration anywhere is the spec's "first preview within 48 hours" after submission.
- **Do not commit. Do not start a dev server** (the user runs one on port 3000 against the dev database). Migrations only on the dev database — never delete or rewrite existing rows. The test database is yours.
- Checkpoint after every task: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm --filter @brandbasket/db test:integration` for database tasks.
- Read `packages/db/migrations/meta/_journal.json` for the next free migration number before generating one; the billing work may have added some.

---

### Task 1: Tables

**Files:**
- Create: `packages/db/src/schema/projects.ts`, `packages/db/src/schema/onboarding.ts`, `packages/db/src/schema/media.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: two migrations (generated tables, hand-written grants)

- [ ] **Step 1: Projects**

`projects.ts`:

```ts
export const projectStatus = pgEnum("project_status", [
  "onboarding",
  "submitted",
  "building",
  "preview",
  "revisions",
  "approved",
  "live",
  "on_hold",
  "cancelled",
]);
export type ProjectStatus = (typeof projectStatus.enumValues)[number];

export const projectKind = pgEnum("project_kind", ["initial_build", "redesign"]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    kind: projectKind("kind").notNull().default("initial_build"),
    status: projectStatus("status").notNull().default("onboarding"),
    onboardingSubmittedAt: timestamp("onboarding_submitted_at", { withTimezone: true }),
    /** First preview promised by this time: 48 hours after submission. */
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    onHoldReason: text("on_hold_reason"),
    revisionRoundsIncluded: integer("revision_rounds_included").notNull().default(2),
    revisionRoundsGranted: integer("revision_rounds_granted").notNull().default(0),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // One open project per business; finished and cancelled ones accumulate.
    uniqueIndex("projects_one_open_per_business_idx")
      .on(table.businessId)
      .where(sql`${table.status} not in ('live', 'cancelled')`),
  ],
);

export const onboardingStep = pgEnum("onboarding_step", ["business", "content", "brand", "domain", "review"]);
export type OnboardingStep = (typeof onboardingStep.enumValues)[number];

export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id),
    businessId: uuid("business_id").notNull().references(() => businesses.id),
    step: onboardingStep("step").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.step] })],
);
```

- [ ] **Step 2: What the customer tells us**

`onboarding.ts` — one table per concern, all keyed by `business_id`:

- `business_profiles` (PK `business_id`): `display_name`, `tagline`, `description`, `phone`, `email`, `address_line1`, `address_line2`, `city`, `region`, `postal_code`, `country`, `service_areas`, `google_business_url`, `updated_at`. All text; everything except `display_name` nullable.
- `business_hours`: `id`, `business_id`, `day_of_week` (integer 0–6, Monday = 0, `CHECK` in the migration), `opens_at` and `closes_at` (`time`, nullable), `closed` (boolean). A day may have several rows for split shifts. Index on `business_id`.
- `services`: `id`, `business_id`, `name`, `summary` (nullable), `price_text` (nullable — "From $40", "Call for a quote"), `position` (integer), `created_at`, `updated_at`, `deleted_at`. Index on `(business_id, position)`.
- `project_briefs` (PK `project_id`): `business_id`, `notes_for_builder`, `style_likes`, `reference_urls` (`text[]`, default `'{}'`), `updated_at`.
- `domains`: `id`, `business_id`, `hostname`, `status` (enum `pending` | `awaiting_dns` | `verifying` | `misconfigured` | `active` | `degraded`, default `pending`), `is_primary` (boolean default true), `owner_confirmed_at` (timestamp — when the customer ticked "I own this domain"), `created_at`, `updated_at`, `removed_at`. Unique index on `lower(hostname)` where `removed_at is null`.

- [ ] **Step 3: Media**

`media.ts`:

- `media_asset_status` enum: `ready` | `rejected`. (The spec's `uploading` / `processing` states belong to the background worker, which does not exist yet; uploads here are processed in the request.)
- `media_asset_purpose` enum: `logo` | `photo`.
- `media_assets`: `id`, `business_id`, `purpose`, `storage_key`, `original_filename`, `mime_type`, `bytes`, `width`, `height`, `sha256`, `alt_text` (nullable), `status`, `uploaded_by_user_id` (text, references `users.id`), `created_at`, `deleted_at`. Index on `(business_id, purpose, created_at)`.

`original_filename` is kept for the customer's own reference only. It must never appear in a storage key or a URL.

- [ ] **Step 4: Migrations and grants**

Generate the tables (`drizzle-kit generate --name onboarding`), then add `CHECK (day_of_week between 0 and 6)` and `CHECK (opens_at < closes_at or closed)` by hand to the generated SQL.

The grants migration follows `0004_funnel_grants.sql`, and the tenant helper is `app_current_business_id()`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON business_profiles, business_hours, services, project_briefs, domains, media_assets TO fynix_app;
GRANT SELECT, INSERT, UPDATE ON onboarding_progress TO fynix_app;
GRANT SELECT, UPDATE ON projects TO fynix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects, onboarding_progress, business_profiles, business_hours, services, project_briefs, domains, media_assets TO fynix_staff;
```

Every table: `ENABLE ROW LEVEL SECURITY`, a `*_tenant_all` policy `FOR ALL TO fynix_app USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id())`, and a `*_staff_all` policy for `fynix_staff`.

`projects` is the exception for customers: they may read their project and **update** it (submission is a customer transition), but never insert or delete one. Customers moving a project to any status other than `submitted` is prevented in the query layer (Task 2) and proven by a test.

- [ ] **Step 5: Give every existing business a project**

In the tables migration, after the `CREATE TABLE`s:

```sql
-- Businesses created before projects existed start at onboarding, like every new one.
INSERT INTO projects (id, business_id, kind, status)
SELECT gen_random_uuid(), b.id, 'initial_build', 'onboarding'
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.business_id = b.id);
```

Apply: `pnpm db:migrate && pnpm db:migrate:test`.

---

### Task 2: Queries

**Files:**
- Create: `packages/db/src/queries/projects.ts`, `packages/db/src/queries/onboarding-data.ts`, `packages/db/src/queries/media.ts`
- Modify: `packages/db/src/index.ts`, `packages/db/src/queries/onboarding.ts`
- Test: `packages/db/src/onboarding.integration.test.ts`

All customer-side queries take the scoped app transaction the existing tenant code uses (read how `apps/web/lib/server/customer-access.ts` opens it before writing anything), and never accept a `businessId` from the browser: it always comes from the session's tenant.

- [ ] **Step 1: Projects**

- `findOpenProject(tx)` → the tenant's open project or null.
- `submitProject(tx, { projectId, now })` → one statement: `UPDATE projects SET status = 'submitted', onboarding_submitted_at = now, sla_due_at = now + 48h WHERE id = $1 AND status = 'onboarding' RETURNING …`. Zero rows → throw `ProjectNotInOnboardingError`. The `WHERE status = 'onboarding'` is the gate; a double submit fails.
- No other customer-side transition exists in this phase.

- [ ] **Step 2: Onboarding data**

For each step, one read and one save:

- `getBusinessProfile` / `saveBusinessProfile` (upsert on `business_id`)
- `getBusinessHours` / `replaceBusinessHours` (delete the tenant's rows and insert the new set, in one transaction)
- `listServices` / `replaceServices` (soft-delete removed rows, update kept ones by id, insert new ones, rewrite positions — one transaction)
- `getProjectBrief` / `saveProjectBrief`
- `getPrimaryDomain` / `savePrimaryDomain` (normalises the hostname: trim, lowercase, strip a leading `www.` into a separate apex row is **not** done here — store exactly one primary hostname for now)
- `markStepComplete(tx, projectId, step)` / `listStepProgress(tx, projectId)`

Every save first checks the project is still `onboarding` inside the same transaction and throws `OnboardingLockedError` otherwise. That is the server-side lock.

- [ ] **Step 3: Account creation creates the project**

In `redeemInviteIntoBusiness` (and `attachAccountToNewBusiness`), insert the `onboarding` project in the same transaction that creates the business. When billing returns, project creation moves to payment confirmation, per the spec; leave a one-line comment saying so.

- [ ] **Step 4: Integration tests**

- A redeemed invite produces exactly one `onboarding` project.
- The app role can save and read back every step for its own business, and sees nothing of another business's.
- After `submitProject`, every save throws `OnboardingLockedError` and nothing changes.
- A second `submitProject` throws `ProjectNotInOnboardingError`.
- The app role cannot insert a project, and cannot set a status other than `submitted` through `submitProject` (there is no function that does, and a raw `UPDATE … SET status = 'live'` is covered by Task 11's server check — note in the test why the database alone allows it).
- A second open project for one business is rejected by the partial unique index.
- Hours with `opens_at >= closes_at` on an open day are rejected by the `CHECK`.
- Two businesses cannot both hold `Example.com` and `example.com` as live domains.

---

### Task 3: Media storage

**Files:**
- Create: `apps/web/lib/server/media-storage.ts`, `apps/web/lib/server/media-upload.ts` (+ tests)
- Create: `apps/web/app/app-host/media/[mediaId]/route.ts`
- Modify: `apps/web/.gitignore` (add `.data/`), `apps/web/package.json` (add `sharp`)

- [ ] **Step 1: The interface**

```ts
export interface MediaStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ readonly bytes: Uint8Array; readonly contentType: string } | null>;
  delete(key: string): Promise<void>;
}
```

`createLocalMediaStorage(rootDir)` writes under `apps/web/.data/media`. Resolve every key against the root and refuse any key whose resolved path escapes it. Keys are `t/{businessId}/{mediaId}/{variant}`, built only from ids.

- [ ] **Step 2: Processing an upload**

`processUpload(file: File)`:
1. Refuse anything over the upload limit before reading it all. (Now 4 MB, to fit under Vercel's 4.5 MB request cap, enforced by the `/api/uploads` route before the body is read; the route sits outside the proxy so Next never buffers the body first, and images are shrunk in the browser to about 3 MB. Changed after the security reviews.)
2. Detect the real type from the first bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF….WEBP`). Ignore the browser's `type` and the file extension. Everything else — including HEIC and SVG — is refused with a message saying which formats are accepted.
3. Re-encode with sharp: `.rotate()` (apply EXIF orientation), resize to fit within 2400px, output WebP. Re-encoding drops all metadata, **including GPS**. Record width, height, bytes and SHA-256 of the output.
4. Return the processed bytes and facts. No database writes here.

Tests with small fixture images committed under `apps/web/lib/server/__fixtures__/`: a JPEG with GPS EXIF comes out with no EXIF; a PNG renamed `.jpg` is detected as PNG; a text file named `.png` is refused; an oversized buffer is refused without being decoded.

- [ ] **Step 3: Serving**

`GET /media/[mediaId]` on the app host: require the customer session, load the asset through the tenant-scoped connection (so another tenant's id simply isn't found → 404), and stream it with `Content-Type` from the row, `Cache-Control: private, max-age=3600`, and `X-Content-Type-Options: nosniff`.

---

### Task 4: The customer shell

**Files:**
- Create: `apps/web/components/panel/customer-shell.tsx`, `apps/web/components/panel/customer-nav.tsx`
- Modify: `apps/web/app/app-host/(protected)/layout.tsx`

- [ ] **Step 1: Same frame as the staff console**

Copy the structure of `apps/web/components/panel/admin-shell.tsx`: sidebar with the logo, the sections, and the account chip with the business name under the person's name. No search bar and no "Add lead" button; the top bar instead shows the business name.

Sections, and only these: **Home** (`/`), **Set up your website** (`/onboarding`), **Your project** (`/project`).

- [ ] **Step 2: Keep the billing slot**

If the billing work has left a `BillingBanner` rendered in this layout, keep it exactly where it is, above the page. Do not add one if it isn't there.

---

### Task 5: Home

**Files:**
- Modify: `apps/web/app/app-host/(protected)/page.tsx`
- Create: `apps/web/components/panel/next-step-card.tsx`, `apps/web/lib/next-step.ts` (+ test)

- [ ] **Step 1: The next step, as a pure function**

`nextStep({ project, completedSteps })` returns one of:
- `{ kind: "start-onboarding" }` — onboarding, nothing completed
- `{ kind: "continue-onboarding", completed, total }` — onboarding, some completed
- `{ kind: "building", slaDueAt }` — submitted or building
- `{ kind: "on-hold" }`
- `{ kind: "none" }` — any other state (preview, revisions and the rest belong to later phases; show nothing rather than a guess)

Test every branch.

- [ ] **Step 2: The card**

| Kind | Heading | Body | Button |
|---|---|---|---|
| start-onboarding | Tell us about your business | It takes about 15 minutes, and you can stop and come back. Your answers save as you go. | Start → `/onboarding` |
| continue-onboarding | Carry on setting up | `{completed} of {total} steps done.` plus a progress bar | Continue → `/onboarding` |
| building | We're building your website | Your first preview will be ready by `{slaDueAt, formatted with day and time}`. | View progress → `/project` |
| on-hold | Your build is paused | We'll be in touch about what we need from you. | — |

"About 15 minutes" is the one estimate on the page; keep it only if the five steps really are that short once built, and cut it if not.

- [ ] **Step 3: The tour stays**

Keep the `FeaturePreview` tour under the card if the billing work added it.

---

### Task 6: The onboarding frame

**Files:**
- Create: `apps/web/app/app-host/(protected)/onboarding/layout.tsx`, `page.tsx` (redirects to the first incomplete step), `apps/web/components/panel/onboarding-steps.tsx`
- Create: `apps/web/lib/onboarding-steps.ts`

- [ ] **Step 1: Step metadata in one place**

```ts
export const ONBOARDING_STEPS = [
  { step: "business", slug: "business", title: "Your business", blurb: "Name, contact details and opening hours." },
  { step: "content", slug: "content", title: "What you offer", blurb: "Your services and anything we should know." },
  { step: "brand", slug: "brand", title: "Logo and photos", blurb: "The pictures that will make it look like you." },
  { step: "domain", slug: "domain", title: "Your domain", blurb: "The web address your website will live at." },
  { step: "review", slug: "review", title: "Check and send", blurb: "Look it over, then send it to us." },
] as const satisfies readonly { step: OnboardingStep; slug: string; title: string; blurb: string }[];
```

- [ ] **Step 2: The frame**

A numbered step list (01–05) down the left on wide screens and across the top on phones, each marked done, current or to do, with links so customers can jump between steps freely. After submission every step shows read-only with a notice: `You've sent this to us. To change anything now, leave a note for your builder on Your project.`

Each step page is a form that saves with a server action and then moves to the next step. Every action: `requireCustomerAccess()`, validate with zod, write through the tenant transaction, `markStepComplete`, `redirect` to the next step. On error, return the typed values so nothing is lost — reuse the pattern in `apps/web/components/get-started-flow.tsx` (values echoed back, the failing field focused and marked `aria-invalid`).

---

### Task 7: Step 01 — Your business

**Files:** `apps/web/app/app-host/(protected)/onboarding/business/page.tsx`, `actions.ts`, `apps/web/lib/onboarding/business-form.ts` (+ test)

- Business name (required, prefilled from the business), a one-line tagline, a short description (up to 600 characters), public phone, public email, address (line 1, line 2, city, state or region, postal code, country), the areas they serve, and their Google Business Profile link if they have one.
- Opening hours: a row per weekday with open and close times and a "Closed" toggle; "Same hours every weekday" copies Monday down.
- Validation: reuse the phone and email rules from `apps/web/lib/lead-form.ts` (extract them into a shared module rather than copying); the Google link must be `https://`; close must be after open on an open day.

---

### Task 8: Step 02 — What you offer

**Files:** `apps/web/app/app-host/(protected)/onboarding/content/page.tsx`, `actions.ts`, `apps/web/lib/onboarding/content-form.ts` (+ test), `apps/web/components/panel/service-list-editor.tsx`

- A list of services: name (required), a sentence about it, and an optional price note. Add, remove and reorder, at least one required, at most 20.
- "Anything else we should know?" (`notes_for_builder`), "Websites you like the look of" (up to 5 `https://` links), and "Anything you'd like it to feel like?" (`style_likes`).
- The list editor is a client component whose rows serialise into indexed form fields (`services.0.name` …); the server parses them with zod and never trusts the order it was sent in beyond reading the index.

---

### Task 9: Step 03 — Logo and photos

**Files:** `apps/web/app/app-host/(protected)/onboarding/brand/page.tsx`, `actions.ts`, `apps/web/components/panel/media-uploader.tsx`

- One logo (optional — "No logo yet? That's fine, we'll set your name in a clean typeface.") and up to 20 photos.
- Each photo needs a short description before the step can be completed ("Describe the photo for people who can't see it"). This is the alt text the spec requires before an image can be published.
- Uploads go one file at a time through a server action that calls `processUpload`, stores the result, and inserts the `media_assets` row. Show a thumbnail (served from `/media/[id]`), a remove button, and a clear error per failed file.
- Rate-limit uploads per business (60 per hour).

---

### Task 10: Step 04 — Your domain

**Files:** `apps/web/app/app-host/(protected)/onboarding/domain/page.tsx`, `actions.ts`, `apps/web/lib/onboarding/domain-form.ts` (+ test)

- One field: the domain, e.g. `yourbusiness.com`. Accept what people paste (`https://www.YourBusiness.com/`) and normalise to the bare hostname.
- A required checkbox: `I own this domain, or I can get into the account it's registered with.`
- Plain help: `You'll need to change two settings with the company you bought it from. We'll show you exactly what to change once your website is approved. We'll never ask for your login.`
- Validation: a real hostname (labels of letters, digits and hyphens, a TLD of at least two letters, 253 characters at most), and not one of Fynix Digital's own hosts.
- A hostname already claimed by another business shows `That domain is already connected to another website. Tell us on your project page and we'll sort it out.` — never whose.

---

### Task 11: Step 05 — Check and send

**Files:** `apps/web/app/app-host/(protected)/onboarding/review/page.tsx`, `actions.ts`, `apps/web/lib/server/onboarding-checklist.ts` (+ test)

- [ ] **Step 1: The checklist, on the server**

`onboardingChecklist(data)` returns each requirement with whether it passes: business name, a phone or an email, at least one service, a described photo or a logo, and a confirmed domain. Pure function, tested for every item.

- [ ] **Step 2: The page**

A summary of every step, each with an Edit link, then the checklist with anything missing linked to its step, then the submit button: `Send it to us`. Underneath: `Once you send this, we start building and your answers are locked. You can still leave notes for your builder.`

- [ ] **Step 3: The action**

`submitOnboarding`:
1. `requireCustomerAccess()`.
2. **Billing gate:** if `apps/web/lib/server/billing.ts` exports `requireBillingAccess`, call it here and show `Make your first payment to send this to us.` with a link to `/billing` when it refuses. If it does not exist, skip this and add a line to "Deliberately deferred" below.
3. Re-run the checklist on the server; refuse with the first missing item.
4. `submitProject`, then redirect to `/project`.

---

### Task 12: Your project

**Files:** `apps/web/app/app-host/(protected)/project/page.tsx`, `apps/web/components/panel/project-timeline.tsx`

- A vertical timeline of the build: Set up your website → We build it → You review it → It goes live. Each stage done, current or upcoming, derived from `project.status`.
- While submitted or building: `Your first preview will be ready by {slaDueAt}.`
- A read-only summary of what they sent, with the domain and the services.
- "Note for your builder" is **not** in this phase; say `Need to change something? Email us at {businessDetails.email}.` instead.

---

### Task 13: End-to-end verification

1. Build, start `fynix-verify` on port 3100.
2. Create a customer through the real funnel (staff → setup link → password).
3. Home shows "Tell us about your business".
4. Fill every step, including uploading a JPEG taken on a phone. Download it back from `/media/[id]` and confirm it is WebP with no EXIF (`exiftool` or `sharp().metadata()`).
5. Try to open another business's media id → 404.
6. Leave the domain out and try to submit → refused, linked to the domain step.
7. Submit. Home shows the building card with a date 48 hours out; every step is read-only; a direct POST to a step's action is refused.
8. Clean up everything created, including files under `apps/web/.data/media`.

---

## Added during the build: the staff Clients view

Without it, a submitted onboarding was invisible to the team. Built alongside Tasks 5–12 (2026-09-16):

- `packages/db/src/queries/clients.ts` — `listClients`, `findClientDetail` and `findMediaForStaff`, staff connection only, with malformed ids treated as not found. Covered by `clients.integration.test.ts`.
- `/clients` on the admin host: every business with its owner, stage, currency and join date, plus counts for "still setting up" and "waiting on us".
- `/clients/[businessId]`: owner, build dates, setup progress, business details, hours, services, domain, notes for the builder, and the photos with their descriptions.
- `/media/[mediaId]` on the admin host, sharing its response and security headers with the customer route through `storedMediaResponse`.
- A "View client" button on a lead once its account exists, and Clients in the staff sidebar.

## Deliberately deferred

(Payment before submission is no longer deferred: since Phase 1C resumed on 2026-09-16, a first payment sends
onboarding itself, and `submitOnboarding` calls `requireBillingAccess` and refuses without payment.)

- Notes to the builder after submission, and the whole of the staff side of projects (Phase 3).
- Previews, revisions and approval (Phase 5); domains beyond `pending` (Phase 6); the CMS (Phase 7).
- HEIC uploads (needs conversion) and SVG logos (staff only, per the spec).
- Background media processing; uploads are processed in the request for now.
