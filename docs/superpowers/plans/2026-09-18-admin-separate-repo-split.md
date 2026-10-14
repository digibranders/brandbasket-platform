# Firstfold Admin — Separate Repo Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the staff console (superadmin) out of the `first-found` monorepo into its own GitHub repository, `56steve/firstfold-admin`, while it keeps working against the same Postgres database and the same business logic — no schema duplication, no drift.

**Architecture:** Today one Next.js app (`apps/platform`) serves two hosts via `proxy.ts`: `app.` → the customer app, `admin.` → the staff console. After this plan:
- `first-found` (this repo) keeps `apps/platform`, serving only the customer app.
- A new, separate repo, `firstfold-admin`, is its own Next.js app serving the staff console at its own root.
- Code both apps need — the DB schema (`@firstfold/db`), auth (`@firstfold/auth`), billing (`@firstfold/billing`), email (`@firstfold/email`), shared UI primitives (`@firstfold/shared`), the dashboard shell/sign-in code (a new `@firstfold/dashboard`), and the Payload CMS config/collections (a new `@firstfold/cms`) — is published as **private npm packages on GitHub Packages**, under the `@firstfold` scope, tied to this repo via each package's `repository` field (GitHub Packages resolves ownership from that field, not from the scope needing to equal the GitHub account name — confirmed against GitHub's own docs before writing this plan).
- `firstfold-admin` installs those packages as ordinary versioned dependencies, the same way it'd depend on any third-party library. When shared code changes here, bump the package's version and republish; `firstfold-admin` picks it up on its next `pnpm update`.

**Tech Stack:** pnpm, Next.js 16.3.5 App Router, React 19, Tailwind 4, better-auth, Drizzle ORM, Vitest, GitHub Packages (private npm registry), Vercel.

---

## Why this shape (decided with the user on 2026-09-18)

An earlier plan (`docs/superpowers/plans/2026-09-18-admin-app-split.md`, halted before it started) chose a second app in the *same* monorepo instead of a separate repo, specifically to avoid the admin needing its own copy of the DB schema and migrations. That reasoning still holds — this plan does **not** duplicate `packages/db`. Instead of a workspace, the shared packages are published; `firstfold-admin` consumes them as dependencies, same as it would any other library. The cost, accepted by the user: a schema or auth change in this repo needs a version bump and a publish before `firstfold-admin` can see it — one extra step, not a second copy.

Where this plan reuses that earlier plan's already-worked-out content (the dashboard-UI extraction, the sign-in dependency-injection refactor, the admin app's own env/auth/session files), it says so and carries the code across with paths adjusted, rather than re-deriving it.

**One deliberate simplification over the halted plan's Task 9:** the halted plan mounted Payload's own generated admin UI (`/admin`) inside whichever app serves staff. Per the corrected Payload CMS architecture (see `docs/superpowers/plans/2026-09-17-payload-cms-migration.md`'s "Architecture, corrected" section), **nobody — staff or customer — ever uses Payload's own admin UI**; both use Firstfold's own hand-built screens, and Payload is reached only through its Local API. Payload's Local API does not require the admin UI route to be mounted at all. So this plan does not move `apps/platform/app/(payload)/admin/[[...segments]]/page.tsx` anywhere — it deletes it from `apps/platform` (Task 9) and never creates it in `firstfold-admin`. Only the collections/config (`@firstfold/cms`) and the API/GraphQL routes Payload's Local API needs move or get shared. This removes an already-unused surface instead of relocating it — flag it to the user once during review in case they want Payload's admin UI kept as a break-glass tool, but nothing in this repo's history suggests they do.

## Preconditions (check before Task 1; stop and ask the user if any fails)

1. **`git status --short` is clean in `first-found`, or only has changes you understand.** This plan edits package.json files under `packages/`, so uncommitted work there could be confused with this plan's edits. This session's Payload CMS migration work is uncommitted by the user's own standing instruction ([no commits unless asked](../../../../.claude/projects/-Users-siddiqueahmed-Desktop-AI-first-found/memory/no-commits-without-ask.md) — do not commit it as part of this plan either, unless the user asks in that message).
2. **Baseline is green:**
   ```bash
   cd /Users/siddiqueahmed/Desktop/AI/first-found/first-found
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
   Expected: all pass. If not, stop and tell the user rather than building on a red baseline.
3. **A GitHub Packages auth token exists.** This plan cannot create one for you (it's a credential the user must generate). Before Task 2: go to https://github.com/settings/tokens (classic token), scopes `read:packages`, `write:packages`, `repo` (the last one is needed because `first-found` is a private repo, and GitHub Packages needs to read repo metadata to resolve package ownership). Export it as an environment variable — do not commit it and do not paste it into chat:
   ```bash
   export GITHUB_PACKAGES_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   ```
   Add that `export` line to `~/.zshrc` (this session's shell) so it survives new terminals.

## File structure after the split

```
first-found/                       (this repo — unchanged root, apps/platform only serves the customer app)
  apps/platform/
    app/app-host/...                unchanged
    app/(payload)/                  Payload's API/GraphQL routes only — admin UI route deleted (Task 9)
    lib/surfaces.ts                 one surface: "app"
    proxy.ts                        404s every host but the app host
    payload.config.ts               re-exports @firstfold/cms's buildFirstfoldPayloadConfig()
  packages/
    db/, auth/, billing/, email/, shared/     existing, now also published (Task 1)
    dashboard/                      NEW @firstfold/dashboard: dashboard shell UI + sign-in logic, published (Task 3)
    cms/                            NEW @firstfold/cms: Payload collections + buildFirstfoldPayloadConfig(), published (Task 4)

firstfold-admin/                     NEW, separate GitHub repo (56steve/firstfold-admin), own git history
  package.json                      depends on @firstfold/{db,auth,billing,email,shared,dashboard,cms} as published versions
  app/                              staff console routes (was apps/platform/app/admin-host/**)
    (protected)/...                 leads, clients, outbox, content editor
    login/...
    media/[mediaId]/route.ts
    api/admin-content-media/route.ts
  components/                       admin-only UI (admin-shell, new-lead-form, admin-page-editor, …)
  lib/, lib/server/                 admin-only logic + this app's own env/db/auth/session
  payload.config.ts                 calls @firstfold/cms's buildFirstfoldPayloadConfig(), Local API only
```

---

### Task 1: Make the five existing shared packages publishable

**Files:**
- Modify: `packages/db/package.json`, `packages/auth/package.json`, `packages/billing/package.json`, `packages/email/package.json`, `packages/shared/package.json`

Every one of these currently has `"private": true` and exports raw `.ts` source directly (e.g. `"exports": {".": "./src/index.ts"}`). That's fine to keep publishing as-is — Next.js's `transpilePackages` compiles TS from `node_modules` the same way it compiles it from a workspace symlink — but each package needs three things added: it must not be `private`, it needs a `repository` field so GitHub Packages can tie the scoped name `@firstfold/*` to this repo (GitHub Packages resolves ownership from `repository`, not from the scope matching the GitHub account — this repo's account is `56steve`, not `firstfold`), and a `publishConfig` pointing at the GitHub Packages registry so a stray `pnpm publish` never targets the public npm registry by accident.

- [ ] **Step 1: Edit each package.json**

For `packages/db/package.json` (apply the same three edits to `packages/auth`, `packages/billing`, `packages/email`, `packages/shared` — only the `"name"` differs):

```json
{
  "name": "@firstfold/db",
  "version": "0.1.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/56steve/first-found.git",
    "directory": "packages/db"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "type": "module",
  ...
```

Remove `"private": true` from all five. Keep every other field (`exports`, `scripts`, `dependencies`, `devDependencies`) exactly as it is.

- [ ] **Step 2: Keep test files out of the published tarball**

Add to each of the five package.jsons, alongside `"exports"`:

```json
"files": ["src", "!src/**/*.test.ts", "!src/testing/fixtures"]
```

(Skip the `!src/testing/fixtures` line for any package that doesn't have that directory — only `packages/db` does.)

- [ ] **Step 3: Checkpoint**

```bash
pnpm install && pnpm typecheck
```

Expected: passes unchanged — `private: false` and `publishConfig`/`repository`/`files` don't affect how pnpm resolves the workspace locally.

---

### Task 2: Authenticate with GitHub Packages and publish the first versions

**Files:**
- Create: `~/.npmrc` (home directory — never commit this)
- Create: `.npmrc` (repo root, committed — has no secret in it)

- [ ] **Step 1: Registry auth**

In `~/.npmrc` (create if it doesn't exist):

```
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

In the repo root's `.npmrc` (safe to commit — no token, just the scope mapping so anyone on the team resolves `@firstfold/*` from the right registry):

```
@firstfold:registry=https://npm.pkg.github.com
```

- [ ] **Step 2: Publish**

```bash
for pkg in db auth billing email shared; do
  (cd packages/$pkg && pnpm publish --no-git-checks)
done
```

`--no-git-checks` is needed because these packages don't have their own git tags — this monorepo tags releases differently, if at all. Expected: five `+ @firstfold/<name>@0.1.0` lines, no errors.

- [ ] **Step 3: Confirm from the outside**

```bash
gh api /orgs/56steve/packages 2>&1 || gh api /users/56steve/packages?package_type=npm
```

Expected: lists `db`, `auth`, `billing`, `email`, `shared` (a personal GitHub account uses the `/users/` endpoint, not `/orgs/`; try both, one will 404 harmlessly).

---

### Task 3: Extract `@firstfold/dashboard` (shared dashboard shell + sign-in)

This is the halted plan's Tasks 2, 3, 4 and 5, unchanged in substance — same files, same dependency-injection refactor for `signInWithPassword` and `SignOutButton` — carried here with one difference: the package gets published at the end instead of staying a workspace-only package.

**Files:**
- Create: `packages/dashboard/package.json`, `packages/dashboard/tsconfig.json`, `packages/dashboard/vitest.config.ts`
- Move: `apps/platform/lib/{access,sign-in-form,sign-in-limits}.ts` (+ `.test.ts`) → `packages/dashboard/src/lib/`
- Move: `apps/platform/lib/server/rate-limits.ts` → `packages/dashboard/src/server/rate-limits.ts`
- Move + modify: `apps/platform/lib/server/sign-in.ts` (+ `.test.ts`) → `packages/dashboard/src/server/sign-in.ts`
- Move: `apps/platform/components/panel/{dashboard-frame,sidebar-nav,sign-out-button,sign-in-form,auth-screen,panel-not-found,local-date-time}.tsx`, `apps/platform/components/dashboard-root.tsx` → `packages/dashboard/src/ui/`
- Modify: every importer of the above inside `apps/platform`
- Create: `apps/platform/lib/server/sign-in.ts` (thin wrapper, stays in platform)

- [ ] **Step 1: Scaffold**

```bash
mkdir -p packages/dashboard/src/{ui,lib,server}
cp packages/shared/tsconfig.json packages/dashboard/tsconfig.json
cp packages/shared/vitest.config.ts packages/dashboard/vitest.config.ts
```

- [ ] **Step 2: `packages/dashboard/package.json`**

```json
{
  "name": "@firstfold/dashboard",
  "version": "0.1.0",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "https://github.com/56steve/first-found.git",
    "directory": "packages/dashboard"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "exports": {
    "./ui/*": "./src/ui/*.tsx",
    "./lib/*": "./src/lib/*.ts",
    "./server/*": "./src/server/*.ts"
  },
  "files": ["src", "!src/**/*.test.ts", "!src/**/*.test.tsx"],
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

(Check the versions against `packages/shared/package.json` and `apps/platform/package.json` at execution time and use theirs if they've changed since this plan was written.)

- [ ] **Step 3: Move the pure lib modules**

```bash
for m in access sign-in-form sign-in-limits; do
  git mv apps/platform/lib/$m.ts packages/dashboard/src/lib/$m.ts
  [ -f apps/platform/lib/$m.test.ts ] && git mv apps/platform/lib/$m.test.ts packages/dashboard/src/lib/$m.test.ts
done
```

Run: `pnpm --filter @firstfold/dashboard test`. If a moved test fails on an `@/` import, change it to a relative import (`./sign-in-limits`) or a package import (`@firstfold/shared/...`).

- [ ] **Step 4: Move `rate-limits.ts`**

```bash
git mv apps/platform/lib/server/rate-limits.ts packages/dashboard/src/server/rate-limits.ts
sed -i '' 's#"@/lib/sign-in-limits"#"../lib/sign-in-limits"#' packages/dashboard/src/server/rate-limits.ts
```

- [ ] **Step 5: Move `sign-in.ts` and give it its dependencies as parameters (TDD)**

```bash
git mv apps/platform/lib/server/sign-in.ts packages/dashboard/src/server/sign-in.ts
git mv apps/platform/lib/server/sign-in.test.ts packages/dashboard/src/server/sign-in.test.ts
```

In `packages/dashboard/src/server/sign-in.test.ts`, change the test to build a fake `auth` and `db` and pass them in, instead of mocking `./auth`/`./db`:

```ts
const outcome = await signInWithPassword(formData, { auth: fakeAuth, db: fakeDb });
```

Keep every existing case and assertion — only how the collaborators are supplied changes.

Run: `pnpm --filter @firstfold/dashboard test -- sign-in`
Expected: FAIL — `signInWithPassword` still takes one parameter and still imports `./auth`.

Replace the top of `packages/dashboard/src/server/sign-in.ts`:

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

In the body, replace `getAppDb()` with `db` and `getAuth()` with `auth`. Leave the rest of the function's logic as it is.

Run: `pnpm --filter @firstfold/dashboard test -- sign-in`
Expected: PASS.

- [ ] **Step 6: Platform wrapper**

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

Point `apps/platform/lib/server/setup.ts`'s import of `rate-limits` at `@firstfold/dashboard/server/rate-limits`.

- [ ] **Step 7: Move the shared UI**

```bash
for c in dashboard-frame sidebar-nav sign-out-button sign-in-form auth-screen panel-not-found local-date-time; do
  git mv apps/platform/components/panel/$c.tsx packages/dashboard/src/ui/$c.tsx
done
git mv apps/platform/components/dashboard-root.tsx packages/dashboard/src/ui/dashboard-root.tsx
cd packages/dashboard/src/ui
sed -i '' -E 's#"@/components/panel/([a-z-]+)"#"./\1"#g; s#"@/lib/sign-in-form"#"../lib/sign-in-form"#g' *.tsx
cd -
```

In `packages/dashboard/src/ui/sign-out-button.tsx`: remove `import { signOut } from "@/lib/server/sign-out";`, add `action` to the props, use it as the form action:

```tsx
interface SignOutButtonProps {
  /** The app's own sign-out server action. */
  readonly action: () => Promise<void>;
  readonly variant?: "light" | "dark";
}

export function SignOutButton({ action, variant = "light" }: SignOutButtonProps): ReactElement {
```

Change `action={signOut}` to `action={action}` in the JSX.

In `packages/dashboard/src/ui/dashboard-frame.tsx`: add `readonly signOutAction: () => Promise<void>;` to its props, destructure it, pass it to `<SignOutButton action={signOutAction} … />`.

- [ ] **Step 8: Rewrite platform importers and add the `@source` line**

```bash
cd apps/platform
grep -rlE '@/lib/(access|sign-in-form|sign-in-limits)"' app components lib proxy.ts | xargs sed -i '' -E \
  's#@/lib/(access|sign-in-form|sign-in-limits)"#@firstfold/dashboard/lib/\1"#g'
grep -rlE '@/components/(panel/)?(dashboard-frame|sidebar-nav|sign-out-button|sign-in-form|auth-screen|panel-not-found|local-date-time|dashboard-root)"' app components lib \
  | xargs sed -i '' -E 's#"@/components/(panel/)?(dashboard-frame|sidebar-nav|sign-out-button|sign-in-form|auth-screen|panel-not-found|local-date-time|dashboard-root)"#"@firstfold/dashboard/ui/\2"#g'
cd -
```

Then, where TypeScript points out the new `signOutAction` prop is missing:
- `components/panel/customer-shell.tsx`: import `signOut` from `@/lib/server/sign-out`, pass `signOutAction={signOut}` to `<DashboardFrame>`.
- `app/app-host/(protected)/settings/page.tsx` and `app/app-host/login/page.tsx`: pass `action={signOut}` to `<SignOutButton>`.

Add `"@firstfold/dashboard": "workspace:*"` to `apps/platform/package.json`'s dependencies and `"@firstfold/dashboard"` to `transpilePackages` in `apps/platform/next.config.ts`.

In `apps/platform/app/globals.css`, below the existing `@source` line:

```css
@source "../../../packages/dashboard/src";
```

- [ ] **Step 9: Checkpoint, with a build and a visual check**

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Then open the customer app's login screen and a signed-in dashboard page with the preview tools; screenshot both. They must look exactly as before — if a style is missing, the `@source` line is wrong.

- [ ] **Step 10: Publish**

```bash
cd packages/dashboard && pnpm publish --no-git-checks && cd -
```

---

### Task 4: Extract `@firstfold/cms` (Payload collections + config)

Both apps need Payload's Local API — the customer app for its own content actions (already built, this session's Payload CMS migration), the staff app for the admin content editor (also already built, currently living in `apps/platform/app/admin-host`). Rather than duplicate the five collection files and `payload.config.ts`, they move into a published package both apps call to build their own `payload.config.ts`.

**Files:**
- Create: `packages/cms/package.json`, `packages/cms/tsconfig.json`
- Move: `apps/platform/collections/{Tenants,Pages,Media,Gallery,BlogPosts}.ts` → `packages/cms/src/collections/`
- Create: `packages/cms/src/build-config.ts` (extracted from `apps/platform/payload.config.ts`)
- Modify: `apps/platform/payload.config.ts` (becomes a thin call into the package)

- [ ] **Step 1: Read the current config first**

```bash
cat apps/platform/payload.config.ts
```

Note its exact `buildConfig({...})` call — imports, `db: postgresAdapter(...)`, `editor: lexicalEditor(...)`, `secret`, `collections`, `plugins`, any `typescript`/`graphQL` output paths. The extraction in Step 3 must reproduce this exactly; don't invent new options.

- [ ] **Step 2: Scaffold**

```bash
mkdir -p packages/cms/src/collections
cp packages/dashboard/tsconfig.json packages/cms/tsconfig.json
```

`packages/cms/package.json`:

```json
{
  "name": "@firstfold/cms",
  "version": "0.1.0",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "https://github.com/56steve/first-found.git",
    "directory": "packages/cms"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "exports": {
    ".": "./src/build-config.ts",
    "./collections/*": "./src/collections/*.ts"
  },
  "files": ["src"],
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@payloadcms/db-postgres": "^3.89.0",
    "@payloadcms/richtext-lexical": "^3.89.0",
    "payload": "^3.89.0"
  },
  "devDependencies": {
    "@types/node": "^24.13.4",
    "typescript": "^5"
  }
}
```

Match the `@payloadcms/*`/`payload` version to `apps/platform/package.json`'s current version at execution time.

- [ ] **Step 3: Move the collections**

```bash
for c in Tenants Pages Media Gallery BlogPosts; do
  git mv apps/platform/collections/$c.ts packages/cms/src/collections/$c.ts
done
```

These files don't import anything from `apps/platform` besides Payload's own types (confirm with `grep -n '"@/' packages/cms/src/collections/*.ts` — expected: no output). If any do, that import needs to move or become a parameter; stop and re-plan that one file rather than guessing.

- [ ] **Step 4: Write `build-config.ts`**

```ts
import "server-only";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, type SanitizedConfig } from "payload";
import { BlogPosts } from "./collections/BlogPosts";
import { Gallery } from "./collections/Gallery";
import { Media } from "./collections/Media";
import { Pages } from "./collections/Pages";
import { Tenants } from "./collections/Tenants";

export interface FirstfoldPayloadConfigOptions {
  /** The Payload-only database's connection string (DATABASE_URL_PAYLOAD in both apps). */
  readonly databaseUrl: string;
  /** At least 32 characters. Each app may use its own value or share one — either works, since nothing signs a session with it (no one authenticates into Payload directly). */
  readonly secret: string;
}

/**
 * One config, called by both apps' own `payload.config.ts` with their own env. Neither app mounts Payload's
 * generated admin UI — see docs/superpowers/plans/2026-09-18-admin-separate-repo-split.md's "Why this shape" note
 * for why that's deliberate, not an oversight. This function exists purely so `getPayload({ config })` has
 * something to call from server actions / route handlers in both apps.
 */
export function buildFirstfoldPayloadConfig({ databaseUrl, secret }: FirstfoldPayloadConfigOptions): Promise<SanitizedConfig> {
  return buildConfig({
    secret,
    db: postgresAdapter({ pool: { connectionString: databaseUrl } }),
    editor: lexicalEditor(),
    collections: [Tenants, Pages, Media, Gallery, BlogPosts],
    plugins: [],
  });
}
```

Adjust this to match whatever Step 1 actually found in `apps/platform/payload.config.ts` — the shape above is this plan's best guess from the migration's own summary, not a substitute for reading the real file.

- [ ] **Step 5: Rewire `apps/platform/payload.config.ts`**

```ts
import { buildFirstfoldPayloadConfig } from "@firstfold/cms";
import { serverEnv } from "./lib/server/env";

export default buildFirstfoldPayloadConfig({
  databaseUrl: serverEnv().DATABASE_URL_PAYLOAD,
  secret: serverEnv().PAYLOAD_SECRET,
});
```

Add `"@firstfold/cms": "workspace:*"` to `apps/platform/package.json` and `"@firstfold/cms"` to `transpilePackages` in `next.config.ts`.

- [ ] **Step 6: Checkpoint**

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Then start the dev server and confirm the customer app's `/content`, `/content/blog` and gallery actions still work — these are the only place `apps/platform` calls Payload's Local API now. Use the same live-walkthrough approach as this session's Task 8 CMS verification (real fields, real gallery upload, real blog publish) — a build passing doesn't confirm Payload's Local API still resolves collections correctly at runtime.

- [ ] **Step 7: Publish**

```bash
cd packages/cms && pnpm publish --no-git-checks && cd -
```

---

### Task 5: Bootstrap the `firstfold-admin` repository

**Files (all in the new repo, not `first-found`):**
- Create: `firstfold-admin/package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.mts`, `.env.example`, `.gitignore`, `.npmrc`, `README.md`

- [ ] **Step 1: Clone the empty repo and scaffold**

```bash
cd /Users/siddiqueahmed/Desktop/AI/first-found
git clone https://github.com/56steve/firstfold-admin.git
cd firstfold-admin
mkdir -p app components lib/server lib/billing lib/onboarding
```

- [ ] **Step 2: `.gitignore` and `.npmrc`**

```bash
cat > .gitignore <<'EOF'
node_modules
.next
.env.local
*.local
.DS_Store
EOF

cat > .npmrc <<'EOF'
@firstfold:registry=https://npm.pkg.github.com
EOF
```

The actual token still comes from `~/.npmrc` (Task 2, Step 1) — same machine, same home directory, so it's already set up. On any other machine (CI, another developer), that step needs repeating there; note this in the repo's own README (Step 8).

- [ ] **Step 3: `package.json`**

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
    "@payloadcms/db-postgres": "^3.89.0",
    "@payloadcms/next": "^3.89.0",
    "@firstfold/auth": "^0.1.0",
    "@firstfold/billing": "^0.1.0",
    "@firstfold/cms": "^0.1.0",
    "@firstfold/dashboard": "^0.1.0",
    "@firstfold/db": "^0.1.0",
    "@firstfold/email": "^0.1.0",
    "@firstfold/shared": "^0.1.0",
    "libphonenumber-js": "1.13.13",
    "next": "16.3.5",
    "payload": "^3.89.0",
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

Match every version to `first-found/apps/platform/package.json`'s current values at execution time — a mismatched `next`/`react`/`payload` version between the two apps is exactly the kind of drift this plan otherwise avoids.

- [ ] **Step 4: Copy the platform's remaining configs**

```bash
FF=/Users/siddiqueahmed/Desktop/AI/first-found/first-found
for f in tsconfig.json eslint.config.mjs postcss.config.mjs; do cp "$FF/apps/platform/$f" ./$f; done
cp "$FF/apps/platform/vitest.config.mts" ./vitest.config.mts 2>/dev/null || true
cp "$FF/apps/platform/app/icon.tsx" "$FF/apps/platform/app/apple-icon.tsx" ./app/
```

Open `tsconfig.json` and remove any `paths` entries that pointed at other workspace packages by relative path (e.g. `"@firstfold/*": ["../../packages/*/src"]`) — this repo has no such packages; `@firstfold/*` now resolves through `node_modules` like any installed dependency.

- [ ] **Step 5: Install**

```bash
pnpm install
```

Expected: pnpm resolves `@firstfold/*` from `npm.pkg.github.com` (confirm with `pnpm why @firstfold/db` — it should show a registry-resolved version, not a `link:` to a local path).

- [ ] **Step 6: `.env.example`**

```
# Same firstfold Postgres database the customer app uses.
DATABASE_URL=
DATABASE_URL_STAFF=
# Payload's own separate database.
DATABASE_URL_PAYLOAD=
PAYLOAD_SECRET=
# Signs this app's own session cookie. Use a DIFFERENT value from the customer app's BETTER_AUTH_SECRET.
BETTER_AUTH_SECRET=
# This app's own origin. Locally: http://admin.localhost:3002
ADMIN_ORIGIN=
# The customer app, for setup links in invite emails.
APP_ORIGIN=
NEXT_PUBLIC_SITE_URL=
```

- [ ] **Step 7: `.env.local`, filled with real local values**

```bash
FF=/Users/siddiqueahmed/Desktop/AI/first-found/first-found
grep -E '^(DATABASE_URL|DATABASE_URL_STAFF|DATABASE_URL_PAYLOAD|PAYLOAD_SECRET|NEXT_PUBLIC_SITE_URL)=' "$FF/apps/platform/.env.local" >> .env.local
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 48)" >> .env.local
echo "ADMIN_ORIGIN=http://admin.localhost:3002" >> .env.local
echo "APP_ORIGIN=http://app.localhost:3001" >> .env.local
```

Never print `.env.local`'s contents to chat or a screenshot.

- [ ] **Step 8: `README.md`**

```markdown
# Firstfold Admin

The staff console for Firstfold. Runs against the same Postgres database as `first-found`'s customer app (`apps/platform`), sharing schema/auth/billing code through published `@firstfold/*` packages instead of a workspace — see `first-found`'s `docs/superpowers/plans/2026-09-18-admin-separate-repo-split.md` for why.

## Local setup

1. `.npmrc` already points `@firstfold/*` at GitHub Packages. You need a personal access token with `read:packages` (and `repo`, since `first-found` is private) in `~/.npmrc`:
   ```
   //npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
   ```
2. Copy `.env.example` to `.env.local` and fill it in — same `DATABASE_URL`/`DATABASE_URL_STAFF`/`DATABASE_URL_PAYLOAD`/`PAYLOAD_SECRET` as `first-found`'s `apps/platform/.env.local`, plus a fresh `BETTER_AUTH_SECRET` (different from the customer app's).
3. `pnpm install && pnpm dev` — runs on `admin.localhost:3002`.

## Bumping a shared package

When `first-found` publishes a new `@firstfold/*` version, run `pnpm update @firstfold/<name>` here and re-test.
```

- [ ] **Step 9: First commit**

```bash
git add -A
git commit -m "Scaffold firstfold-admin, depending on published @firstfold/* packages"
```

(This repo has no prior history and no standing "don't commit" instruction the way `first-found` does — the user's "no commits unless asked" memory is specifically about the Firstfold *repos already in progress*; confirm with the user before this first push all the same, since it's a new repo's first commit, not a routine one.)

---

### Task 6: Move the admin-only screens, components and lib into `firstfold-admin`

**Files:** everything under `first-found/apps/platform/app/admin-host/**` and the admin-only components/lib listed in the table below, moved from `first-found` into `firstfold-admin`. Because this crosses repos, `git mv` can't preserve history — use `cp` in `first-found` (removing the originals in Task 9) so history stays in `first-found` until Task 9 actually deletes them there.

**What moves where** (same analysis as the halted plan's Task 1 dependency scan — re-run it, since files may have changed since 2026-09-18):

```bash
cd /Users/siddiqueahmed/Desktop/AI/first-found/first-found/apps/platform
grep -rhoE 'from "@/[^"]+"' app/admin-host components/panel/admin-shell.tsx | sort -u | sed -E 's/from "@\/(.*)"/\1/' > /tmp/admin-deps.txt
while read -r m; do
  users=$(grep -rlE "@/${m}\"" app components lib proxy.ts | grep -v admin-host | grep -v '\.test\.ts' | tr '\n' ' ')
  echo "$m <- ${users:-ADMIN-ONLY}"
done < /tmp/admin-deps.txt
```

Anything reported `ADMIN-ONLY` copies straight into `firstfold-admin`. Anything with other users but not already covered by `@firstfold/dashboard` (Task 3) or `@firstfold/cms` (Task 4) is a small module both apps need — copy it into `firstfold-admin` too and accept the duplication (same "copy, don't move, for small pure modules" call the halted plan made for `currency`, `lead-status`, `billing/terms`, `billing/manual-payment-form`, `billing/client-payment`, the `onboarding/*` field helpers). If the scan turns up something that isn't in that list, stop and reconcile before continuing — don't guess.

- [ ] **Step 1: Copy the routes**

```bash
FF=/Users/siddiqueahmed/Desktop/AI/first-found/first-found/apps/platform
AD=/Users/siddiqueahmed/Desktop/AI/first-found/firstfold-admin
cp -r "$FF/app/admin-host/(protected)" "$AD/app/(protected)"
cp -r "$FF/app/admin-host/login" "$AD/app/login"
cp -r "$FF/app/admin-host/media" "$AD/app/media"
cp -r "$FF/app/admin-host/[...missing]" "$AD/app/[...missing]"
cp "$FF/app/admin-host/error.tsx" "$AD/app/error.tsx"
cp "$FF/app/admin-host/not-found.tsx" "$AD/app/not-found.tsx"
cp "$FF/app/admin-host/layout.tsx" "$AD/app/layout.tsx"
cp -r "$FF/app/admin-host/clients/[businessId]/content" "$AD/app/(protected)/clients/[businessId]/content" 2>/dev/null || true
cp -r "$FF/app/admin-host/content-media" "$AD/app/content-media" 2>/dev/null || true
```

(The last two lines cover this session's Payload CMS content-editor routes — `app/admin-host/clients/[businessId]/content` and `app/admin-host/content-media/[mediaId]`. Confirm their exact current paths with `ls "$FF/app/admin-host"` before running these — the CMS migration may have placed them slightly differently than guessed here.)

In `firstfold-admin/app/media/[mediaId]/route.ts`, change `RouteContext<"/admin-host/media/[mediaId]">` to `RouteContext<"/media/[mediaId]">`. Do the same fix for any other `RouteContext<"/admin-host/...">` type reference the copied route files use (grep for `admin-host` inside `firstfold-admin/app` and fix every hit).

- [ ] **Step 2: Copy admin-only components and lib**

```bash
FF=/Users/siddiqueahmed/Desktop/AI/first-found/first-found/apps/platform
AD=/Users/siddiqueahmed/Desktop/AI/first-found/firstfold-admin
for c in admin-shell stat-card project-status-badge payments-needing-attention received-date-input new-lead-form lead-status-badge client-payment-summary admin-page-editor admin-image-field-form; do
  [ -f "$FF/components/panel/$c.tsx" ] && cp "$FF/components/panel/$c.tsx" "$AD/components/$c.tsx"
done
for m in waiting-clients billing/attention billing/manual-payment-notices; do
  cp "$FF/lib/$m.ts" "$AD/lib/$m.ts"
  [ -f "$FF/lib/$m.test.ts" ] && cp "$FF/lib/$m.test.ts" "$AD/lib/$m.test.ts"
done
for m in staff-access lead-updates invites billing-admin admin-content; do
  [ -f "$FF/lib/server/$m.ts" ] && cp "$FF/lib/server/$m.ts" "$AD/lib/server/$m.ts"
  [ -f "$FF/lib/server/$m.test.ts" ] && cp "$FF/lib/server/$m.test.ts" "$AD/lib/server/$m.test.ts"
done
for m in currency lead-status project-status safe-link billing/terms billing/manual-payment-form billing/client-payment onboarding/steps onboarding/hours onboarding/business-fields; do
  cp "$FF/lib/$m.ts" "$AD/lib/$m.ts"
  [ -f "$FF/lib/$m.test.ts" ] && cp "$FF/lib/$m.test.ts" "$AD/lib/$m.test.ts"
done
cp "$FF/lib/server/media-storage.ts" "$FF/lib/server/media-serving.ts" "$AD/lib/server/" 2>/dev/null || true
cd "$AD" && sed -i '' -E 's#"@/components/panel/#"@/components/#g' $(grep -rl '@/components/panel/' . 2>/dev/null || true)
```

- [ ] **Step 3: Fix imports that now point at published packages**

```bash
cd /Users/siddiqueahmed/Desktop/AI/first-found/firstfold-admin
grep -rlE '@/lib/(access|sign-in-form|sign-in-limits)"|@/components/(dashboard-root|dashboard-frame|sidebar-nav|sign-out-button|sign-in-form|auth-screen|panel-not-found|local-date-time)"' app components lib \
  | xargs sed -i '' -E \
    -e 's#"@/lib/(access|sign-in-form|sign-in-limits)"#"@firstfold/dashboard/lib/\1"#g' \
    -e 's#"@/components/(dashboard-root|dashboard-frame|sidebar-nav|sign-out-button|sign-in-form|auth-screen|panel-not-found|local-date-time)"#"@firstfold/dashboard/ui/\1"#g'
```

In `app/components/admin-shell.tsx`: import `signOut` from `@/lib/server/sign-out`, pass `signOutAction={signOut}` to `<DashboardFrame>`.

- [ ] **Step 4: The root layout has no host to check**

`firstfold-admin/app/layout.tsx`:

```tsx
import type { ReactElement, ReactNode } from "react";
import { DashboardRoot } from "@firstfold/dashboard/ui/dashboard-root";
import "./globals.css";

interface AdminLayoutProps {
  readonly children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps): ReactElement {
  return <DashboardRoot>{children}</DashboardRoot>;
}
```

This app serves only the admin console — there's no second host to tell apart, so `requireSurfaceHost`/`isAdminHostRequest` checks that existed in `first-found` don't come along. Every page and action still calls `requireStaffAccess()`, which is the real access check (host was routing, never auth — same lesson this session's Task 5 security fix already established for Payload).

- [ ] **Step 5: `app/globals.css`**

```css
@import "tailwindcss";
@import "@firstfold/shared/styles/theme.css";

@source "../../../node_modules/@firstfold/shared/src";
@source "../../../node_modules/@firstfold/dashboard/src";
```

(The `@source` paths point into `node_modules` here, not a sibling workspace package as they did in `first-found` — Tailwind still needs to scan those files for class names even though they're an installed dependency now.)

- [ ] **Step 6: Checkpoint**

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test
```

Don't run `pnpm build` yet — `next.config.ts` and the env/auth files don't exist until Task 7.

---

### Task 7: `firstfold-admin`'s own env, db, auth, session, sign-in, and Payload config

Same shape as the halted plan's Task 6 Step 5 — copied here with `@firstfold/*` imports resolving to published packages instead of workspace ones.

**Files:**
- Create: `firstfold-admin/lib/server/{env,env.test,db,auth,session,sign-out,sign-in}.ts`
- Create: `firstfold-admin/payload.config.ts`
- Create: `firstfold-admin/next.config.ts`

- [ ] **Step 1: `lib/server/env.test.ts`, written first**

```ts
import { describe, expect, it } from "vitest";

vi.mock("server-only", () => ({}));

const { adminEnvSchema } = await import("./env");

const valid = {
  DATABASE_URL: "postgresql://app@localhost/webfold",
  DATABASE_URL_STAFF: "postgresql://staff@localhost/webfold",
  DATABASE_URL_PAYLOAD: "postgresql://payload@localhost/webfold_payload",
  PAYLOAD_SECRET: "x".repeat(32),
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

  it("requires PAYLOAD_SECRET to be at least 32 characters", () => {
    expect(adminEnvSchema.safeParse({ ...valid, PAYLOAD_SECRET: "short" }).success).toBe(false);
  });

  it("rejects a short auth secret", () => {
    expect(adminEnvSchema.safeParse({ ...valid, BETTER_AUTH_SECRET: "short" }).success).toBe(false);
  });
});
```

Run: `pnpm test -- env`. Expected: FAIL, `env.ts` doesn't exist yet.

- [ ] **Step 2: `lib/server/env.ts`**

```ts
import "server-only";
import { z } from "zod";

const POSTGRES_PROTOCOL = /^postgres(ql)?$/;
const HTTP_PROTOCOL = /^https?$/;

function originUrl(message: string): z.ZodPipe<z.ZodURL, z.ZodTransform<string, string>> {
  return z.url({ protocol: HTTP_PROTOCOL, error: message }).transform((value) => new URL(value).origin);
}

export const adminEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: POSTGRES_PROTOCOL, error: "DATABASE_URL must be a postgresql:// URL" }),
  DATABASE_URL_STAFF: z.url({ protocol: POSTGRES_PROTOCOL, error: "DATABASE_URL_STAFF must be a postgresql:// URL" }),
  DATABASE_URL_PAYLOAD: z.url({ protocol: POSTGRES_PROTOCOL, error: "DATABASE_URL_PAYLOAD must be a postgresql:// URL" }),
  PAYLOAD_SECRET: z.string().min(32, "PAYLOAD_SECRET must be at least 32 characters"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  ADMIN_ORIGIN: originUrl("ADMIN_ORIGIN must be an absolute http:// or https:// URL"),
  APP_ORIGIN: originUrl("APP_ORIGIN must be an absolute http:// or https:// URL"),
});

export type AdminEnv = z.output<typeof adminEnvSchema>;

let cached: AdminEnv | undefined;

/** Parsed on first use, so a build does not need these secrets. */
export function serverEnv(): AdminEnv {
  if (cached === undefined) {
    const parsed = adminEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid admin configuration. Check firstfold-admin/.env.local.\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
```

Run: `pnpm test -- env`. Expected: PASS.

- [ ] **Step 3: `lib/server/db.ts`**

Copy `first-found/apps/platform/lib/server/db.ts` as a starting point. Rename its `globalThis` cache keys to `firstfoldAdminAppDb`/`firstfoldAdminStaffDb` (distinct from the platform's own keys, in case both ever run in the same process during local dev — they won't in production, but Next's dev server can share a process across hot reloads). Replace its doc comment with: "This app's own connections. `getStaffDb()` is the one almost everything here should use; `getAppDb()` exists only for better-auth, whose tables use the app role."

- [ ] **Step 4: `lib/server/auth.ts`**

```ts
import "server-only";
import { createAuth, type Auth } from "@firstfold/auth";
import { getAppDb } from "./db";
import { serverEnv } from "./env";

let auth: Auth | undefined;

/** This app's own auth: its cookie is set for, and only trusted from, the admin origin. */
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

- [ ] **Step 5: `lib/server/session.ts`, `sign-out.ts`, `sign-in.ts`**

Copy `first-found/apps/platform/lib/server/session.ts` and `sign-out.ts` unchanged in logic (they import `./auth`, which already resolves correctly here). In `session.ts`, change its `SessionUser` type import to `@firstfold/dashboard/lib/access`.

`sign-in.ts`:

```ts
import "server-only";
import { signInWithPassword as signIn, type SignInOutcome } from "@firstfold/dashboard/server/sign-in";
import { getAuth } from "./auth";
import { getAppDb } from "./db";

export type { SignInOutcome };

/** Signs in on the staff console, using its own auth instance and connection. */
export function signInWithPassword(formData: FormData): Promise<SignInOutcome> {
  return signIn(formData, { auth: getAuth(), db: getAppDb() });
}
```

- [ ] **Step 6: `payload.config.ts`**

```ts
import { buildFirstfoldPayloadConfig } from "@firstfold/cms";
import { serverEnv } from "./lib/server/env";

export default buildFirstfoldPayloadConfig({
  databaseUrl: serverEnv().DATABASE_URL_PAYLOAD,
  secret: serverEnv().PAYLOAD_SECRET,
});
```

Any file under `app/(protected)/clients/[businessId]/content` or `app/content-media` (copied in Task 6 Step 1) that imports Payload's Local API config from `@/payload.config` keeps working unchanged — the path didn't move.

- [ ] **Step 7: `next.config.ts`**

```ts
import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import { securityHeaders } from "@firstfold/shared/lib/security-headers";

const REQUIRED_FOR_PRODUCTION = [
  "NEXT_PUBLIC_SITE_URL",
  "ADMIN_ORIGIN",
  "APP_ORIGIN",
  "DATABASE_URL",
  "DATABASE_URL_STAFF",
  "DATABASE_URL_PAYLOAD",
  "PAYLOAD_SECRET",
  "BETTER_AUTH_SECRET",
] as const;

function assertProductionEnvironment(): void {
  if (process.env.VERCEL_ENV !== "production") return;
  const missing = REQUIRED_FOR_PRODUCTION.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Production deployment is missing required environment variables: ${missing.join(", ")}. See .env.example.`);
  }
}

assertProductionEnvironment();

const servedOverHttps = process.env.VERCEL === "1" || (process.env.ADMIN_ORIGIN?.trim().startsWith("https://") ?? false);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders({ development: process.env.NODE_ENV === "development", https: servedOverHttps, framedOrigins: [] }),
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon", permanent: true }];
  },
  transpilePackages: ["@firstfold/auth", "@firstfold/billing", "@firstfold/cms", "@firstfold/dashboard", "@firstfold/db", "@firstfold/email", "@firstfold/shared"],
};

export default withPayload(nextConfig);
```

Check `securityHeaders`'s actual return shape (`@firstfold/shared`'s `src/lib/security-headers.ts`, now resolved from `node_modules`) before trusting the spread above — same caveat the halted plan flagged.

- [ ] **Step 8: Checkpoint**

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all pass. The moved admin tests (`billing-admin.test.ts`, `lead-updates.test.ts`, `waiting-clients.test.ts`, `manual-payment-*.test.ts`, `admin-content.test.ts` if it exists) run and pass here, and no longer run in `first-found` once Task 9 removes them there.

---

### Task 8: See it working, live

- [ ] **Step 1: Start both apps**

In `first-found`: `preview_start` with the `firstfold-platform-dev` config (customer app, port 3001).
In `firstfold-admin`: add a `.claude/launch.json` there too (`runtimeExecutable: "pnpm"`, `runtimeArgs: ["dev"]`, `port: 3002`, `url: "http://admin.localhost:3002"`), then `preview_start` it.

- [ ] **Step 2: Walk through it exactly like this session's Payload CMS Task 8 walkthrough**

Sign in with a real staff account. Open Overview, Leads, Clients, a client's page, the content editor (add a page/field, save a value), Outbox. On a client with an uploaded image, confirm `/media/{id}` loads. Then, from a customer session on `app.localhost:3001`, confirm a value the admin just set shows on `/content`, and that saving it there reflects back on the admin's screen — the same live loop this session already proved for the Payload migration, now proving it still works with staff living in a different app entirely.

- [ ] **Step 3: Confirm the old host is really gone**

Open `http://admin.localhost:3001` (the platform's own dev server, not the new one) once Task 9 has run. Expected: 404. Screenshot the admin overview and a lead page from the new app as proof it's genuinely serving from `firstfold-admin`, not a leftover route in the platform.

---

### Task 9: Make `first-found` serve only the customer app

This is the halted plan's Task 7, plus deleting Payload's now-fully-unused admin UI route and the collections files that moved to `@firstfold/cms` in Task 4.

**Files:**
- Modify: `apps/platform/lib/surfaces.ts`, `apps/platform/lib/surfaces.test.ts`
- Modify: `apps/platform/proxy.ts`, `apps/platform/proxy.test.ts`
- Modify: `apps/platform/lib/server/env.ts`, `apps/platform/lib/server/auth.ts`, `apps/platform/next.config.ts`, `apps/platform/.env.example`
- Delete: `apps/platform/app/admin-host/**` (now copied into `firstfold-admin`)
- Delete: `apps/platform/app/(payload)/admin/[[...segments]]/page.tsx`, `not-found.tsx`, `importMap.js`, `custom.scss`
- Delete: `apps/platform/lib/server/require-admin-host.ts`
- Delete: the admin-only components/lib copied in Task 6 Step 2 (now duplicated in `firstfold-admin`; `first-found` doesn't need its own copy)

- [ ] **Step 1: Write the failing proxy test**

Add to `apps/platform/proxy.test.ts`:

```ts
it("404s the old admin host now that the staff console is its own repo", () => {
  const handler = createProxy({ app: "http://app.localhost:3001" });
  const response = handler(requestFor("http://admin.localhost:3001/leads"));
  expect(response.status).toBe(404);
});
```

Use the file's existing request-building helper (adapt the name if it's not literally `requestFor`). Remove any test that expects the admin host to rewrite to `/admin-host`. Remove the admin cases in `lib/surfaces.test.ts` too.

Run: `pnpm --filter @firstfold/platform test -- proxy surfaces`. Expected: FAIL.

- [ ] **Step 2: Remove the admin surface and the Payload admin-path carve-out**

In `apps/platform/lib/surfaces.ts`:
- `export type Surface = "app";`
- `SurfaceOrigins` becomes `{ readonly app: string }`.
- `SURFACE_PATH_PREFIX` becomes `{ app: "/app-host" } as const`.
- `resolveSurface` only compares against `origins.app`.
- `readOriginsFromEnv` reads only `APP_ORIGIN`.
- Remove `isPayloadAdminPath` and `PAYLOAD_ADMIN_PATH_PREFIX` — there's no admin UI route left to gate (Step 5 below deletes it).

In `apps/platform/proxy.ts`: remove the `isPayloadAdminPath` branch, update the doc comment to "Routes the customer app's host to its routes. Every other host 404s."

In `apps/platform/lib/server/env.ts`: remove `ADMIN_ORIGIN`. In `lib/server/auth.ts`: `trustedOrigins: [env.APP_ORIGIN]`. In `next.config.ts`: remove `"ADMIN_ORIGIN"` from `REQUIRED_FOR_PRODUCTION`. In `.env.example`: remove `ADMIN_ORIGIN`, update the header comment to say this app serves only the customer app.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @firstfold/platform test -- proxy surfaces`. Expected: PASS.

- [ ] **Step 4: Delete what moved**

```bash
cd apps/platform
git rm -r "app/admin-host"
git rm "app/(payload)/admin/[[...segments]]/page.tsx" "app/(payload)/admin/[[...segments]]/not-found.tsx" "app/(payload)/admin/importMap.js" "app/(payload)/custom.scss" 2>/dev/null || true
git rm "lib/server/require-admin-host.ts"
for c in admin-shell stat-card project-status-badge payments-needing-attention received-date-input new-lead-form lead-status-badge client-payment-summary admin-page-editor admin-image-field-form; do
  git rm "components/panel/$c.tsx" 2>/dev/null || true
done
for m in waiting-clients billing/attention billing/manual-payment-notices; do
  git rm "lib/$m.ts" "lib/$m.test.ts" 2>/dev/null || true
done
for m in staff-access lead-updates invites billing-admin admin-content require-admin-host; do
  git rm "lib/server/$m.ts" "lib/server/$m.test.ts" 2>/dev/null || true
done
```

Then check whether the small "copy, don't move" modules from Task 6 Step 2 (`currency`, `lead-status`, `billing/client-payment`, `billing/manual-payment-form`) still have any importer left in `apps/platform` now that admin-host is gone:

```bash
for m in currency lead-status billing/client-payment billing/manual-payment-form; do
  echo "$m: $(grep -rlE "@/lib/$m\"" app components lib | grep -v "lib/$m\." | wc -l | tr -d ' ') importers"
done
```

Remove any with 0 importers (`git rm lib/$m.ts lib/$m.test.ts`) — they're only needed in `firstfold-admin` now.

- [ ] **Step 5: Nothing left points at the admin**

```bash
grep -rnE 'admin-host|ADMIN_ORIGIN|staff-access|requireStaffAccess|isAdminHostRequest' app components lib proxy.ts next.config.ts .env.example
```

Expected: no output.

- [ ] **Step 6: Full checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all pass. `apps/platform`'s test count drops by roughly the number of admin-only test files that moved to `firstfold-admin` in Task 6.

- [ ] **Step 7: Re-run Task 8's live walkthrough once more**

Confirm `admin.localhost:3001` (the platform, now with no admin route) 404s, and `admin.localhost:3002` (`firstfold-admin`) is the one that actually works.

---

### Task 10: Vercel

Done by the user in the Vercel dashboard — this repo split makes it simpler than the halted monorepo plan's Task 10 (no "Ignored Build Step" tricks needed; it's genuinely two separate repos now).

- [ ] **Step 1: New Vercel project for `firstfold-admin`.** Import the `56steve/firstfold-admin` repo directly (not `first-found`). Framework: Next.js, root directory: repo root (not a subfolder). Environment variables, Production and Preview:
  - `DATABASE_URL`, `DATABASE_URL_STAFF`, `DATABASE_URL_PAYLOAD`: same database as the platform (see this repo's own outstanding "Production deployment checklist" in `docs/superpowers/plans/2026-09-17-payload-cms-migration.md` for what `DATABASE_URL_PAYLOAD` needs).
  - `PAYLOAD_SECRET`: can be the same value as the platform's, since nothing authenticates against it directly — but keep them in sync if you ever rotate one.
  - `BETTER_AUTH_SECRET`: a **new** value, different from the platform's.
  - `ADMIN_ORIGIN`, `APP_ORIGIN`, `NEXT_PUBLIC_SITE_URL`: the real domains.
- [ ] **Step 2: NPM auth for Vercel's build.** Vercel needs to install `@firstfold/*` from GitHub Packages too. Add an `NPM_TOKEN` (or reuse `GITHUB_PACKAGES_TOKEN`) environment variable in the `firstfold-admin` Vercel project, and either commit a build-time `.npmrc` that reads `${NPM_TOKEN}` (safe — no literal secret in the repo) or use Vercel's "Install Command" override to write one before `pnpm install`. The repo's committed `.npmrc` from Task 5 Step 2 already has the registry mapping; it just needs the token available as an env var at build time.
- [ ] **Step 3: Lock it down.** Turn on Vercel Deployment Protection for all deployments if the plan allows it; otherwise Vercel Authentication for previews, relying on staff login for production. Attach only the admin domain to this project.
- [ ] **Step 4: `first-found`'s existing Vercel project.** Remove `ADMIN_ORIGIN` from its environment variables and detach the admin domain from it, now that `apps/platform` no longer serves it.

---

## Out of scope (tell the user; don't build here)

- **Media storage must become a shared bucket before production** — unchanged from the Payload plan's own outstanding item; now doubly true, since `firstfold-admin` and `apps/platform` are separate deployments and can't share a local disk even in principle. Solve it once, in `@firstfold/cms` or a new shared storage module, not per-app.
- **A CI/automated publish pipeline for the `@firstfold/*` packages.** This plan documents manual `pnpm publish` steps because the team is one person. If that changes, a GitHub Actions workflow triggered on a version bump is the natural next step — not built here.
- **Removing the small per-app-copied modules** (`currency`, `lead-status`, `billing/client-payment`, etc.). If either copy starts to diverge, promote it into `@firstfold/shared` or `@firstfold/dashboard` instead of letting two copies drift.

## Self-review

- Every module the halted monorepo plan identified as shared or admin-only is accounted for here too, just retargeted: shared UI/sign-in → Task 3 (`@firstfold/dashboard`, published); Payload collections/config → Task 4 (`@firstfold/cms`, new, not in the halted plan since Payload hadn't landed when it was written); admin-only screens/components/lib → Task 6; per-app small copies → Task 6's "what moves where" scan; platform cleanup → Task 9; deploy → Task 10.
- Names used consistently across tasks: `signInWithPassword(formData, { auth, db })` and `SignInDependencies` (Task 3, reused in Task 7); `signOutAction` on `DashboardFrame` / `action` on `SignOutButton` (Task 3, used in Task 6); `adminEnvSchema`/`serverEnv()` (Task 7); `buildFirstfoldPayloadConfig({ databaseUrl, secret })` (Task 4, reused identically in Task 7 and in `apps/platform`'s own `payload.config.ts`).
- The GitHub Packages `repository`-field trick (Task 1) was verified against GitHub's own docs before being written into this plan, not assumed — see the "Why this shape" section.
- Task 4 (`@firstfold/cms`) explicitly tells the executor to read the real, current `apps/platform/payload.config.ts` before writing the extraction, rather than trusting this plan's best-guess reconstruction of it.
