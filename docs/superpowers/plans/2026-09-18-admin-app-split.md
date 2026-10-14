# Admin App Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the staff console (superadmin) out of `apps/platform` into its own Next.js app, `apps/admin`, in the same monorepo, deployed as its own Vercel project on its own domain, while it keeps using the same database packages.

**Architecture:** Today one Next.js app serves two hosts. `proxy.ts` rewrites `app.` requests into `app/app-host/*` and `admin.` requests into `app/admin-host/*`. After this plan:
- `apps/platform` serves only the customer app (plus `/api/leads` and `/api/uploads`).
- `apps/admin` serves only the staff console, at its own root.
- Dashboard UI and sign-in code that both apps use moves into a new workspace package, `@firstfold/dashboard`.
- Database access stays in `@firstfold/db`, so both apps always run against one schema and one set of migrations.

**Tech Stack:** pnpm workspaces, Next.js 16.3.5 App Router, React 19, Tailwind 4, better-auth (`@firstfold/auth`), Drizzle (`@firstfold/db`), Vitest, Vercel.

---

## Why this shape (decided with the user on 2026-09-18)

The user first proposed a separate repository. We kept the monorepo because the admin reads and writes the same tables as the customer app: leads, businesses, billing, invites and the outbox. A second repo would need its own copy of the schema, migrations and pricing code, and those copies drift. A separate app in the same repo gives the same isolation:
- its own deploy, domain and environment variables;
- its own auth cookie secret;
- the option of Vercel deployment protection or an IP allowlist.

It does this without duplicating anything.

## Preconditions (check before Task 1; stop and ask the user if any fails)

1. **The Payload CMS migration must not be mid-flight in this repo.** As of 2026-09-18, another session is running `docs/superpowers/plans/2026-09-17-payload-cms-migration.md`. Its uncommitted changes touch the files this plan moves: `app/admin-host/layout.tsx`, `components/panel/admin-shell.tsx`, `components/dashboard-root.tsx`, `proxy.ts`, `lib/surfaces.ts` and `lib/server/env.ts`. Run `git status --short` in the repo root. Anything uncommitted under `apps/platform` or `packages/` means stop and tell the user. Do not stash, commit or move another session's work.
2. **Decide with the user where Payload's staff UI goes.** That plan mounts Payload's admin panel at `/admin` on the admin host, inside `apps/platform` (`app/(payload)/`, `payload.config.ts`, `lib/server/require-admin-host.ts`). After this split, staff use a different app, so Payload's admin UI belongs in `apps/admin`. Customers only use Payload's Local API from server actions, which stays in `apps/platform`. Task 9 moves it. If Payload is still at its Task 1 (empty `collections: []`), the cheaper order is:
   - finish this split first;
   - then update the Payload plan's file paths to `apps/admin`.

   Confirm the order with the user.
3. **Baseline is green on a new branch** cut from `development`:
   ```bash
   git switch development && git pull && git switch -c admin-app-split
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
   Expected: all pass. If they don't, stop; don't start moving files on a red baseline.

## Ground rules

- **Moves use `git mv`** so history follows the files. Change a moved file's content only where a task says to.
- **No behaviour changes.** Every staff screen, action and message stays the same; only its app and URL host change.
- **Don't commit or push** unless the user asks in that message. The "Commit" steps below are checkpoints to offer, not to run on your own.
- **Don't start dev servers with Bash.** Use the preview tools and `.claude/launch.json`.
- **Checkpoint after every task:** `pnpm lint && pnpm typecheck && pnpm test` (plus `pnpm build` where a task says so).

## File structure after the split

```
apps/
  platform/                      customer app only (app.firstfold…), /api/leads, /api/uploads
    app/app-host/...             unchanged
    lib/surfaces.ts              one surface: "app" (ADMIN_ORIGIN removed)
    proxy.ts                     404 for every host but APP_ORIGIN
  admin/                         NEW: staff console (admin.firstfold…)
    app/layout.tsx               root layout (was app/admin-host/layout.tsx)
    app/(protected)/...          was app/admin-host/(protected)/...
    app/login/...                was app/admin-host/login/...
    app/media/[mediaId]/route.ts was app/admin-host/media/[mediaId]/route.ts
    app/[...missing]/page.tsx, error.tsx, not-found.tsx
    components/                  admin-only UI (admin-shell, new-lead-form, …)
    lib/                         admin-only logic (lead-status, waiting-clients, billing/manual-payment-*, …)
    lib/server/                  env, db, auth, session, staff-access, invites, lead-updates, billing-admin, media-*
packages/
  dashboard/                     NEW @firstfold/dashboard: UI and sign-in code used by both apps
    src/ui/                      dashboard-root, dashboard-frame, sidebar-nav, sign-out-button, sign-in-form,
                                 auth-screen, panel-not-found, local-date-time
    src/lib/                     access, sign-in-form, sign-in-limits
    src/server/                  rate-limits, sign-in (take db/auth as arguments)
```

**What goes where** (from an import scan on 2026-09-18; re-run the scan in Task 1 because files may have changed):

| Module | Used by | Destination |
|---|---|---|
| `components/panel/{dashboard-frame,sidebar-nav,sign-out-button,sign-in-form,auth-screen,panel-not-found,local-date-time}`, `components/dashboard-root` | both | `@firstfold/dashboard/ui/*` |
| `lib/{access,sign-in-form,sign-in-limits}`, `lib/server/rate-limits` | both | `@firstfold/dashboard/{lib,server}/*` |
| `lib/server/{sign-in}` | both | `@firstfold/dashboard/server/sign-in`, with `db`/`auth` as parameters |
| `lib/server/{env,db,auth,session,sign-out}` | both | **stay per app** (each app has its own env schema and auth origins) |
| `lib/server/{media-storage,media-serving}` | both | **copy** to admin (see Task 6); the storage needs to become a shared bucket before production (see "Out of scope") |
| `lib/{currency,billing/terms,billing/manual-payment-form,billing/client-payment,lead-status,project-status,safe-link,onboarding/{steps,hours,business-fields}}` | both | stay in platform; **copy** into admin (small pure modules; the ones that matter are covered by tests in both places). See the Task 5 note. |
| `components/panel/{admin-shell,stat-card,project-status-badge,payments-needing-attention,received-date-input,new-lead-form,lead-status-badge,client-payment-summary}`, `lib/{waiting-clients,billing/attention,billing/manual-payment-notices}`, `lib/server/{staff-access,lead-updates,invites,billing-admin}` | admin only | **move** to `apps/admin` |

---

### Task 1: Re-run the dependency scan

**Files:** none changed.

- [ ] **Step 1: List every module the admin imports and who else uses it**

```bash
cd apps/platform
grep -rhoE 'from "@/[^"]+"' app/admin-host components/panel/admin-shell.tsx | sort -u | sed -E 's/from "@\/(.*)"/\1/' > /tmp/admin-deps.txt
while read -r m; do
  users=$(grep -rlE "@/${m}\"" app components lib proxy.ts | grep -v admin-host | grep -v '\.test\.ts' | tr '\n' ' ')
  echo "$m <- ${users:-ADMIN-ONLY}"
done < /tmp/admin-deps.txt
```

- [ ] **Step 2: Compare with the table above.** If a module moved from "admin only" to "both", or a new one showed up, update the table in this file before going on. Tasks 3–6 follow the table.

---

### Task 2: Create the `@firstfold/dashboard` package

**Files:**
- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/tsconfig.json`, `packages/dashboard/vitest.config.ts` (copied from `packages/shared`)

- [ ] **Step 1: Scaffold**

```bash
mkdir -p packages/dashboard/src/{ui,lib,server}
cp packages/shared/tsconfig.json packages/dashboard/tsconfig.json
cp packages/shared/vitest.config.ts packages/dashboard/vitest.config.ts
```

- [ ] **Step 2: Write `packages/dashboard/package.json`**

```json
{
  "name": "@firstfold/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./ui/*": "./src/ui/*.tsx",
    "./lib/*": "./src/lib/*.ts",
    "./server/*": "./src/server/*.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "@firstfold/auth": "workspace:*",
    "@firstfold/db": "workspace:*",
    "@firstfold/shared": "workspace:*",
    "server-only": "0.0.1",
    "zod": "^4.6.5"
  },
  "peerDependencies": {
    "next": "16.3.5",
    "react": "19.2.8"
  },
  "devDependencies": {
    "@types/node": "^24.13.4",
    "@types/react": "^19",
    "next": "16.3.5",
    "react": "19.2.8",
    "typescript": "^5",
    "vitest": "^5.0.0"
  }
}
```

Check the versions against `packages/shared/package.json` and `apps/platform/package.json` at execution time and use theirs if they changed.

- [ ] **Step 3: Install and check**

```bash
pnpm install
pnpm --filter @firstfold/dashboard typecheck
```

Expected: typecheck passes. `vitest` exits "No test files found", which is fine for now.

---

### Task 3: Move the shared pure modules and their tests

**Files:**
- Move: `apps/platform/lib/{access,sign-in-form,sign-in-limits}.ts` (+ `.test.ts`) → `packages/dashboard/src/lib/`
- Modify: every importer in `apps/platform`

- [ ] **Step 1: Move**

```bash
for m in access sign-in-form sign-in-limits; do
  git mv apps/platform/lib/$m.ts packages/dashboard/src/lib/$m.ts
  [ -f apps/platform/lib/$m.test.ts ] && git mv apps/platform/lib/$m.test.ts packages/dashboard/src/lib/$m.test.ts
done
```

- [ ] **Step 2: Run the moved tests in their new home**

Run: `pnpm --filter @firstfold/dashboard test`
Expected: the moved tests pass. If one fails on an `@/` import inside the moved file, change it to a relative import (`./sign-in-limits`) or a package import (`@firstfold/shared/...`).

- [ ] **Step 3: Rewrite importers in the platform**

```bash
cd apps/platform
grep -rlE '@/lib/(access|sign-in-form|sign-in-limits)"' app components lib proxy.ts | xargs sed -i '' -E \
  's#@/lib/(access|sign-in-form|sign-in-limits)"#@firstfold/dashboard/lib/\1"#g'
```

Add `"@firstfold/dashboard": "workspace:*"` to `apps/platform/package.json` dependencies and `"@firstfold/dashboard"` to `transpilePackages` in `apps/platform/next.config.ts`. Then run `pnpm install`.

- [ ] **Step 4: Checkpoint**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass. The test count is unchanged in total, just spread across different packages.

- [ ] **Step 5: Commit (offer; run only if the user asked)**

```bash
git add -A packages/dashboard apps/platform pnpm-lock.yaml
git commit -m "Move shared access and sign-in rules into @firstfold/dashboard"
```

---

### Task 4: Move the shared server helpers, with `db` and `auth` passed in

`sign-in.ts` and `rate-limits.ts` call each app's own `getAuth()`/`getAppDb()`. In the package they take those as arguments, so each app wires in its own.

**Files:**
- Move: `apps/platform/lib/server/rate-limits.ts` → `packages/dashboard/src/server/rate-limits.ts` (it already takes `db` as a parameter; only its import of `sign-in-limits` changes to `../lib/sign-in-limits`)
- Move + modify: `apps/platform/lib/server/sign-in.ts` → `packages/dashboard/src/server/sign-in.ts`
- Move: `apps/platform/lib/server/sign-in.test.ts` → `packages/dashboard/src/server/sign-in.test.ts`
- Create: `apps/platform/lib/server/sign-in.ts` (a small wrapper)

- [ ] **Step 1: Move**

```bash
git mv apps/platform/lib/server/rate-limits.ts packages/dashboard/src/server/rate-limits.ts
git mv apps/platform/lib/server/sign-in.ts packages/dashboard/src/server/sign-in.ts
git mv apps/platform/lib/server/sign-in.test.ts packages/dashboard/src/server/sign-in.test.ts
sed -i '' 's#"@/lib/sign-in-limits"#"../lib/sign-in-limits"#' packages/dashboard/src/server/rate-limits.ts
```

- [ ] **Step 2: Change the moved test first, so it fails**

In `packages/dashboard/src/server/sign-in.test.ts`, the test currently mocks `./auth` and `./db`. Change it to build a fake `auth` and `db` and pass them in:

```ts
const outcome = await signInWithPassword(formData, { auth: fakeAuth, db: fakeDb });
```

Keep every existing case and assertion; only the way the collaborators are supplied changes.

Run: `pnpm --filter @firstfold/dashboard test -- sign-in`
Expected: FAIL. `signInWithPassword` still has one parameter and still imports `./auth`.

- [ ] **Step 3: Give `signInWithPassword` its dependencies as parameters**

Replace the top of `packages/dashboard/src/server/sign-in.ts` so it reads:

```ts
import "server-only";
import { isInvalidCredentialsError, type Auth } from "@firstfold/auth";
import type { Database } from "@firstfold/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@firstfold/shared/lib/client-ip";
import { parseSignInForm, type SignInFormState } from "../lib/sign-in-form";
import { retryMessage } from "../lib/sign-in-limits";
import { firstBlockedSignInLimit } from "./rate-limits";

export type SignInOutcome = SignInFormState | { readonly status: "signed-in" };

/** The app's own auth instance and its RLS-bound connection. Each app passes its own. */
export interface SignInDependencies {
  readonly auth: Auth;
  readonly db: Database;
}

export async function signInWithPassword(
  formData: FormData,
  { auth, db }: SignInDependencies,
): Promise<SignInOutcome> {
```

In the body, replace `getAppDb()` with `db` and `getAuth()` with `auth`. The rest of the function stays as it is.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @firstfold/dashboard test -- sign-in`
Expected: PASS.

- [ ] **Step 5: Platform wrapper**

Create `apps/platform/lib/server/sign-in.ts`:

```ts
import "server-only";
import { signInWithPassword as signIn, type SignInOutcome } from "@firstfold/dashboard/server/sign-in";
import { getAuth } from "./auth";
import { getAppDb } from "./db";

export type { SignInOutcome };

/** Signs in on the customer app, using its own auth instance and connection. */
export function signInWithPassword(formData: FormData): Promise<SignInOutcome> {
  return signIn(formData, { auth: getAuth(), db: getAppDb() });
}
```

Point the remaining importers of `@/lib/server/rate-limits` (`lib/server/setup.ts`) at `@firstfold/dashboard/server/rate-limits`.

- [ ] **Step 6: Checkpoint**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass.

---

### Task 5: Move the shared dashboard UI

`SignOutButton` imports the platform's `signOut` server action directly. In the package it receives the action as a prop, and `DashboardFrame` passes it through.

**Files:**
- Move: `apps/platform/components/panel/{dashboard-frame,sidebar-nav,sign-out-button,sign-in-form,auth-screen,panel-not-found,local-date-time}.tsx` and `apps/platform/components/dashboard-root.tsx` → `packages/dashboard/src/ui/`
- Modify: `packages/dashboard/src/ui/sign-out-button.tsx`, `packages/dashboard/src/ui/dashboard-frame.tsx`
- Modify: `apps/platform/components/panel/customer-shell.tsx` and every other importer
- Modify: `apps/platform/app/globals.css`

- [ ] **Step 1: Move**

```bash
for c in dashboard-frame sidebar-nav sign-out-button sign-in-form auth-screen panel-not-found local-date-time; do
  git mv apps/platform/components/panel/$c.tsx packages/dashboard/src/ui/$c.tsx
done
git mv apps/platform/components/dashboard-root.tsx packages/dashboard/src/ui/dashboard-root.tsx
cd packages/dashboard/src/ui
sed -i '' -E 's#"@/components/panel/([a-z-]+)"#"./\1"#g; s#"@/lib/sign-in-form"#"../lib/sign-in-form"#g' *.tsx
```

- [ ] **Step 2: Make the sign-out action a prop**

In `packages/dashboard/src/ui/sign-out-button.tsx`, remove `import { signOut } from "@/lib/server/sign-out";`, then add the action to the props and use it as the form action:

```tsx
interface SignOutButtonProps {
  /** The app's own sign-out server action. */
  readonly action: () => Promise<void>;
  readonly variant?: "light" | "dark";
}

export function SignOutButton({ action, variant = "light" }: SignOutButtonProps): ReactElement {
```

In the JSX, change `action={signOut}` to `action={action}`.

In `packages/dashboard/src/ui/dashboard-frame.tsx`, add `readonly signOutAction: () => Promise<void>;` to its props. Destructure it and pass it on: `<SignOutButton action={signOutAction} … />`.

- [ ] **Step 3: Rewrite platform importers**

```bash
cd apps/platform
grep -rlE '@/components/(panel/)?(dashboard-frame|sidebar-nav|sign-out-button|sign-in-form|auth-screen|panel-not-found|local-date-time|dashboard-root)"' app components lib \
  | xargs sed -i '' -E 's#"@/components/(panel/)?(dashboard-frame|sidebar-nav|sign-out-button|sign-in-form|auth-screen|panel-not-found|local-date-time|dashboard-root)"#"@firstfold/dashboard/ui/\2"#g'
```

Then add the new prop where TypeScript asks for it:
- `components/panel/customer-shell.tsx`: `import { signOut } from "@/lib/server/sign-out";` and `signOutAction={signOut}` on `<DashboardFrame>`.
- `app/app-host/(protected)/settings/page.tsx` and `app/app-host/login/page.tsx`: `action={signOut}` on `<SignOutButton>`.

- [ ] **Step 4: Let Tailwind see the package's classes**

In `apps/platform/app/globals.css`, below the existing `@source` line, add:

```css
@source "../../../packages/dashboard/src";
```

- [ ] **Step 5: Checkpoint, with a build**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass.

Then use the preview tools to open the customer app login and a signed-in dashboard page, and screenshot them. They must look exactly as before; if a style is missing, the `@source` line is wrong.

> **Note on the "copy" rows in the table:** modules such as `lib/billing/terms` and `lib/onboarding/steps` stay in the platform, and Task 6 copies them into the admin. That keeps this plan a move, not a refactor. If a copied module later changes in one app, move it into `@firstfold/shared` rather than editing both copies. Record that follow-up in "After the split".

---

### Task 6: Create `apps/admin` and move the staff console into it

**Files:**
- Create: `apps/admin/{package.json,next.config.ts,tsconfig.json,eslint.config.mjs,postcss.config.mjs,vitest.config.mts,.env.example}`
- Create: `apps/admin/app/globals.css`, `apps/admin/app/icon.tsx`, `apps/admin/app/apple-icon.tsx`
- Move: `apps/platform/app/admin-host/**` → `apps/admin/app/**`
- Move (admin-only) and copy (shared-but-app-local) components and lib files per the table

- [ ] **Step 1: Scaffold from the platform's configs**

```bash
mkdir -p apps/admin/{app,components,lib/server,lib/billing,lib/onboarding}
for f in tsconfig.json eslint.config.mjs postcss.config.mjs vitest.config.mts; do cp apps/platform/$f apps/admin/$f; done
cp apps/platform/app/icon.tsx apps/platform/app/apple-icon.tsx apps/admin/app/
```

- [ ] **Step 2: `apps/admin/package.json`**

```json
{
  "name": "@firstfold/admin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "lint": "eslint",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@firstfold/auth": "workspace:*",
    "@firstfold/billing": "workspace:*",
    "@firstfold/dashboard": "workspace:*",
    "@firstfold/db": "workspace:*",
    "@firstfold/email": "workspace:*",
    "@firstfold/shared": "workspace:*",
    "libphonenumber-js": "1.13.13",
    "next": "16.3.5",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "server-only": "0.0.1",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^24.13.4",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.5",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^5.0.0"
  }
}
```

Match the versions to `apps/platform/package.json` at execution time. Payload packages are added in Task 9, not here.

- [ ] **Step 3: Move the routes to the admin app's root**

```bash
git mv "apps/platform/app/admin-host/(protected)" "apps/admin/app/(protected)"
git mv apps/platform/app/admin-host/login apps/admin/app/login
git mv apps/platform/app/admin-host/media apps/admin/app/media
git mv "apps/platform/app/admin-host/[...missing]" "apps/admin/app/[...missing]"
git mv apps/platform/app/admin-host/error.tsx apps/admin/app/error.tsx
git mv apps/platform/app/admin-host/not-found.tsx apps/admin/app/not-found.tsx
git mv apps/platform/app/admin-host/layout.tsx apps/admin/app/layout.tsx
rmdir apps/platform/app/admin-host
```

In `apps/admin/app/media/[mediaId]/route.ts`, change `RouteContext<"/admin-host/media/[mediaId]">` to `RouteContext<"/media/[mediaId]">`.

- [ ] **Step 4: Move admin-only components and lib; copy the shared-but-local ones**

```bash
for c in admin-shell stat-card project-status-badge payments-needing-attention received-date-input new-lead-form lead-status-badge client-payment-summary; do
  git mv apps/platform/components/panel/$c.tsx apps/admin/components/$c.tsx
done
for m in waiting-clients billing/attention billing/manual-payment-notices; do
  git mv apps/platform/lib/$m.ts apps/admin/lib/$m.ts
  [ -f apps/platform/lib/$m.test.ts ] && git mv apps/platform/lib/$m.test.ts apps/admin/lib/$m.test.ts
done
for m in staff-access lead-updates invites billing-admin; do
  git mv apps/platform/lib/server/$m.ts apps/admin/lib/server/$m.ts
  [ -f apps/platform/lib/server/$m.test.ts ] && git mv apps/platform/lib/server/$m.test.ts apps/admin/lib/server/$m.test.ts
done
# Used by both apps and kept per app for now (see the Task 5 note).
for m in currency lead-status project-status safe-link billing/terms billing/manual-payment-form billing/client-payment onboarding/steps onboarding/hours onboarding/business-fields; do
  cp apps/platform/lib/$m.ts apps/admin/lib/$m.ts
  [ -f apps/platform/lib/$m.test.ts ] && cp apps/platform/lib/$m.test.ts apps/admin/lib/$m.test.ts
done
cp apps/platform/lib/server/{media-storage,media-serving}.ts apps/admin/lib/server/
sed -i '' -E 's#"@/components/panel/#"@/components/#g' $(grep -rl '@/components/panel/' apps/admin)
```

`lead-status` is in the copy list only if the scan in Task 1 still shows the platform using it (via `lib/server/lead-updates.ts`, which just moved). If nothing in the platform imports it after this step, `git rm` it from the platform instead of keeping a copy. Do the same check for `billing/client-payment`, `billing/manual-payment-form` and `currency`:

```bash
cd apps/platform
for m in currency lead-status billing/client-payment billing/manual-payment-form; do
  echo "$m: $(grep -rlE "@/lib/$m\"" app components lib | grep -v "lib/$m\." | wc -l | tr -d ' ') importers"
done
```

For every module with 0 importers, remove it from the platform: `git rm apps/platform/lib/$m.ts apps/platform/lib/$m.test.ts`.

- [ ] **Step 5: The admin app's own env, db, auth, session and sign-in**

`apps/admin/lib/server/env.ts`:

```ts
import "server-only";
import { z } from "zod";

const POSTGRES_PROTOCOL = /^postgres(ql)?$/;
const HTTP_PROTOCOL = /^https?$/;

/** An absolute http(s) URL, cut down to its origin so a trailing slash or path can't change auth's baseURL. */
function originUrl(message: string): z.ZodPipe<z.ZodURL, z.ZodTransform<string, string>> {
  return z.url({ protocol: HTTP_PROTOCOL, error: message }).transform((value) => new URL(value).origin);
}

export const adminEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: POSTGRES_PROTOCOL, error: "DATABASE_URL must be a postgresql:// URL" }),
  DATABASE_URL_STAFF: z.url({ protocol: POSTGRES_PROTOCOL, error: "DATABASE_URL_STAFF must be a postgresql:// URL" }),
  /** Signs the admin's own session cookie. Use a different value from the customer app's. */
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  /** This app's own origin, e.g. https://admin.firstfold.example. */
  ADMIN_ORIGIN: originUrl("ADMIN_ORIGIN must be an absolute http:// or https:// URL"),
  /** The customer app, for setup links in invite emails. */
  APP_ORIGIN: originUrl("APP_ORIGIN must be an absolute http:// or https:// URL"),
});

export type AdminEnv = z.output<typeof adminEnvSchema>;

let cached: AdminEnv | undefined;

/** Parsed on first use, so a build does not need these secrets. */
export function serverEnv(): AdminEnv {
  if (cached === undefined) {
    const parsed = adminEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid admin configuration. Check apps/admin/.env.local.\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
```

Test first, in `apps/admin/lib/server/env.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { adminEnvSchema } = await import("./env");

const valid = {
  DATABASE_URL: "postgresql://app@localhost/webfold",
  DATABASE_URL_STAFF: "postgresql://staff@localhost/webfold",
  BETTER_AUTH_SECRET: "x".repeat(32),
  ADMIN_ORIGIN: "http://admin.localhost:3002/",
  APP_ORIGIN: "http://app.localhost:3001",
};

describe("adminEnvSchema", () => {
  it("accepts a full configuration and trims origins to scheme, host and port", () => {
    const parsed = adminEnvSchema.parse(valid);
    expect(parsed.ADMIN_ORIGIN).toBe("http://admin.localhost:3002");
  });

  it("requires APP_ORIGIN, which setup links point at", () => {
    const { APP_ORIGIN: _omitted, ...rest } = valid;
    expect(adminEnvSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a short auth secret", () => {
    expect(adminEnvSchema.safeParse({ ...valid, BETTER_AUTH_SECRET: "short" }).success).toBe(false);
  });
});
```

Run `pnpm --filter @firstfold/admin test -- env` before writing `env.ts`. It should fail because the module is missing; write `env.ts` and it passes.

`apps/admin/lib/server/db.ts`: copy `apps/platform/lib/server/db.ts`. Rename the `globalThis` keys to `firstfoldAdminAppDb` / `firstfoldAdminStaffDb`, and replace its doc comments with one line: "Staff console connections. getStaffDb is the default here; getAppDb exists for better-auth, whose tables use the app role."

`apps/admin/lib/server/auth.ts`:

```ts
import "server-only";
import { createAuth, type Auth } from "@firstfold/auth";
import { getAppDb } from "./db";
import { serverEnv } from "./env";

let auth: Auth | undefined;

/** The admin's own auth: its cookie is set for, and only trusted from, the admin origin. */
export function getAuth(): Auth {
  if (auth === undefined) {
    const env = serverEnv();
    auth = createAuth({
      db: getAppDb(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.ADMIN_ORIGIN,
      trustedOrigins: [env.ADMIN_ORIGIN],
      nextCookies: true,
    });
  }
  return auth;
}
```

`apps/admin/lib/server/session.ts` and `apps/admin/lib/server/sign-out.ts`: copy the platform's files unchanged (they import `./auth`). Change `session.ts`'s `SessionUser` import to `@firstfold/dashboard/lib/access`.

`apps/admin/lib/server/sign-in.ts`: the same wrapper as the platform's in Task 4 Step 5, with the doc comment "Signs in on the staff console…".

- [ ] **Step 6: Fix imports that pointed at modules now in the package**

```bash
cd apps/admin
grep -rlE '@/lib/(access|sign-in-form|sign-in-limits)"|@/components/(dashboard-root|dashboard-frame|sidebar-nav|sign-out-button|sign-in-form|auth-screen|panel-not-found|local-date-time)"' app components lib \
  | xargs sed -i '' -E \
    -e 's#"@/lib/(access|sign-in-form|sign-in-limits)"#"@firstfold/dashboard/lib/\1"#g' \
    -e 's#"@/components/(dashboard-root|dashboard-frame|sidebar-nav|sign-out-button|sign-in-form|auth-screen|panel-not-found|local-date-time)"#"@firstfold/dashboard/ui/\1"#g'
```

In `apps/admin/components/admin-shell.tsx`, import `signOut` from `@/lib/server/sign-out` and pass `signOutAction={signOut}` to `<DashboardFrame>`.

- [ ] **Step 7: The root layout no longer checks a host**

In `apps/admin/app/layout.tsx`, remove the `requireSurfaceHost` import and its `await requireSurfaceHost("admin");` line. The layout stays `async`-free:

```tsx
export default function AdminLayout({ children }: AdminLayoutProps): ReactElement {
  return <DashboardRoot>{children}</DashboardRoot>;
}
```

Rename the props interface to `AdminLayoutProps`, and change `import "../globals.css"` to `import "./globals.css"`.

This app only serves the admin, so there's no host to tell apart. Host restriction becomes a Vercel setting (Task 10). Every page and action still calls `requireStaffAccess()`, which is the actual access check.

- [ ] **Step 8: `apps/admin/app/globals.css`**

```css
@import "tailwindcss";
@import "@firstfold/shared/styles/theme.css";

/* Shared components use Tailwind classes too, so their source is scanned alongside this app. */
@source "../../../packages/shared/src";
@source "../../../packages/dashboard/src";
```

- [ ] **Step 9: `apps/admin/next.config.ts`**

```ts
import type { NextConfig } from "next";
import { securityHeaders } from "@firstfold/shared/lib/security-headers";

const REQUIRED_FOR_PRODUCTION = [
  "NEXT_PUBLIC_SITE_URL",
  "ADMIN_ORIGIN",
  "APP_ORIGIN",
  "DATABASE_URL",
  "DATABASE_URL_STAFF",
  "BETTER_AUTH_SECRET",
] as const;

/** Fails a production deploy early instead of shipping a console that can't sign anyone in. */
function assertProductionEnvironment(): void {
  if (process.env.VERCEL_ENV !== "production") return;
  const missing = REQUIRED_FOR_PRODUCTION.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Production deployment is missing required environment variables: ${missing.join(", ")}. See .env.example.`);
  }
}

assertProductionEnvironment();

const servedOverHttps = process.env.VERCEL === "1" || (process.env.ADMIN_ORIGIN?.trim().startsWith("https://") ?? false);

/** The staff console. Customers and the website never reach this app. */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders({ development: process.env.NODE_ENV === "development", https: servedOverHttps, framedOrigins: [] }),
          // Nothing on the staff console should ever be indexed.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon", permanent: true }];
  },
  transpilePackages: ["@firstfold/auth", "@firstfold/billing", "@firstfold/dashboard", "@firstfold/db", "@firstfold/email", "@firstfold/shared"],
};

export default nextConfig;
```

Before writing this, check what `securityHeaders` returns (`packages/shared/src/lib/security-headers.ts`). If it's not an array of `{ key, value }`, append the robots header the way that function's return type allows.

- [ ] **Step 10: `apps/admin/.env.example`**

Copy the admin-relevant blocks from `apps/platform/.env.example`: the two database URLs, `BETTER_AUTH_SECRET` and `NEXT_PUBLIC_SITE_URL`. Keep their comments. Add:

```
# This app's own origin. Locally: http://admin.localhost:3002
ADMIN_ORIGIN=
# The customer app, for setup links in invite emails. Locally: http://app.localhost:3001
APP_ORIGIN=
```

Also create `apps/admin/.env.local` with local values. Copy the database URLs from `apps/platform/.env.local` without printing them: `grep -E '^(DATABASE_URL|DATABASE_URL_STAFF|NEXT_PUBLIC_SITE_URL)=' apps/platform/.env.local >> apps/admin/.env.local`. Generate a new secret with `openssl rand -base64 48`. Never print either `.env.local`.

- [ ] **Step 11: Install and checkpoint the admin app**

```bash
pnpm install
pnpm --filter @firstfold/admin typecheck
pnpm --filter @firstfold/admin lint
pnpm --filter @firstfold/admin test
pnpm --filter @firstfold/admin build
```

Expected: all pass. The moved admin tests (e.g. `billing-admin.test.ts`, `lead-updates.test.ts`, `waiting-clients.test.ts`, `manual-payment-*.test.ts`) run and pass here. They no longer run in the platform.

---

### Task 7: Make the platform serve only the customer app

**Files:**
- Modify: `apps/platform/lib/surfaces.ts`, `apps/platform/lib/surfaces.test.ts`
- Modify: `apps/platform/proxy.ts`, `apps/platform/proxy.test.ts`
- Modify: `apps/platform/lib/server/env.ts`, `apps/platform/lib/server/auth.ts`, `apps/platform/next.config.ts`, `apps/platform/.env.example`

- [ ] **Step 1: Write the failing proxy test**

Add to `apps/platform/proxy.test.ts`:

```ts
it("404s the old admin host now that the staff console is its own app", () => {
  const handler = createProxy({ app: "http://app.localhost:3001" });
  const response = handler(requestFor("http://admin.localhost:3001/leads"));
  expect(response.status).toBe(404);
});
```

Use the file's existing request-building helper; if it has a different name than `requestFor`, use that name. Remove any test that expects the admin host to be rewritten to `/admin-host`. Remove the admin cases in `lib/surfaces.test.ts` too; keep and adapt the app-host and unknown-host cases.

Run: `pnpm --filter @firstfold/platform test -- proxy surfaces`
Expected: FAIL (type error: `admin` missing from `SurfaceOrigins`, or the old rewrite still happens).

- [ ] **Step 2: Remove the admin surface**

In `apps/platform/lib/surfaces.ts`:
- `export type Surface = "app";`
- `SurfaceOrigins` becomes `{ readonly app: string }`.
- `SURFACE_PATH_PREFIX` becomes `{ app: "/app-host" } as const`.
- `resolveSurface` only compares against `origins.app`.
- `readOriginsFromEnv` reads only `APP_ORIGIN`, returning `null` when it's empty and throwing on an invalid URL. The "set together" and "different hosts" checks go away.
- Remove `isPayloadAdminPath` and `PAYLOAD_ADMIN_PATH_PREFIX` **only if Task 9 has moved Payload's admin UI**. Otherwise leave them and do Task 9 first.

In `apps/platform/proxy.ts`, remove the `isPayloadAdminPath` branch (same condition as above) and update the doc comment to "Routes the customer app's host to its routes. Every other host 404s…".

In `apps/platform/lib/server/env.ts`, remove `ADMIN_ORIGIN`. In `apps/platform/lib/server/auth.ts`, set `trustedOrigins: [env.APP_ORIGIN]`. In `apps/platform/next.config.ts`, remove `"ADMIN_ORIGIN"` from `REQUIRED_FOR_PRODUCTION` and update the header comment. In `apps/platform/.env.example`, remove `ADMIN_ORIGIN` and change the first line to say this app serves the customer app and its API routes.

`lib/server/upload-request.ts` compares against the app host only; check that it doesn't read `ADMIN_ORIGIN`. Fix it if it does.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @firstfold/platform test -- proxy surfaces`
Expected: PASS.

- [ ] **Step 4: Nothing in the platform still points at the admin**

```bash
cd apps/platform
grep -rnE 'admin-host|ADMIN_ORIGIN|staff-access|requireStaffAccess' app components lib proxy.ts next.config.ts .env.example
```

Expected: no output, except Payload files if Task 9 hasn't run yet.

- [ ] **Step 5: Full checkpoint**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass.

---

### Task 8: Root scripts, local dev and launch config

**Files:**
- Modify: `package.json` (repo root)
- Modify: `.claude/launch.json` (repo root)
- Modify: `README.md` (repo root; the local setup section)

- [ ] **Step 1: Root scripts cover both apps**

In the root `package.json`:

```json
"dev": "pnpm --parallel --filter @firstfold/platform --filter @firstfold/admin dev",
"dev:platform": "pnpm --filter @firstfold/platform dev",
"dev:admin": "pnpm --filter @firstfold/admin dev",
"build": "pnpm --filter @firstfold/platform --filter @firstfold/admin build",
"lint": "pnpm --filter @firstfold/platform --filter @firstfold/admin lint",
```

`typecheck` and `test` already use `pnpm -r`, so they pick up the new app and package on their own.

- [ ] **Step 2: Launch config**

Add a `firstfold-admin` entry to `.claude/launch.json`: `runtimeExecutable` `pnpm`, `runtimeArgs` `["--filter", "@firstfold/admin", "dev"]`, `port` `3002`, `url` `http://admin.localhost:3002`. Keep the existing platform entry.

- [ ] **Step 3: README**

Update the local setup section:
- the staff console now runs on `http://admin.localhost:3002` with `pnpm dev:admin`;
- it has its own `apps/admin/.env.local`;
- `pnpm staff:create` is unchanged, because staff accounts live in the shared database.

- [ ] **Step 4: See it working**

Start `firstfold-admin` with `preview_start`. Sign in with a local staff account, then open:
- Overview
- Leads (list, one lead, new lead)
- Clients (list, one client)
- Outbox

On a client with an uploaded image, check that `/media/{id}` loads. Check the console and server logs for errors. Then open the old host (`http://admin.localhost:3001`) on the platform's server and confirm it 404s. Screenshot the admin overview and a lead page as proof.

---

### Task 9: Move Payload's staff UI to the admin app (only if the Payload migration has landed)

Skip this task if `apps/platform/app/(payload)` doesn't exist. Otherwise, read the committed Payload plan and code first. The steps below are the shape of the move; the Payload plan's own rules still apply: don't hand-write Payload's generated files, and regenerate them with Payload's CLI.

**Files:**
- Create: `packages/cms` (`@firstfold/cms`), holding the Payload config: collections and access rules. Both apps use it.
- Move: `apps/platform/app/(payload)/**` → `apps/admin/app/(payload)/**`
- Move: `apps/platform/lib/server/require-admin-host.ts`: delete it instead, because the admin app serves only the admin host (see Step 3)
- Modify: `apps/platform/payload.config.ts` → re-export from `@firstfold/cms`, no admin UI
- Modify: both `next.config.ts` files (`withPayload` where needed)

- [ ] **Step 1: Move the config into a package.** Create `packages/cms` the same way Task 2 created `packages/dashboard`. Move the collections and `buildConfig` call into `packages/cms/src/config.ts` as a function, `buildFirstfoldPayloadConfig({ databaseUrl, secret, withAdmin })`. Each app calls it with its own env. `apps/platform/payload.config.ts` calls it with `withAdmin: false`; if Payload has no option to turn its admin off, it's enough that the platform no longer mounts the admin routes. `apps/admin/payload.config.ts` calls it with `withAdmin: true`. Payload's auto-generated migrations stay with the config in `packages/cms`, so only one place owns them.
- [ ] **Step 2: Move the admin routes.** Use `git mv` on `app/(payload)` into `apps/admin/app/(payload)`. Then run Payload's import-map generator in `apps/admin`, using the command the Payload plan used. Don't edit `importMap.js` by hand.
- [ ] **Step 3: Remove host checks the admin app no longer needs.** In the moved `(payload)/layout.tsx` and API routes, remove the `requireSurfaceHost("admin")` and `isAdminHostRequest` checks. Delete `apps/platform/lib/server/require-admin-host.ts`, then run `grep -rn require-admin-host apps` and expect no output. Payload's own access functions still guard every collection.
- [ ] **Step 4: Platform keeps the Local API only.** Customer server actions still call Payload's Local API through `apps/platform/payload.config.ts`. Run the customer content tests from the Payload plan. They must pass unchanged.
- [ ] **Step 5: Finish Task 7 Step 2's deferred removals** (`isPayloadAdminPath`, the proxy branch), then do the full checkpoint for both apps.

---

### Task 10: Vercel

This is done by the user in the Vercel dashboard. Give them these steps; don't change Vercel settings yourself unless they ask.

- [ ] **Step 1: New project for the admin.** Import the same repo. Set **Root Directory** to `apps/admin` and leave the framework as Next.js. Environment variables, for Production and Preview:
  - `DATABASE_URL`, `DATABASE_URL_STAFF`: the same database as the platform.
  - `BETTER_AUTH_SECRET`: a **new** value, different from the platform's.
  - `ADMIN_ORIGIN`: the admin domain.
  - `APP_ORIGIN`: the customer app domain.
  - `NEXT_PUBLIC_SITE_URL`: the website.
- [ ] **Step 2: Lock it down.** Turn on Vercel Deployment Protection for **all** deployments of this project, including production, if the plan allows it. Otherwise enable Vercel Authentication for previews and rely on staff login in production. Attach only the admin domain.
- [ ] **Step 3: Skip unrelated builds.** For each project, set the Ignored Build Step so a change to one app doesn't rebuild the other. Admin: `git diff --quiet HEAD^ HEAD -- . ../../packages`. Platform: the same command, run from its own root directory.
- [ ] **Step 4: Platform project.** Remove `ADMIN_ORIGIN` from its environment variables and detach the admin domain from it.

---

## Out of scope (tell the user; don't build here)

- **Media storage must become a shared bucket before production.** `lib/server/media-storage.ts` writes to local disk. That already doesn't persist on Vercel, and with two apps the admin can't read files the customer app wrote. Locally, both apps work if they point at the same media folder. For production, add a bucket-backed `MediaStorage` (the interface is already there), e.g. DigitalOcean Spaces, in its own plan.
- **Removing the copied modules.** Task 6 copies a few small modules into the admin. If either copy starts to change, move that module into `@firstfold/shared`.
- **Flattening `app/app-host` to the platform's root.** The platform could drop its `/app-host` prefix and the proxy rewrite. That's churn with no user-facing gain right now.

## Self-review

- Every row of the "What goes where" table is covered: shared UI → Task 5; shared lib/server → Tasks 3–4; admin-only moves and per-app copies → Task 6; platform cleanup → Task 7; Payload → Task 9; deploy → Task 10.
- Names used consistently: `signInWithPassword(formData, { auth, db })` and `SignInDependencies` (Task 4, reused in Task 6 Step 5); `signOutAction` on `DashboardFrame` and `action` on `SignOutButton` (Task 5, used in Task 6 Step 6); `adminEnvSchema` and `serverEnv()` (Task 6 Step 5).
- Task 9 describes the shape of the move rather than exact file contents, on purpose. Payload's files are generated and weren't committed when this plan was written. The Payload plan forbids hand-writing them.
