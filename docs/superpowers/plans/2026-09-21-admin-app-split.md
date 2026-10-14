# Admin app split implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the staff console its own deployable Next.js app, `apps/admin`, so a customer-app deploy can never take it down and the two can be hosted, scaled and restarted separately.

**Architecture:** A second app in the same pnpm workspace, importing `@fynix/db`, `@fynix/auth`, `@fynix/shared`, `@fynix/email` and a new `@fynix/cms` directly from the workspace. No publishing, no registry, no `GITHUB_PACKAGES_TOKEN` — that requirement only ever existed because the superseded plan put the admin in a *separate repository*, where workspace imports are impossible.

**Why not a separate repo:** every practical benefit you want — independent deploys, separate process, its own env and blast radius — comes from a separate *app*. A separate *repo* adds only independent git history and access control, and costs the entire package-publishing pipeline. Splitting the app first also makes a later repo split easier: moving an already-standalone `apps/admin` is mostly `git mv` plus publishing setup. This plan supersedes `2026-09-18-admin-separate-repo-split.md`, whose Tasks 3–4 target the CMS screens retired on 2026-09-21.

**Tech Stack:** Next.js 16 App Router, Payload 3 (Local API), Drizzle + Postgres, better-auth, Vitest.

---

## What moves where

| From | To | Why |
| --- | --- | --- |
| `apps/platform/payload.config.ts` + `collections/` | `packages/cms` | both apps read Payload (admin needs it for the blog token) |
| 14 pure helpers under `apps/platform/lib/` | `packages/shared/src/lib/` | no React, imported by both apps |
| 8 shared panel components | `packages/shared/src/ui/panel/` | `packages/shared` already hosts React |
| 6 admin-only components | `apps/admin/components/` | nothing else uses them |
| `apps/platform/app/admin-host/**` (19 files) | `apps/admin/app/**` | the console itself; the host prefix disappears |
| admin-only server lib | `apps/admin/lib/server/` | staff access, billing admin, project launch/preview |

**Stays in `apps/platform`:** everything under `app-host`, `/api/*` (including `/api/site/posts`), the customer's own `lib/server/*`, and `proxy.ts` — which drops to a single surface.

### Ports and hosts

| | local | production |
| --- | --- | --- |
| platform (customer + API) | 3001 | `app.fynix.digital` |
| admin | 3003 | `console.fynix.digital` |

Admin stops being a host-routed surface of the platform and becomes a plain app serving `/clients`, `/leads` at its own root. `ADMIN_ORIGIN` stays in the platform's env only for building links to the admin.

---

### Task 1: Extract `packages/cms`

Both apps need Payload, so its config and collections must leave `apps/platform`. This is the keystone: nothing else can move until it does.

**Files:**
- Create: `packages/cms/package.json`, `packages/cms/tsconfig.json`, `packages/cms/src/index.ts`, `packages/cms/src/config.ts`
- Move: `apps/platform/collections/*.ts` → `packages/cms/src/collections/`
- Modify: `apps/platform/payload.config.ts`, every importer of `@/payload.config` or `@/collections/*`

- [ ] **Step 1: Scaffold the package**

Copy `packages/email/package.json` as the shape to match (same `exports`, `files`, `publishConfig`, `repository` fields), renaming to `@fynix/cms`. Its dependencies are `payload`, `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, and `@fynix/shared` if any collection needs it.

- [ ] **Step 2: Move the collections unchanged**

```bash
mkdir -p packages/cms/src/collections
git mv apps/platform/collections/BlogPosts.ts packages/cms/src/collections/
git mv apps/platform/collections/Media.ts packages/cms/src/collections/
git mv apps/platform/collections/Tenants.ts packages/cms/src/collections/
rmdir apps/platform/collections
```

Do not edit their contents in this step. `Media.ts`'s `access` block denies everything on purpose — read its doc comment before touching anything in it, now or later.

- [ ] **Step 3: Make the config take its secrets as arguments**

`apps/platform/payload.config.ts` currently calls `serverEnv()` directly, which is app-specific. The package must not reach into an app's environment. Create `packages/cms/src/config.ts`:

```ts
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, type SanitizedConfig } from "payload";
import { BlogPosts } from "./collections/BlogPosts";
import { Media } from "./collections/Media";
import { Tenants } from "./collections/Tenants";

export interface CmsConfigInput {
  readonly secret: string;
  readonly databaseUrl: string;
}

/**
 * Payload's config, shared by every app that reads the CMS. Takes its secrets as arguments rather than reading an
 * environment: this package is imported by two apps whose env shapes differ, and a package that reads process.env
 * behind its callers' backs is a package that breaks one of them silently.
 *
 * Collections and their access rules are unchanged by the move — see collections/Media.ts's doc comment for why
 * `access` denies everything and why that must stay.
 */
export function buildCmsConfig(input: CmsConfigInput): Promise<SanitizedConfig> {
  return buildConfig({
    secret: input.secret,
    db: postgresAdapter({ pool: { connectionString: input.databaseUrl } }),
    editor: lexicalEditor(),
    collections: [Tenants, Media, BlogPosts],
    plugins: [],
  });
}
```

Export it from `packages/cms/src/index.ts`, along with the three collections.

- [ ] **Step 4: Point the platform's config at the package**

`apps/platform/payload.config.ts` becomes a thin adapter that supplies the app's own env:

```ts
import { buildCmsConfig } from "@fynix/cms";
import { serverEnv } from "@/lib/server/env";

/** Payload's config for this app. The collections and their rules live in @fynix/cms, shared with apps/admin. */
export default buildCmsConfig({
  secret: serverEnv().PAYLOAD_SECRET,
  databaseUrl: serverEnv().DATABASE_URL_PAYLOAD,
});
```

Add `"@fynix/cms": "workspace:*"` to `apps/platform/package.json`, then `pnpm install`.

- [ ] **Step 5: Fix the importers**

Run `grep -rn "@/collections/" apps/platform` and repoint each to `@fynix/cms`. There should be none left outside the package.

- [ ] **Step 6: Checkpoint**

```bash
pnpm lint && pnpm -r typecheck && pnpm test && pnpm --filter @fynix/platform build
```

Expected: all pass. Then confirm Payload still works at runtime, which a build does not prove:

```bash
curl -s -H "Authorization: Bearer $(cat <your token>)" http://127.0.0.1:3001/api/site/posts
```

Expected: 200 with the posts array.

---

### Task 2: Move the pure helpers into `@fynix/shared`

All 14 are pure TypeScript with no React, so this is a move plus an import rewrite.

**Files:** move from `apps/platform/lib/` to `packages/shared/src/lib/`, keeping each file's own name and its test beside it:

`billing/client-payment`, `billing/manual-payment-form`, `billing/manual-payment-notices`, `billing/terms`, `currency`, `lead-status`, `onboarding/business-fields`, `onboarding/domain-form`, `onboarding/hours`, `onboarding/steps`, `project-status`, `project-launch-notices`, `project-preview-notices`, `safe-link`

- [ ] **Step 1: Move each file and its test with `git mv`**, preserving the subdirectory names (`billing/`, `onboarding/`).

- [ ] **Step 2: Export them from `packages/shared`** following that package's existing export style — check whether it uses a barrel `index.ts` or per-path `exports` before choosing.

- [ ] **Step 3: Rewrite imports in `apps/platform`** from `@/lib/x` to `@fynix/shared/lib/x`.

- [ ] **Step 4: Checkpoint** — `pnpm lint && pnpm -r typecheck && pnpm test`. The moved tests must still run; if `packages/shared`'s vitest config globs only `src/**`, they already will.

---

### Task 3: Move the shared panel components

**To `packages/shared/src/ui/panel/`:** `auth-screen`, `sign-in-form`, `sign-out-button`, `local-date-time`, `panel-not-found`, `stat-card`, `project-status-badge`, `dashboard-root`

These are React, which `packages/shared` already hosts (`ui/icons`, `ui/site-sketch`, `ui/wave-lines`).

- [ ] **Step 1: Move them with `git mv`**, then rewrite `apps/platform`'s imports to `@fynix/shared/ui/panel/<name>`.

- [ ] **Step 2:** `sign-in-form` and `sign-out-button` call server actions. Check whether they import an action directly — if so, that import must become a prop the app passes in, since the two apps have different actions. Fix by lifting the action to a prop, the same pattern `PreviewReviewActions` already uses.

- [ ] **Step 3: Checkpoint** — `pnpm lint && pnpm -r typecheck && pnpm test && pnpm --filter @fynix/platform build`.

---

### Task 4: Scaffold `apps/admin`

- [ ] **Step 1:** Create `apps/admin` with `package.json` (name `@fynix/admin`, `dev` on port 3003), `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts` — copy each from `apps/platform` and strip what the admin does not need.

- [ ] **Step 2:** `apps/admin/.env.example` with only what the admin needs: `DATABASE_URL_STAFF`, `DATABASE_URL_PAYLOAD`, `PAYLOAD_SECRET`, `BETTER_AUTH_SECRET`, `ADMIN_ORIGIN`. **Not** `DATABASE_URL` (the customer's RLS-bound connection) and **not** `DATABASE_URL_PUBLIC` — the admin must not hold connections it has no reason to use.

- [ ] **Step 3:** `apps/admin/lib/server/env.ts` validating exactly those, modelled on the platform's.

- [ ] **Step 4:** `apps/admin/payload.config.ts`, the same thin adapter as Task 1 Step 4 but reading the admin's env.

- [ ] **Step 5:** `pnpm install`, then `pnpm --filter @fynix/admin build`. Expected: builds with no routes yet.

---

### Task 5: Move the console itself

- [ ] **Step 1: Move the routes**, dropping the host prefix:

```bash
mkdir -p apps/admin/app
git mv "apps/platform/app/admin-host/(protected)" "apps/admin/app/(protected)"
git mv apps/platform/app/admin-host/login apps/admin/app/login
git mv apps/platform/app/admin-host/layout.tsx apps/admin/app/layout.tsx
git mv apps/platform/app/admin-host/error.tsx apps/admin/app/error.tsx
git mv "apps/platform/app/admin-host/[...missing]" "apps/admin/app/[...missing]"
```

- [ ] **Step 2: Move the admin-only components** to `apps/admin/components/`: `admin-shell`, `lead-status-badge`, `new-lead-form`, `payments-needing-attention`, `received-date-input`, `client-payment-summary`.

- [ ] **Step 3: Move the admin-only server lib** to `apps/admin/lib/server/`: `staff-access`, `billing-admin`, `project-launch`, `project-preview`, `project-response`, `site-api`, `db`, and any test beside each. Check each with `grep -rn "<name>" apps/platform` first — anything the customer app still imports stays, or moves to a package.

- [ ] **Step 4: Delete the layout's host assertion.** `requireSurfaceHost("admin")` is meaningless in a standalone app; the app *is* the admin. Remove the call and the import.

- [ ] **Step 5: Fix every import** until `pnpm --filter @fynix/admin typecheck` passes.

- [ ] **Step 6: Run it** — `pnpm --filter @fynix/admin dev`, open `http://localhost:3003/clients`, sign in as staff, and confirm the clients list, a client page, leads and the outbox all render.

---

### Task 6: Drop the admin surface from the platform

**Files:** `apps/platform/lib/surfaces.ts`, `apps/platform/proxy.ts`, and their tests.

- [ ] **Step 1: Write the failing test first** in `apps/platform/lib/surfaces.test.ts`: `resolveSurface` returns `"app"` for the app origin and `null` for everything else, including the admin host.

- [ ] **Step 2:** Reduce `Surface` to `"app"`, drop `admin` from `SURFACE_PATH_PREFIX` and `ORIGIN_VARIABLES`, and simplify `readOriginsFromEnv` to one origin.

- [ ] **Step 3: Decide what happens to Payload's `/admin` UI.** `isPayloadAdminPath` currently 404s it on every host but the admin one. With the admin gone from this app, either delete that branch (Payload's own UI is unused — nobody authenticates to Payload) or move it to `apps/admin`. **Read `collections/Media.ts`'s doc comment before choosing:** its access rules assume nobody reaches Payload's UI, and that assumption must not quietly change.

- [ ] **Step 4: Checkpoint** — full gate, plus load the customer app and confirm it is unaffected.

---

### Task 7: Verify both apps together, and write down what changed

- [ ] **Step 1:** Run platform on 3001 and admin on 3003 at once. Walk: staff sign-in, clients list, client detail (blog token block renders), leads, send a setup link, read the outbox. Then on the customer app: sign in, `/content/blog`, publish a post, and confirm `GET /api/site/posts` still returns it.

- [ ] **Step 2:** Confirm the separation is real — stop the platform, reload the admin, and check it still works. That is the entire point of this plan.

- [ ] **Step 3:** Update `docs/superpowers/plans/2026-09-18-admin-separate-repo-split.md` with a note that it is superseded by this plan, and why.

- [ ] **Step 4:** Update the deployment notes: two apps now, two processes, two origins.

---

## Known debt

1. **Both apps hold a Payload connection.** The admin needs it only for the blog token; a narrower read would be better, but is not worth a second mechanism yet.
2. **`packages/shared` grows a lot.** After Tasks 2 and 3 it holds billing helpers, onboarding field definitions and panel components. If it becomes unwieldy, split it by concern rather than letting it become a junk drawer.
3. **The repo split is still possible and still unstarted.** Nothing here blocks it; it now needs only `GITHUB_PACKAGES_TOKEN` plus publishing, and every shared package is already extracted by then.
