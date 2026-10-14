# Payload CMS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every business's individually hand-coded website (built by the admin in VS Code, not generated from a shared template) a small set of content pieces — text and images on its pages, plus a blog — that the *customer* can edit afterward without touching code, using the exact same custom-branded dashboard pages already built (`Content.`, `Monitoring.`). Payload CMS is the backend that holds those pieces. Nobody — not the admin, not the customer — ever opens Payload's own admin screens; both sides only ever use Firstfold's own UI.

**Architecture, corrected 2026-09-18 after a long discussion that found the original version wrong in an important way — read this over the "recap" further down in this file, which is now stale in places (kept for history, not as the current source of truth):**

- **There is no staff team — a single admin does everything.** Drop "staff" from how this plan is read; every "staff" reference below and in earlier tasks means the one admin.
- **The admin does not build sites inside any Firstfold screen.** Each business's website is genuine, separate, hand-written code — the admin builds it in VS Code (or whatever), like any bespoke client site, and deploys/hosts it however that project needs. Firstfold's platform does not generate, template, or scaffold that code, and this plan does not try to.
- **Payload's real job here is the classic headless-CMS pattern**: the admin's hand-written site code fetches specific, named content values from Payload at render time (a headline, a hero photo, the blog list) instead of hardcoding them. The admin decides, while coding, which pieces are editable "slots" and what each one is called (e.g. `heroHeadline`, `heroImage`).
- **The admin also fills in each business's actual starting content**, through a new screen in Firstfold's own admin panel (not Payload's UI — see below), entering values for exactly the slot names used in that business's code. There is no separate "publish" or "transfer" step: the live site and the customer's dashboard both always read the *same* Payload record directly, so the moment a value is saved there, it's simultaneously what the live site will next render and what the customer's dashboard shows them to edit.
- **Neither the admin nor the customer ever opens Payload's own generic admin UI.** Both use Firstfold's own screens — the admin's new page-content screen inside `admin.firstfold.com`, and the customer's existing Content page inside `app.firstfold.com`. Both talk to Payload only through its Local API from our own server code. **This removes the need for `@payloadcms/plugin-multi-tenant` entirely** — that plugin exists to scope Payload's *own* admin UI per logged-in Payload user, which nobody here ever uses. Isolation is enforced the plain way instead: every collection carries a `businessId` field, and every server action — admin-side and customer-side alike — derives that id from the authenticated session, never from client input, and filters every Payload call by it explicitly. (Task 2 installed the plugin expecting to need it and hit a real blocker — see its report — before this correction; removing the dependency is part of the work still to do.)
- **Pages are not a fixed set.** The customer names their own pages during onboarding (a new onboarding addition — out of scope for this plan). What a "page" means here is simply a named group of content slots the admin's code happens to read for that page — it does not define the site's structure or layout, which lives entirely in the admin's hand-written code.
- **Domain connection** ("connect the domain, from inside the admin panel," per the corrected flow) is a real, separate piece of admin-panel work this plan flags but does not build — tracked under "Deliberately deferred."
- **Scope, unchanged from before:** only the CMS content layer is Payload's concern. Leads, billing, onboarding, and login stay exactly as they are, on the existing Postgres system.
- **Where it runs / where its data lives:** unchanged from the original recap below — inside the same `apps/platform` Next.js app and Vercel deployment, with its own separate Postgres database.

**Tech Stack:** Payload CMS 3.x (`payload`, `@payloadcms/next`, `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`), Next.js 16 App Router, TypeScript, Vitest. `@payloadcms/plugin-multi-tenant` was installed in Task 1/2 but is no longer part of the design — remove it as part of the next task that touches `payload.config.ts`.

---

<details>
<summary>Original architecture recap (2026-09-17) — superseded by the correction above, kept for history</summary>

**Where the customer edits:** the existing dashboard pages, unchanged in look and copy. They call Payload's Local API from server actions — the customer's browser never talks to Payload directly, and never sees a Payload login.

**Where staff edits:** ~~Payload's own admin panel~~ — **wrong, see correction above.** The admin now edits through a new Firstfold-built screen, not Payload's own UI.

**Where it runs:** inside the same `apps/platform` Next.js app, deployed with the same Vercel project. No new service to host.

**Where its data lives:** a new, separate Postgres database on the same DigitalOcean account that already hosts the main database.

**Isolation model:** ~~two layers: the multi-tenant plugin's tenant field, and every server action explicitly passing businessId~~ — **the plugin layer is removed; the businessId-from-session discipline is now the only and whole defense, applied everywhere without exception.**

</details>

---

## Ground rules for the engineer

- **Read `docs/superpowers/plans/2026-09-17-cms-foundation.md` and `docs/superpowers/plans/2026-09-17-customer-cms-ui.md` in full first.** This plan retires most of the first and rewires most of the second. You need to know exactly what already exists before removing or replacing it.
- **Do not hand-write Payload's generated scaffold files from memory.** Payload's installer (`create-payload-app`, or `payload init` inside an existing app) generates the actual route handler files, import maps, and config wiring — these are version-specific and have had real bugs around custom paths (see Task 1's notes). Task 1 runs the real installer against this repo and has you read what it produced before touching it, rather than you typing out speculative file contents.
- **Deliberately deferred (do not build in this plan):**
  - The new onboarding step where the customer names their own pages. This plan assumes staff enters page titles directly in Payload when building a business's site; the customer-facing "name your pages" onboarding field is separate follow-up work.
  - Public site rendering / `apps/sites` / a real domain serving a real webpage. Unchanged from the foundation plan's deferral — this plan only makes content editable, not publicly hosted.
  - The $3-per-publish billing workflow. Every edit still writes immediately, same as the foundation plan.
  - Migrating existing seeded businesses' data (from the retired Postgres CMS tables) into Payload. If any business already has a `launchWebsiteForBusiness`-seeded website in the dev database, it is simply left behind when those tables are dropped — there is no production data to migrate yet (confirm this is still true before running Task 7's migration; if it is not, stop and ask the user rather than silently dropping real rows).
- **Do not commit. Do not start a dev server** beyond what a task explicitly needs for verification. The user runs their own separately.
- Checkpoint after every task: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

---

### Task 1: Install Payload and mount it in `apps/platform`

**Files:**
- Create: `apps/platform/payload.config.ts`
- Modify: `apps/platform/next.config.ts`
- Modify: `apps/platform/package.json`
- Create: whatever route files Payload's installer generates under `apps/platform/app/(payload)/` — **do not hand-write these; run the installer and read what it produces**
- Modify: `apps/platform/.env.example`, `apps/platform/.env.local`

- [x] **Step 1: Provision the database**

This is an infrastructure step outside the codebase — confirm with the user (do not do this silently) that a new, separate DigitalOcean Postgres database has been created for Payload, on the existing cluster, and get its connection string. If the user wants to do this themselves, stop here and wait; do not proceed on a guessed or local-only connection string for anything beyond local development.

For local development, create a local database the same way `firstfold`/`webfold_test` were created (see the README): `psql -h localhost -c "CREATE DATABASE webfold_payload"`.

- [x] **Step 2: Install packages**

```bash
cd apps/platform
pnpm add payload @payloadcms/next @payloadcms/db-postgres @payloadcms/richtext-lexical @payloadcms/plugin-multi-tenant sharp
```

`sharp` is Payload's recommended image-resizing dependency for its upload feature — needed since this plan uses Payload's own upload handling for gallery and blog cover images (see Task 3).

- [x] **Step 3: Add environment variables**

Add to `apps/platform/.env.example` and (with real local values) `apps/platform/.env.local`:

```bash
# Payload CMS: a separate database from the main one, on purpose (see this plan's Architecture section).
DATABASE_URL_PAYLOAD=postgresql://localhost:5432/webfold_payload
PAYLOAD_SECRET=<generate with: openssl rand -base64 32>
```

Read `apps/platform/lib/server/env.ts` (the existing `serverEnv()` validator) and add these two to whatever schema it uses, following its existing pattern exactly — every other env var in this codebase is validated there, not read via bare `process.env`.

- [x] **Step 4: Run Payload's own setup**

From `apps/platform`, run whatever the current `payload` CLI's init/scaffold command is for adding Payload to an *existing* Next.js app (check `payload --help` and `node_modules/.bin/payload` after install — the exact command name has changed across Payload versions, so verify against the installed version rather than trusting a remembered command). This generates the `app/(payload)/admin/[[...segments]]/page.tsx` and `app/(payload)/api/[[...slug]]/route.ts` route files (or equivalent — read what it actually names them) and wires `next.config.ts` with `withPayload`.

**Read every file the installer generated or modified before proceeding.** Note in your report exactly what it created, since later steps and later tasks depend on knowing the real shape, not an assumed one.

- [x] **Step 5: Write `payload.config.ts`**

```ts
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import { serverEnv } from "@/lib/server/env";

export default buildConfig({
  secret: serverEnv().PAYLOAD_SECRET,
  db: postgresAdapter({
    pool: { connectionString: serverEnv().DATABASE_URL_PAYLOAD },
  }),
  editor: lexicalEditor(),
  // Collections and the multi-tenant plugin are added in Tasks 2-4 — this file grows there, not here.
  collections: [],
  plugins: [],
});
```

Note: `serverEnv()` is this codebase's own validated-env helper (see Step 3) — confirm it can be safely imported from `payload.config.ts`, which runs in a different context than a normal server component (Payload loads this config directly via Node, not through Next's request lifecycle). If `serverEnv()` depends on something request-scoped that isn't available here, fall back to reading `process.env.PAYLOAD_SECRET`/`process.env.DATABASE_URL_PAYLOAD` directly in this one file with a clear comment explaining why it's the one exception, rather than forcing a mismatch.

- [x] **Step 6: Restrict Payload's routes to the admin host only**

Payload's default admin path is `/admin` and its API is under `/api` (confirm the exact paths from what Step 4's installer actually generated). Read `apps/platform/proxy.ts` and `apps/platform/lib/surfaces.ts` in full — this app already rewrites incoming requests based on hostname (`admin.` → `/admin-host`, `app.` → `/app-host`). Add a rule so that a request to Payload's admin/API paths is only reachable when the host is the admin host; a request to the same paths on `app.` or the marketing host should 404, the same way this app already handles unknown paths elsewhere (check `apps/platform/app/app-host/[...missing]/page.tsx` for the existing "branded not-found for a customer-host path that doesn't belong there" pattern, and match it rather than inventing a new one).

Do **not** move Payload's admin panel to a custom sub-path (e.g. `/admin-host/cms`) to try to fit it into the existing route-group structure — Payload's docs and its own issue tracker document real, current bugs in custom admin-path relocation (import maps generated in the wrong place, breaking the panel). Keep Payload's routes at their default `/admin`/`/api` paths and gate them by host in `proxy.ts` instead; this avoids that whole class of bug.

- [x] **Step 7: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm build
```

Then, with a dev server running (`pnpm dev` from the repo root, or the platform's own dev script), visit `admin.localhost:3000/admin` (or whatever port this session's dev server uses) and confirm Payload's own first-user-creation screen loads. **This is staff-only infrastructure at this point** — do not create a real account through it yet; that belongs in Task 2 once collections exist. Report whether it loaded, and paste any error if it didn't.

---

### Task 2: Tenants collection, kept in sync with `businesses`

**Files:**
- Create: `apps/platform/collections/Tenants.ts`
- Modify: `apps/platform/payload.config.ts`
- Modify: `packages/db/src/queries/onboarding.ts` or wherever a business row is first created (read `docs/superpowers/specs/2026-09-15-firstfold-platform-design.md` §3 and the actual code path — the spec says a business is created "at payment confirmation"; find that real code path, likely in `apps/platform/lib/server/payment-confirmation.ts` or similar)
- Test: wherever the found code path's existing tests live

> **Correction, 2026-09-18 (read the plan's top "Architecture, corrected" section first):** this task was originally written assuming Payload's multi-tenant plugin, and its Step 2 below wires that plugin in. **That plugin is no longer part of the design** — nobody ever uses Payload's own admin UI, so there is nothing for it to scope. The `Tenants` collection itself is still needed (as a lightweight lookup: which businesses exist, for the admin panel's own business picker), but **skip Step 2 entirely**, and if a prior pass already installed/wired the plugin, remove it (`pnpm remove @payloadcms/plugin-multi-tenant` from `apps/platform`, and delete the `multiTenantPlugin(...)` block from `payload.config.ts`) as part of whichever task next touches that file (Task 3, revised below, does).

`businesses` (the existing Postgres table, source of truth for identity) and Payload's `Tenants` collection are kept in sync automatically, so a forgotten sync never leaves a business's content unreachable.

- [x] **Step 1: Define the collection**

```ts
import type { CollectionConfig } from "payload";

/**
 * One document per Firstfold business (packages/db's `businesses` table is the source of truth for identity;
 * `businessId` here is that table's id, kept in sync automatically when a business is created — see the payment
 * confirmation code path). Never created by hand: this exists purely as a lookup so the admin panel's own
 * business-picker screen (Task 4) can list businesses, and so every other collection has something to reference.
 */
export const Tenants: CollectionConfig = {
  slug: "tenants",
  admin: {
    useAsTitle: "name",
  },
  access: {
    // Nobody reaches this except our own server code (the admin panel's and the customer dashboard's server
    // actions), using the Local API — never a browser talking to Payload directly. These stay permissive because
    // the real access control is in that server code, not here — see this plan's "Architecture, corrected" note.
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => false, // a business is never deleted this way; removing a tenant is a deliberate, separate decision
  },
  fields: [
    {
      name: "businessId",
      type: "text",
      required: true,
      unique: true,
      admin: { description: "Matches packages/db's businesses.id. Set automatically — do not edit by hand." },
    },
    {
      name: "name",
      type: "text",
      required: true,
    },
  ],
};
```

- [x] **Step 2: ~~Wire the multi-tenant plugin~~ — skipped, see the correction note above this task**

Kept below only so the "what this plan originally intended" history is legible. Do not implement it.

In `payload.config.ts`, add:

```ts
import { multiTenantPlugin } from "@payloadcms/plugin-multi-tenant";
import { Tenants } from "./collections/Tenants";

export default buildConfig({
  // ...existing config from Task 1...
  collections: [Tenants],
  plugins: [
    multiTenantPlugin({
      collections: {
        // Populated in Tasks 3: every tenant-scoped collection lists itself here.
      },
      tenantsSlug: "tenants",
    }),
  ],
});
```

Read the actual current `@payloadcms/plugin-multi-tenant` README (installed under `node_modules/@payloadcms/plugin-multi-tenant/README.md` after Task 1's install) for its exact current config shape before trusting this snippet — plugin APIs move between versions faster than core Payload, and this plan was written from current published docs, not this specific installed version.

- [x] **Step 3: Write the failing test for the sync**

Find the real payment-confirmation code path first (see Files above) and read its existing tests to match their setup pattern. Then add a test proving: when a business is created, a matching Payload tenant is created too, with the same id and name. The exact test code depends on what that file actually looks like — write it following that file's own conventions once you've read it, covering at minimum:
- A new business creates exactly one tenant with `businessId` equal to the new business's id.
- Calling the creation path twice for the same business (if that's possible in the real flow) does not create a duplicate tenant.

- [x] **Step 4: Run it and confirm it fails, then implement**

Add the Payload tenant-creation call to the real business-creation code path, using Payload's Local API (`import { getPayload } from "payload"` then `payload.create({ collection: "tenants", data: { businessId, name } })` — confirm this exact call shape against Payload's current Local API docs, which may have moved since this plan was written).

- [x] **Step 5: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

---

### Task 3: Pages, Blog Posts and Gallery collections

> **Rewritten 2026-09-18** per the corrected architecture at the top of this file. The version this replaced modeled `Pages` as owning site *structure* (a `blocks` array of typed sections) — wrong, because the admin's hand-written code owns structure, not Payload. What Payload actually needs to hold is a flat list of **named content slots per page**, whatever the admin decided to wire their code up to read (`heroHeadline`, `heroImage`, …), plus a business id on every collection now that the multi-tenant plugin is gone.

**Files:**
- Create: `apps/platform/collections/Pages.ts`
- Create: `apps/platform/collections/Media.ts`
- Create: `apps/platform/collections/BlogPosts.ts`
- Create: `apps/platform/collections/Gallery.ts`
- Modify: `apps/platform/payload.config.ts`
- Modify: `apps/platform/package.json` (remove `@payloadcms/plugin-multi-tenant` if Task 2 installed it)

- [x] **Step 1: Remove the multi-tenant plugin dependency, if present**

```bash
cd apps/platform
pnpm remove @payloadcms/plugin-multi-tenant 2>/dev/null || true
```

Check `payload.config.ts` for any `multiTenantPlugin(...)` block or import left from Task 2's original attempt and delete it, leaving `plugins: []` (or omit the key entirely if Payload's config type allows that — check).

- [x] **Step 2: `Media` upload collection**

Create this first — `Pages`, `Gallery` and `BlogPosts` all reference it for uploads.

```ts
import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
  slug: "media",
  upload: true,
  access: { read: () => true, create: () => true, update: () => true, delete: () => true },
  fields: [{ name: "altText", type: "text" }],
};
```

This is a genuinely new capability the earlier custom-Postgres plan explicitly deferred ("New photo uploads... is a follow-up"): Payload's own `upload: true` gives working image upload handling for free. Read Payload's current upload docs for where files actually get stored by default (local disk vs. needing an explicit storage adapter) and flag clearly in your report whether production needs an additional storage adapter package — do not assume local disk storage is fine for a Vercel deployment (it is not: Vercel's filesystem is ephemeral) without confirming and calling this out.

- [x] **Step 3: `Pages`, holding named content slots**

```ts
import type { CollectionConfig } from "payload";

/**
 * A named group of content slots the admin's hand-written site code reads for one page. This collection does NOT
 * define the page's layout or structure — that lives entirely in the admin's own code, in whatever project holds
 * that business's site. It only holds the specific values that code was written to fetch instead of hardcode.
 * `fields` is a flat, admin-defined list: each entry's `key` must match the exact name used in the site's code
 * for that slot (e.g. `heroHeadline`) — there is no enforced link between the two, so getting the key right is
 * on whoever fills it in (see Task 4's admin-panel screen, which is the one place this gets entered).
 */
export const Pages: CollectionConfig = {
  slug: "pages",
  admin: { useAsTitle: "title" },
  access: { read: () => true, create: () => true, update: () => true, delete: () => true },
  fields: [
    { name: "businessId", type: "text", required: true, index: true },
    { name: "title", type: "text", required: true },
    { name: "navLabel", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "position", type: "number", required: true, defaultValue: 0 },
    {
      name: "fields",
      type: "array",
      labels: { singular: "content field", plural: "content fields" },
      fields: [
        {
          name: "key",
          type: "text",
          required: true,
          admin: { description: "Must exactly match the name this business's site code reads, e.g. heroHeadline." },
        },
        { name: "label", type: "text", required: true, admin: { description: "Shown to whoever edits this — plain English, e.g. \"Hero headline\"." } },
        { name: "customerEditable", type: "checkbox", defaultValue: false, required: true },
        {
          name: "type",
          type: "select",
          options: ["text", "image"],
          required: true,
          defaultValue: "text",
        },
        {
          name: "textValue",
          type: "textarea",
          admin: { condition: (_data, siblingData) => siblingData?.type === "text" },
        },
        {
          name: "image",
          type: "upload",
          relationTo: "media",
          admin: { condition: (_data, siblingData) => siblingData?.type === "image" },
        },
      ],
    },
  ],
};
```

Confirm the `admin.condition` shape (a function reading `siblingData` to conditionally show a field within the same array row) still matches the currently-installed Payload version's API — this is exactly the kind of detail that needs checking against the real, installed package rather than trusted from this plan.

- [x] **Step 4: `Gallery`**

```ts
import type { CollectionConfig } from "payload";

export const Gallery: CollectionConfig = {
  slug: "gallery",
  admin: { useAsTitle: "caption" },
  access: { read: () => true, create: () => true, update: () => true, delete: () => true },
  fields: [
    { name: "businessId", type: "text", required: true, index: true },
    { name: "photo", type: "upload", relationTo: "media", required: true },
    { name: "caption", type: "text" },
    { name: "position", type: "number", required: true, defaultValue: 0 },
  ],
};
```

`position` is a plain number field this time (not relying on any plugin's drag-reorder feature) — the customer's own gallery-reorder buttons (already built, from the earlier plan) set it explicitly, the same pattern already proven for the old Postgres-backed gallery.

- [x] **Step 5: `BlogPosts`**

```ts
import type { CollectionConfig } from "payload";

export const BlogPosts: CollectionConfig = {
  slug: "blogPosts",
  admin: { useAsTitle: "title" },
  access: { read: () => true, create: () => true, update: () => true, delete: () => true },
  fields: [
    { name: "businessId", type: "text", required: true, index: true },
    { name: "title", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "excerpt", type: "text" },
    { name: "body", type: "richText" },
    { name: "coverImage", type: "upload", relationTo: "media" },
    {
      name: "status",
      type: "select",
      options: ["draft", "published"],
      defaultValue: "draft",
      required: true,
    },
    { name: "publishedAt", type: "date" },
  ],
};
```

- [x] **Step 6: Register everything in `payload.config.ts`**

```ts
collections: [Tenants, Pages, Media, Gallery, BlogPosts],
plugins: [],
```

- [x] **Step 7: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm build
```

There is no live "sign into Payload's admin and click around" check for this task — per the corrected architecture, nobody uses Payload's own admin UI, so there is nothing to demo there. Live verification of these collections actually working happens in Task 4, through the real admin-panel screen built on top of them.

---

### Task 4: Admin panel — the content-slot editor

> **Rewritten 2026-09-18.** This task originally assumed the admin would sign into Payload's own admin panel to build a business's pages — wrong, per the corrected architecture at the top of this file: nobody uses Payload's own UI. This is now a real, new screen inside `admin.firstfold.com`, next to the existing client detail page, where the admin defines and fills in a business's content slots (matching whatever names they used in that business's hand-written site code) and, separately, enters the real starting values for them. This is also the "how does it get to the client" mechanism discussed at length with the user: there is no separate transfer step — the moment a value is saved here, it's simultaneously what the live site (once built) fetches and what the customer's Content page shows them to edit.

**Files:**
- Create: `apps/platform/lib/server/admin-content.ts`
- Create: `apps/platform/app/admin-host/(protected)/clients/[businessId]/content/page.tsx`
- Create: `apps/platform/app/admin-host/(protected)/clients/[businessId]/content/actions.ts`
- Create: `apps/platform/components/panel/admin-page-editor.tsx`
- Modify: `apps/platform/app/admin-host/(protected)/clients/[businessId]/page.tsx` (add a link to the new screen)

- [x] **Step 1: The reader**

```ts
import "server-only";
import { getPayload } from "payload";
import config from "@/payload.config";
import { requireStaffAccess } from "./staff-access";

export interface AdminPageField {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly customerEditable: boolean;
  readonly type: "text" | "image";
  readonly textValue: string | null;
  readonly image: { readonly id: string; readonly url: string } | null;
}

export interface AdminPage {
  readonly id: string;
  readonly title: string;
  readonly navLabel: string;
  readonly slug: string;
  readonly position: number;
  readonly fields: readonly AdminPageField[];
}

/** Every page and content field for one business, for the admin's editor. Admin-only — the same `requireStaffAccess`
 * every other admin-host page already calls, nothing new to authorize here beyond that. */
export async function getAdminPages(businessId: string): Promise<readonly AdminPage[]> {
  await requireStaffAccess();
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "pages",
    where: { businessId: { equals: businessId } },
    sort: "position",
    depth: 1, // resolves each field's `image` upload relationship to a usable url
  });
  // ...map result.docs into AdminPage[], following the shape above...
}
```

- [x] **Step 2: The actions**

Following this codebase's existing admin-action conventions (`requireStaffAccess()` first, `revalidatePath`/`redirect` after — see `apps/platform/app/admin-host/(protected)/clients/[businessId]/actions.ts` for the pattern to match), write:

- `createPageAction` — creates a new `pages` document for this business (title, navLabel, slug, position).
- `deletePageAction`
- `addFieldAction(pageId, { key, label, type, customerEditable })` — appends one entry to a page's `fields` array. Since Payload's array fields are edited as a whole array (not addressed by row id from outside), this means reading the page, appending the new entry, and writing the whole `fields` array back — the same "read, modify one entry, write the whole array" shape Task 5 below uses for the customer-facing save, so write a small shared helper if that avoids duplicating the same array-surgery logic in two places (your call whether that shared helper belongs in `admin-content.ts`, the customer-facing `content.ts`, or a third file both import — pick whichever keeps the duplication lowest without an awkward cross-import).
- `updateFieldValueAction(pageId, fieldKey, value)` — the admin's version of the customer's save, but without the `customerEditable` restriction (the admin can set any field's value, editable or not — matching the plan's "admin decides, customer only touches what's marked editable" rule).
- `removeFieldAction(pageId, fieldKey)`

- [x] **Step 3: The page**

A page listing all of this business's `Pages` (empty state: "No pages yet — add one to get started"), each showing its fields with a form to edit each value (text box for `type: "text"`, an upload control for `type: "image"`), plus a small form to add a new field (key, label, type, customer-editable checkbox) and a new page. Model its layout on the existing client detail page's style (`rounded-3xl border border-line bg-card p-6`, etc.) — this is an admin screen, so it can be plainer/denser than the customer-facing Content page; it doesn't need the same soft, reassuring copy, just clear labels.

- [x] **Step 4: Link it from the client detail page**

Add a link (`Link href={\`/clients/${businessId}/content\`}`, following the surface-relative path convention already confirmed in Task 2 of the earlier customer-cms-ui plan — no `/admin-host` prefix) near the project status on `apps/platform/app/admin-host/(protected)/clients/[businessId]/page.tsx`.

- [x] **Step 5: Checkpoint and live verification**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Then, live: using a real business, add a page, add a text field and an image field, fill in real values, and confirm they save and read back correctly. Add a second business and confirm its page list is completely separate — this is your real proof the `businessId`-filtering discipline works, now that there is no plugin doing it for you. This is also the point where the old Task 4's "is this actually usable" check applies: is this screen something a non-technical admin (i.e., you) can actually use day to day, not just something that technically works? Note anything genuinely awkward.

---

### Task 5: Rewire the customer Content page to Payload

**Files:**
- Modify: `apps/platform/lib/server/content.ts`
- Modify: `apps/platform/app/app-host/(protected)/content/actions.ts`
- Modify: `apps/platform/app/app-host/(protected)/content/page.tsx` (only if the data shape read from Payload differs from the old `WebsiteDetail`/`GalleryPhoto` shapes it currently expects — keep the page's own JSX as close to unchanged as the new data shape allows, since its design was already built and is not being redone)
- `apps/platform/components/panel/section-edit-form.tsx` and `gallery-manager.tsx` should need little to no change if `content.ts`'s output shape is kept close to what they already expect — prefer adapting the reader to match the existing component props over changing the components, to minimize the blast radius of this migration.

This task **replaces** the internals of `docs/superpowers/plans/2026-09-17-customer-cms-ui.md`'s Task 4, which currently reads/writes `packages/db`'s `page_sections`/`gallery_items` tables. The customer-facing behavior (what the page looks like, what it says, what the customer can and can't do) does not change — only what's underneath it.

> **Known gap, flagged 2026-09-18 during Task 3's review — resolve before this task is done, not partway through it:** Payload's file-serving route for uploads (`/api/media/file/<filename>`, Payload's REST catch-all at `app/(payload)/api/[...slug]/route.ts`) is wrapped in `requireAdminHost` (`lib/server/require-admin-host.ts`), so it 404s on any host but the admin one. That's correct for Payload's data API, reached only from our own server code via the Local API — but a raw `<img src>` is a direct browser request for file bytes on the customer's own host (`app.firstfold.com`), which hits that same admin-only gate and 404s. In other words: as currently wired, an uploaded image is not actually viewable from the customer dashboard this task builds. See the note left in `apps/platform/collections/Media.ts` for the full detail. Before marking this task done, confirm images actually render for a real customer session — don't assume the production storage-adapter decision (flagged in Task 3) silently fixes this; check it explicitly, and if it doesn't, build whatever's needed (most likely a dedicated, non-gated file-proxy route) as part of this task.

- [x] **Step 1: Read what already exists**

Read the current `apps/platform/lib/server/content.ts`, `content/actions.ts`, `section-edit-form.tsx`, `gallery-manager.tsx` in full (these exist already from the foundation UI plan — some of Task 4 there may still be mid-fix; check the plan's checkboxes and this session's history for its actual current state before assuming it's finished). Note where each one currently imports from `@firstfold/db` — every one of those imports needs to become a Payload Local API call instead.

- [x] **Step 2: Rewrite `getContentSnapshot`**

> Corrected 2026-09-18: `Pages` now holds a flat `fields` array (each entry a named content slot: `key`, `label`, `customerEditable`, `type`, `textValue`/`image`), not a `blocks` array of typed sections — see Task 3's rewrite. The customer only ever sees, and can only ever save, entries where `customerEditable === true`; everything else (including a field's `key`, `label` and `type`, and any non-editable field's value) is admin-only, edited from Task 4's screen. There is no `tenant` relationship field — every collection has a plain `businessId` text field, filtered directly.

```ts
import "server-only";
import { getPayload } from "payload";
import config from "@/payload.config";
import { requireCustomerAccess } from "./customer-access";

export interface ContentSnapshot {
  readonly website: { readonly pages: readonly PageWithSections[] } | null;
  // shape kept close to what content/page.tsx already expects — adjust to match exactly once you've read it.
  // Each page's `fields` should only include entries with customerEditable === true; filter them out server-side
  // here rather than in the page component, so a non-editable field's value never even reaches the browser.
}

/**
 * Reads through Payload's Local API, scoped explicitly to the signed-in customer's own business — never trusts a
 * business id from anywhere but the authenticated session. This explicit scoping is the real security boundary
 * (see this plan's Architecture note): there is no plugin or database-level backstop behind it, so every read and
 * write in this file must filter by `tenant.businessId`, with no exceptions.
 */
export async function getContentSnapshot(): Promise<ContentSnapshot> {
  const { tenant } = await requireCustomerAccess();
  const payload = await getPayload({ config });

  const pagesResult = await payload.find({
    collection: "pages",
    where: { businessId: { equals: tenant.businessId } },
    sort: "position",
    depth: 1, // resolves each field's `image` upload relationship to a usable url
  });

  // ...map pagesResult.docs into ContentSnapshot's shape, keeping only fields with customerEditable === true...
}
```

- [x] **Step 3: Rewrite the actions**

> Scope clarification (applied during implementation, 2026-09-18): only `saveSectionAction` was rewritten onto Payload in this task. `addToGalleryAction`/`removeFromGalleryAction`/`moveGalleryItemAction` are Task 6's job (gallery isn't in Task 5's file list above) and were deliberately left as-is, still `@firstfold/db`-backed.

`saveSectionAction`, `addToGalleryAction`, `removeFromGalleryAction`, `moveGalleryItemAction` all currently call `@firstfold/db` functions inside `withTenantScope`. Rewrite each to call Payload's Local API instead (`payload.update`, `payload.create`, `payload.delete`), with the same `requireBillingAccess()` guard at the top of every one (unchanged — this rule doesn't depend on which database backs the write) and the same explicit business-id check: **every one of these calls must include the `businessId` filter derived from `requireBillingAccess()`'s result, never from client-supplied data**, matching `getContentSnapshot`'s pattern.

For `saveSectionAction` specifically: since a page's slots now live in a `fields` array rather than separate rows, updating one means reading the page, finding the right entry by its `key` (or Payload's own array-row `id`, whichever your reader exposed), **confirming that entry's `customerEditable` is `true` before touching it** (a customer save must be refused — same `SectionNotEditableError`-style behavior as before — if it isn't, exactly like the old `page_sections_customer_update` RLS policy used to enforce at the database level; here your own code is the only thing enforcing it, so this check cannot be skipped or assumed), replacing just that entry's `textValue`/`image`, and writing the whole `fields` array back — not a single-row `UPDATE`. Write this carefully and test it against a page with more than one field to make sure you're not accidentally reordering, dropping, or exposing a write path to a non-editable field.

- [x] **Step 4: Tests**

The old `@firstfold/db` query functions had integration tests proving tenant isolation at the database level (Task 6 of the foundation plan). Those don't apply anymore — the isolation mechanism changed. Add tests at this layer instead: mock or use a real local Payload+Postgres instance (check whether a lighter-weight test setup is realistic here, e.g. Payload's own testing utilities, before assuming you need a full second test database wired into this repo's existing `pnpm test:integration` — this may be a case where a smaller, more contained test setup is the right call; use your judgment and explain your choice) and prove: a customer's `saveSectionAction` call cannot affect another tenant's page, even given that tenant's real block id.

- [x] **Step 5: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Then verify live in the browser: the Content page for a business built in Task 4 shows its real sections, editing an editable section saves and persists, and the non-editable section still shows read-only with the "edit through a support request" note.

> Verified live 2026-09-18 against the "Content Test Co" test business (see this task's report for the exact steps and network evidence): the editable `heroHeadline` text field saved and persisted across a reload; the editable `heroImage` field rendered a real, visible image via the new `app/app-host/content-media/[mediaId]/route.ts` proxy; a non-editable field added for this check never appeared on the customer page at all — content.ts filters non-`customerEditable` fields server-side, so the page component never receives them (a stricter behavior than the plan's original "shows read-only" phrasing — see the task report for why).
>
> **Correction, same day, spec review:** the first version of this fix passed live verification but was still wrong — it checked only "is there a session" and served any business's media to any signed-in customer (confirmed live: `/content-media/1` through `/content-media/4` all returned 200 for one customer, even though only one belonged to them). Fixed by adding a real `businessId` field to `collections/Media.ts` (mirroring `Pages`/`Gallery`/`BlogPosts`), stamping it at upload time (`app/api/admin-content-media/route.ts`), and checking it against the signed-in customer's own `businessId` in the route (staff sessions stay unscoped, consistent with the single-admin model). Re-verified live after the fix: a customer's own business's media returns 200, another business's returns 404, enumerating ids 1-7 as that customer only ever returns 200 for their own — see the task report for the exact evidence.

---

### Task 6: Rewire the Gallery panel and build the Blog pages

**Files:**
- `apps/platform/components/panel/gallery-manager.tsx` — adjust only if Task 5's new data shape requires it
- Create: `apps/platform/lib/server/blog.ts`
- Create: `apps/platform/app/app-host/(protected)/content/blog/page.tsx`
- Create: `apps/platform/app/app-host/(protected)/content/blog/actions.ts`
- Create: `apps/platform/app/app-host/(protected)/content/blog/new/page.tsx`
- Create: `apps/platform/app/app-host/(protected)/content/blog/[postId]/page.tsx`
- Create: `apps/platform/components/panel/blog-post-edit-form.tsx`

Blog was never built in the old plan (its Task 5 wasn't reached before this migration decision). Build it now, directly against Payload, using `docs/superpowers/plans/2026-09-17-customer-cms-ui.md`'s Task 5 as a design reference for page structure and copy (list page, new-post form, edit form with Publish/Unpublish/Delete) — but its actions call Payload's Local API (`payload.find`/`create`/`update`/`delete` on the `blogPosts` collection, tenant-scoped exactly as Task 5 above) instead of `@firstfold/db`'s blog query functions.

**One real upgrade to make here, now that it's basically free:** the old plan's blog body was going to be plain text (`{ text: string }`) specifically because a rich-text editor was out of scope for a hand-built system. Payload's `richText` field (already used on `BlogPosts.body` in Task 3) gives you a real editor for free — use it. The edit form's body field should render Payload's own rich-text input, not a plain `<textarea>`; check Payload's current docs for the recommended way to embed one of its field editors inside a page that is otherwise not part of Payload's own admin UI (this may mean using Payload's admin components directly, or it may mean this one field is edited through Payload's admin panel rather than the custom dashboard — if the latter turns out to be the realistic answer, say so clearly rather than forcing an awkward custom integration; either is a legitimate outcome, decide based on what you find, not on what the plan assumed here).

- [x] **Step 1-N:** Build following the pattern established in Task 5 above and the customer-cms-ui plan's Task 5 design — TDD where there's real logic to test (the tenant-scoping on every action), straightforward implementation for the page/form UI. Follow this plan's own checkpoint discipline after each meaningful chunk rather than waiting until everything is done to run it once.

- [x] **Final step: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Verify live: create a post, edit it, publish it, unpublish it, delete it, all as a real customer session, and confirm none of it is reachable by a different business's session.

---

### Task 7: Retire the old CMS tables and the launch stopgap

**Files:**
- Delete: `packages/db/src/schema/website.ts`, `packages/db/src/schema/content.ts`
- Delete: `packages/db/src/queries/website.ts`, `packages/db/src/queries/blog.ts`, `packages/db/src/queries/site-releases.ts`, `packages/db/src/queries/launch.ts`
- Delete: their test files (`website.integration.test.ts`, `blog.integration.test.ts`, `site-releases.integration.test.ts`, `launch.integration.test.ts`)
- Create: a new migration dropping the tables from migrations `0024`/`0025` of the foundation plan
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/index.ts` (remove the now-dead exports)
- Modify: `apps/platform/app/admin-host/(protected)/clients/[businessId]/actions.ts`, `page.tsx` (remove the "Create & launch website" stopgap button and action — replaced by staff building content directly in Payload, per this plan's Architecture)
- Modify: `apps/platform/components/panel/customer-shell.tsx` **only if** nav item hrefs changed — they should not have, since the pages at `/content` and `/monitoring` keep the same URLs

- [x] **Step 1: Confirm before deleting**

**Stop and confirm with the user before running the dropping migration on any database that isn't purely local/empty.** Per this plan's "Deliberately deferred" note, this assumes no real production business data lives in the old tables yet — verify that's still true (ask, don't assume, if any time has passed since this plan was written) before generating and applying a migration that drops `websites`, `pages`, `page_sections`, `gallery_items`, `blog_posts`, `site_releases`.

- [x] **Step 2: Generate the drop migration**

```bash
cd packages/db
pnpm db:generate --name drop_old_cms_tables
```

Read the generated SQL and confirm it only drops the six tables above (plus their enums: `page_key`, `section_type`, `blog_post_status`, `site_release_purpose`, `site_release_creator`) and nothing else. Apply: `pnpm db:migrate && pnpm db:migrate:test` from the repo root.

- [x] **Step 3: Remove the code**

Delete the files listed above. Remove their exports from `packages/db/src/schema/index.ts` and `packages/db/src/index.ts`. Remove the "Create & launch website" button, its action, and the `launchWebsiteAction`/`NoProjectError` import from the admin client page — staff no longer clicks a button to seed generic content; they build real content in Payload directly (Task 4).

- [x] **Step 4: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @firstfold/db test:integration
```

Confirm nothing else in the codebase still imports any of the deleted symbols — a lint/typecheck failure here means something was missed, not a false positive to silence.

**Task 7 complete (2026-09-18).** Migration `0028_drop_old_cms_tables.sql` applied to `firstfold` and `webfold_test`, confirmed to drop exactly the six named tables and five enums; `webfold_payload` confirmed untouched. All dead code, exports, and the admin stopgap button/action removed cleanly — also cleaned up `rls.integration.test.ts`'s now-obsolete `website RLS` block, found beyond this task's stated file list. Full checkpoint (lint/typecheck/test/build/db-integration-test) passing. Spec compliance review: no issues. Code quality review: approved, no issues.

---

### Task 8: Final verification and deployment notes

- [x] **Step 1: Full checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Run 2026-09-18, all clean: lint (0 issues), typecheck (all 6 workspace projects), unit tests (937 passing across `packages/shared`, `packages/db`, `packages/billing`, `packages/email`, `packages/auth`, `apps/platform`), `next build` (production build succeeds, all routes compile), and `pnpm --filter @firstfold/db test:integration` (162 passing, run separately since it needs a real Postgres connection).

- [x] **Step 2: Full manual walkthrough**

**Verified live** (not just by reading code), against the running dev server (`admin.localhost:3001` / `app.localhost:3001`), using two fresh businesses created through the real lead → setup-link → password flow (not seeded):

- Staff created a business ("Task8 Walkthrough A"), recorded its payment, and — through the admin panel's own content-editor screen (not a stopgap button, not Payload's own admin UI) — added a page with a customer-editable text field and a separate admin-only field.
- The customer opened their real setup link, set a password, and reached `/content`: only the customer-editable field was visible (the admin-only field never appeared in the customer's DOM). The customer edited the field and saved; the new value round-tripped back to the admin panel's own screen.
- Gallery: the customer uploaded a photo (through the real `/api/content-media-uploads` route and Payload write, not a mock), uploaded a second, reordered them with Move up/down, and removed one — all confirmed via the rendered list after each action.
- Blog: the customer created a post, wrote body text in the Lexical editor, saved, and published it (button flipped from "Publish" to "Unpublish"); it then appeared as "Published" on the blog list.
- Cross-tenant isolation: a second fresh business ("Task8 Walkthrough B") was set up the same way with its own distinct headline text. B's customer session showed only B's own headline, an empty gallery, and "No posts yet." — none of A's headline, photo, or blog post were visible. This is a live rerun of the isolation property that Task 5's adversarial security review already verified exhaustively (unauthenticated REST/GraphQL, host spoofing, fresh accounts); this walkthrough exercised it once more end to end through the real UI.
- Content-editor gating was also observed as a side effect: `/content` shows "Your content editor will be ready once your website is built" for a business with no pages yet, and unlocks once staff adds one — confirming the gate reflects real page data rather than payment status alone.

- [x] **Step 3: Write down what production deployment actually needs**

See "Production deployment checklist" below, added at the end of this plan.

---

## Production deployment checklist

Everything below is still outstanding — none of it has been done yet. Do not deploy to production without it.

1. **A separate DigitalOcean Postgres database for Payload.** The app already expects its connection string in the `DATABASE_URL_PAYLOAD` environment variable (validated in `apps/platform/lib/server/env.ts`, required for production builds by `apps/platform/next.config.ts`'s `REQUIRED_FOR_PRODUCTION` list). This must be a *new* database on the DigitalOcean account, separate from the existing `firstfold` production database — Payload's tables should not live alongside the hand-rolled schema in `packages/db`. Run Payload's migrations against it before first deploy (Payload manages its own migration state independently of `packages/db`'s Drizzle migrations).
2. **`PAYLOAD_SECRET` as a Vercel environment variable.** Required, minimum 32 characters (enforced by the same `env.ts` schema). Generate a fresh random value for production — do not reuse the local `.env.local` value.
3. **A production file-storage adapter — currently unresolved, will break image uploads in production if skipped.** `apps/platform/collections/Media.ts` uses Payload's default `upload: true` local-disk storage, which writes to the Vercel deployment's filesystem — ephemeral, and does not survive between requests or deploys. Before production: install a storage adapter package (`@payloadcms/storage-vercel-blob` or `@payloadcms/storage-s3` pointed at DigitalOcean Spaces, which is S3-compatible), wire it into `payload.config.ts`'s `plugins`, and set `disableLocalStorage: true` on `Media.ts`. This needs its own credentials (a DigitalOcean Spaces access key/secret, or a Vercel Blob token) as additional Vercel environment variables — exact names depend on which adapter is chosen.
4. **Deploy order.** Because `DATABASE_URL_PAYLOAD` and `PAYLOAD_SECRET` are both in `REQUIRED_FOR_PRODUCTION`, a production build with either missing fails fast at build time (see `next.config.ts`) rather than deploying broken — so there's no risk of silently shipping without them, but they must be set in Vercel *before* the first production deploy that includes this migration's code.

Not blocking production, but worth knowing:
- The customer-facing "name your own pages" onboarding step was explicitly deferred out of this plan — right now every business's pages are hand-created by staff in the admin content editor (by design, per this plan's Architecture section), so there is no customer-facing gap, just a manual step for staff on every new business.
- `apps/platform/lib/server/content-fields.ts`'s `mutatePageFields` has a documented, accepted non-atomic read-then-write race (two concurrent saves to the same page can lose one write). Low risk today (one staff member, infrequent customer edits) but worth revisiting if concurrent editing becomes common.
