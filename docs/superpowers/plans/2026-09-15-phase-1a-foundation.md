# Phase 1A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the marketing-site repo into a pnpm workspace with a local Postgres database, row-level security, invite-only auth, host-based routing, and working sign-in screens for Fynix staff (`admin.localhost:3000`) and customers (`app.localhost:3000`). The marketing site at `localhost:3000` must keep working unchanged.

**Architecture:**
- The existing Next.js 16 app moves to `apps/web`. Two workspace packages hold shared server code:
  - `@brandbasket/db`: Drizzle schema, migrations, role setup, scoped transactions, rate limiting.
  - `@brandbasket/auth`: a Better Auth factory plus an invite-only account-creation gate.
- `apps/web/proxy.ts` maps each hostname to a route prefix (`/app-host`, `/admin-host`) and 404s direct access to those prefixes on the marketing host.
- The app connects as `fynix_app`, which is subject to row-level security. Staff and system work connects as `fynix_staff`. Migrations run as the local superuser.

**Tech Stack:** Next.js 16.3.5, React 19.2, TypeScript 5, Tailwind 4, zod 4, pnpm 10.30 workspaces, PostgreSQL 14, drizzle-orm 0.45.2, drizzle-kit 0.31.10, pg 8.23, better-auth 1.7.5, uuidv7 1.2.1, Vitest 5, tsx 4.23, dotenv 17.4.

**Spec:** `docs/superpowers/specs/2026-09-15-fynix-platform-design.md` (§2 architecture, §4.1 identity tables, §7 auth, §13 local development).

**Not in this plan:**
- **1B:** leads, invites, email outbox, marketing copy changes.
- **1C:** plans, billing, webhooks, worker, refunds.

---

## Ground rules for the engineer

- **Do not commit.** The user is keeping all work uncommitted for now. Every "Checkpoint" step means: run the listed checks, confirm they pass, and move on.
- **This is Next.js 16.** Before touching Next.js APIs, read the matching guide in `apps/web/node_modules/next/dist/docs/`. Middleware is now `proxy.ts`.
- **Local only.** Nothing talks to external services. The database is the local Postgres on `localhost:5432`; your macOS user is a superuser with no password.
- **Browsers:** use Chrome or Firefox for manual checks. They resolve `*.localhost` to 127.0.0.1; Safari may not.
- **All commands run from the repository root** `/Users/siddiqueahmed/projects/fynix-platform` unless a step says otherwise.

## File map

```
(root)
  package.json                      workspace scripts
  pnpm-workspace.yaml               workspace globs
  tsconfig.base.json                strict compiler options for packages
  .gitignore                        nested node_modules/.next
  README.md                         updated local-development guide
apps/web/                           (existing marketing app, moved)
  package.json                      @brandbasket/web
  next.config.ts                    + transpilePackages, allowedDevOrigins
  proxy.ts                          host → surface rewrite
  .env.example                      documents every variable
  app/layout.tsx                    html/body/fonts only
  app/not-found.tsx                 wrapped in MarketingChrome
  app/(marketing)/layout.tsx        marketing chrome for marketing pages
  app/(marketing)/…                 existing pages, moved unchanged
  app/admin-host/…                  staff login, overview, 404
  app/app-host/…                    customer login, home, 404
  components/marketing-chrome.tsx   header/footer/skip link/smooth scroll
  components/panel/*.tsx            shared dashboard UI
  lib/surfaces.ts (+test)           host and path decisions (pure)
  lib/client-ip.ts (+test)          client address for rate limiting (pure)
  lib/sign-in-form.ts (+test)       sign-in validation (pure)
  lib/access.ts (+test)             access decisions (pure)
  lib/names.ts (+test)              first-name helper (pure)
  lib/server/*.ts                   env, db, auth singletons, guards, actions
packages/db/
  package.json, tsconfig.json, vitest.config.ts, vitest.integration.config.ts, drizzle.config.ts
  migrations/0000_init.sql          generated
  migrations/0001_rls_and_grants.sql
  scripts/init-local-env.ts         writes apps/web/.env.local
  scripts/setup-roles.ts            creates fynix_app / fynix_staff
  scripts/migrate.ts                applies migrations (dev or test)
  src/local-env.ts (+test)          finds the workspace root, loads .env.local
  src/local-env-template.ts (+test) builds the .env.local contents (pure)
  src/roles.ts                      role names and password variables
  src/client.ts                     pg Pool + Drizzle
  src/schema/*.ts                   tables
  src/scope.ts                      user and tenant scoped transactions
  src/queries/memberships.ts        customer memberships
  src/queries/staff.ts              staff lookups and counts
  src/rate-limit.ts (+tests)        Postgres fixed-window limiter
  src/testing/index.ts              test database handles, reset, error capture
  src/rls.integration.test.ts
  src/index.ts
packages/auth/
  package.json, tsconfig.json, vitest.config.ts, vitest.integration.config.ts
  scripts/prompt-hidden.ts          masked terminal input
  scripts/create-staff.ts           creates or promotes a staff account
  src/account-creation-grant.ts (+test)
  src/create-auth.ts
  src/errors.ts
  src/create-auth.integration.test.ts
  src/index.ts
```

---

### Task 0: Record a green baseline

**Files:** none

- [ ] **Step 1: Run the existing checks before changing anything**

Run:
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
Expected: ESLint reports no errors, `tsc` exits 0, Vitest reports all test files passing, and `next build` finishes with the route table. If anything fails here, stop and report it: the failure predates this plan.

---

### Task 1: Convert the repo to a pnpm workspace

**Files:**
- Move: everything app-related into `apps/web/`
- Create: `package.json` (root), `pnpm-workspace.yaml`
- Modify: `apps/web/package.json` (moved), `.gitignore`
- Delete: `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, `package-lock.json` (all generated; pnpm replaces the lockfile)

- [ ] **Step 1: Remove generated npm artifacts**

Run:
```bash
ls -d node_modules .next tsconfig.tsbuildinfo package-lock.json
rm -rf node_modules .next tsconfig.tsbuildinfo package-lock.json
```
Expected: `ls` lists the four generated paths, then `rm` removes them.

- [ ] **Step 2: Move the app into `apps/web`**

Run:
```bash
mkdir -p apps/web
mv app components content lib public next.config.ts next-env.d.ts eslint.config.mjs postcss.config.mjs tsconfig.json vitest.config.mts package.json AGENTS.md CLAUDE.md .env.example apps/web/
ls
```
Expected: the root now contains only `README.md`, `apps`, `docs` and `.gitignore` (plus hidden `.git`).

- [ ] **Step 3: Rename the app package**

Replace `apps/web/package.json` with:
```json
{
  "name": "@brandbasket/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "lenis": "^1.3.26",
    "next": "16.3.5",
    "react": "19.2.8",
    "react-dom": "19.2.8",
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

- [ ] **Step 4: Create the workspace root**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `package.json`:
```json
{
  "name": "fynix",
  "private": true,
  "packageManager": "pnpm@10.30.3",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "pnpm --filter @brandbasket/web dev",
    "build": "pnpm --filter @brandbasket/web build",
    "lint": "pnpm --filter @brandbasket/web lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  }
}
```

- [ ] **Step 5: Make `.gitignore` match nested workspaces**

In `.gitignore`, replace these lines:
```
/node_modules
```
```
/coverage
```
```
/.next/
/out/
```
```
/build
```
with, respectively:
```
node_modules/
```
```
coverage/
```
```
.next/
out/
```
```
build/
```

- [ ] **Step 6: Install**

Run:
```bash
pnpm install
```
Expected: `pnpm-lock.yaml` is created and dependencies install. pnpm 10 may print "Ignored build scripts" for packages such as `unrs-resolver`. That is harmless unless a later check fails with a missing native binary; in that case run `pnpm approve-builds`, approve the listed package and re-run `pnpm install`.

- [ ] **Step 7: Checkpoint: the moved app still passes everything**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: the same results as Task 0.

---

### Task 2: Give marketing pages their own layout

The root layout currently wraps every route in the marketing header, footer and smooth scrolling. Dashboard routes must not get that chrome, so it moves into a `(marketing)` route group. URLs do not change.

**Files:**
- Create: `apps/web/components/marketing-chrome.tsx`, `apps/web/app/(marketing)/layout.tsx`
- Move: `apps/web/app/page.tsx`, `about/`, `case-studies/`, `contact/`, `pricing/`, `services/` into `apps/web/app/(marketing)/`
- Modify: `apps/web/app/layout.tsx`, `apps/web/app/not-found.tsx`

- [ ] **Step 1: Move the marketing routes**

Run:
```bash
mkdir -p "apps/web/app/(marketing)" && mv apps/web/app/page.tsx apps/web/app/about apps/web/app/case-studies apps/web/app/contact apps/web/app/pricing apps/web/app/services "apps/web/app/(marketing)/" && ls apps/web/app "apps/web/app/(marketing)"
```
Expected: `app` lists `(marketing)`, `apple-icon.tsx`, `globals.css`, `icon.tsx`, `layout.tsx`, `not-found.tsx`, `robots.ts`, `sitemap.ts`; `(marketing)` lists `about`, `case-studies`, `contact`, `page.tsx`, `pricing`, `services`.

- [ ] **Step 2: Create the shared marketing chrome**

Create `apps/web/components/marketing-chrome.tsx`:
```tsx
import type { ReactElement, ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SmoothScroll } from "@/components/smooth-scroll";

const MAIN_CONTENT_ID = "main";

interface MarketingChromeProps {
  readonly children: ReactNode;
}

/** Header, footer, skip link and smooth scrolling shared by every marketing page, including the 404 page. */
export function MarketingChrome({ children }: MarketingChromeProps): ReactElement {
  return (
    <SmoothScroll>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>
      <div className="relative flex flex-1 flex-col">
        <SiteHeader />
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1">
          {children}
        </main>
      </div>
      <SiteFooter />
    </SmoothScroll>
  );
}
```

- [ ] **Step 3: Create the marketing group layout**

Create `apps/web/app/(marketing)/layout.tsx`:
```tsx
import type { ReactElement, ReactNode } from "react";
import { MarketingChrome } from "@/components/marketing-chrome";

interface MarketingLayoutProps {
  readonly children: ReactNode;
}

export default function MarketingLayout({ children }: MarketingLayoutProps): ReactElement {
  return <MarketingChrome>{children}</MarketingChrome>;
}
```

- [ ] **Step 4: Reduce the root layout to the document shell**

Replace `apps/web/app/layout.tsx` with:
```tsx
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Newsreader, Outfit } from "next/font/google";
import type { ReactElement } from "react";
import { siteConfig } from "@/lib/site-config";
import "lenis/dist/lenis.css";
import "./globals.css";

/** Headlines, in upright and italic. */
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

/** Body text, forms, buttons and labels. */
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

/** Brand wordmark only. */
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Fynix · Websites for local businesses",
    template: "%s · Fynix",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
  },
};

export const viewport: Viewport = {
  themeColor: "#f6efe6",
};

/** Document shell only. Marketing chrome lives in app/(marketing)/layout.tsx; dashboards bring their own. */
export default function RootLayout({ children }: LayoutProps<"/">): ReactElement {
  return (
    <html lang="en" className={`${newsreader.variable} ${hankenGrotesk.variable} ${outfit.variable}`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Keep marketing chrome on the global 404 page**

Replace `apps/web/app/not-found.tsx` with:
```tsx
import type { ReactElement } from "react";
import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { HeroFrame } from "@/components/hero-frame";
import { MarketingChrome } from "@/components/marketing-chrome";
import { SectionWave } from "@/components/section-wave";

export default function NotFound(): ReactElement {
  return (
    <MarketingChrome>
      <HeroFrame seed={404} align="center" className="min-h-[36rem] sm:min-h-[42rem]">
        <Container className="flex flex-col items-center pb-20 pt-36">
          <h1 className="heading-display max-w-4xl text-[clamp(2.5rem,7vw,6rem)] [&_em]:text-highlight-soft">
            This lane doesn’t lead{" "}
            <em>anywhere.</em>
          </h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-paper/75">
            We couldn’t find that page. It may have moved, or the link might have a typo.
          </p>
          <ButtonLink href="/" variant="light" className="mt-10">
            Back to the home page
          </ButtonLink>
        </Container>
      </HeroFrame>
      {/* The footer is dark, so the page ends with a dark wave rising into it. */}
      <div className="relative h-24 sm:h-32">
        <SectionWave edge="bottom" className="text-dark-surface" />
      </div>
    </MarketingChrome>
  );
}
```

- [ ] **Step 6: Checkpoint**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: all pass. The build route table still lists `/`, `/about`, `/case-studies`, `/case-studies/[slug]`, `/contact`, `/pricing`, `/services`, `/robots.txt`, `/sitemap.xml`.

---

### Task 3: Create `@brandbasket/db` with local environment tooling

**Files:**
- Create: `tsconfig.base.json`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/vitest.config.ts`, `packages/db/vitest.integration.config.ts`
- Create: `packages/db/src/local-env.ts`, `packages/db/src/local-env.test.ts`
- Create: `packages/db/src/local-env-template.ts`, `packages/db/src/local-env-template.test.ts`
- Create: `packages/db/scripts/init-local-env.ts`
- Modify: `package.json` (root), `apps/web/.env.example`

- [ ] **Step 1: Shared strict compiler options for packages**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 2: Package manifest and configs**

Create `packages/db/package.json`:
```json
{
  "name": "@brandbasket/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./local-env": "./src/local-env.ts",
    "./testing": "./src/testing/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "env:init": "tsx scripts/init-local-env.ts",
    "db:roles": "tsx scripts/setup-roles.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts --target=dev",
    "db:migrate:test": "tsx scripts/migrate.ts --target=test"
  },
  "dependencies": {
    "dotenv": "17.4.2",
    "drizzle-orm": "0.45.2",
    "pg": "8.23.0",
    "uuidv7": "1.2.1"
  },
  "devDependencies": {
    "@types/node": "^24.13.4",
    "@types/pg": "8.23.1",
    "drizzle-kit": "0.31.10",
    "tsx": "4.23.13",
    "typescript": "^5",
    "vitest": "^5.0.0"
  }
}
```

Create `packages/db/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "scripts", "drizzle.config.ts", "vitest.config.ts", "vitest.integration.config.ts"]
}
```

Create `packages/db/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
  },
});
```

Create `packages/db/vitest.integration.config.ts`:
```ts
import { defineConfig } from "vitest/config";

/** Integration tests share one test database, so files run one at a time. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

- [ ] **Step 3: Write the failing tests for the env loader**

Create `packages/db/src/local-env.test.ts`:
```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findWorkspaceRoot, requireEnv } from "./local-env";

describe("findWorkspaceRoot", () => {
  it("walks up to the directory that contains pnpm-workspace.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "fynix-root-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    const nested = join(root, "packages", "db", "src");
    mkdirSync(nested, { recursive: true });

    expect(findWorkspaceRoot(nested)).toBe(root);
  });

  it("throws a helpful error outside a workspace", () => {
    const outside = mkdtempSync(join(tmpdir(), "fynix-outside-"));

    expect(() => findWorkspaceRoot(outside)).toThrow(/Could not find pnpm-workspace\.yaml/);
  });
});

describe("requireEnv", () => {
  const NAME = "FYNIX_TEST_REQUIRE_ENV";

  afterEach(() => {
    delete process.env[NAME];
  });

  it("returns the trimmed value", () => {
    process.env[NAME] = "  value  ";
    expect(requireEnv(NAME)).toBe("value");
  });

  it("throws when the variable is missing or blank", () => {
    expect(() => requireEnv(NAME)).toThrow(`${NAME} is not set`);
    process.env[NAME] = "   ";
    expect(() => requireEnv(NAME)).toThrow(`${NAME} is not set`);
  });
});
```

Create `packages/db/src/local-env-template.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildLocalEnvFile } from "./local-env-template";

const secrets = {
  osUser: "sid ahmed",
  appPassword: "app-pass",
  staffPassword: "staff-pass",
  authSecret: "c2VjcmV0K3dpdGgvc2xhc2g=",
};

function valueOf(file: string, name: string): string | undefined {
  const line = file.split("\n").find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1);
}

describe("buildLocalEnvFile", () => {
  const file = buildLocalEnvFile(secrets);

  it("connects migrations as the local superuser, URL-encoding the OS user name", () => {
    expect(valueOf(file, "DATABASE_URL_OWNER")).toBe("postgresql://sid%20ahmed@localhost:5432/fynix_platform");
    expect(valueOf(file, "DATABASE_URL_OWNER_TEST")).toBe("postgresql://sid%20ahmed@localhost:5432/fynix_platform_test");
  });

  it("connects the runtime as the application roles with their passwords", () => {
    expect(valueOf(file, "DATABASE_URL")).toBe("postgresql://fynix_app:app-pass@localhost:5432/fynix_platform");
    expect(valueOf(file, "DATABASE_URL_STAFF")).toBe("postgresql://fynix_staff:staff-pass@localhost:5432/fynix_platform");
    expect(valueOf(file, "DATABASE_URL_TEST")).toBe("postgresql://fynix_app:app-pass@localhost:5432/fynix_platform_test");
    expect(valueOf(file, "DATABASE_URL_STAFF_TEST")).toBe(
      "postgresql://fynix_staff:staff-pass@localhost:5432/fynix_platform_test",
    );
    expect(valueOf(file, "FYNIX_APP_PASSWORD")).toBe("app-pass");
    expect(valueOf(file, "FYNIX_STAFF_PASSWORD")).toBe("staff-pass");
  });

  it("includes the auth secret and the three local origins", () => {
    expect(valueOf(file, "BETTER_AUTH_SECRET")).toBe(secrets.authSecret);
    expect(valueOf(file, "MARKETING_ORIGIN")).toBe("http://localhost:3000");
    expect(valueOf(file, "APP_ORIGIN")).toBe("http://app.localhost:3000");
    expect(valueOf(file, "ADMIN_ORIGIN")).toBe("http://admin.localhost:3000");
  });
});
```

- [ ] **Step 4: Install the package and run the tests to see them fail**

Run:
```bash
pnpm install && pnpm --filter @brandbasket/db test
```
Expected: FAIL. Vitest reports it cannot resolve `./local-env` and `./local-env-template`.

- [ ] **Step 5: Implement the env loader and template**

Create `packages/db/src/local-env.ts`:
```ts
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";

const WORKSPACE_MARKER = "pnpm-workspace.yaml";

/** Next.js reads this file for apps/web; scripts and tests outside Next.js load the same file. */
export const LOCAL_ENV_RELATIVE_PATH = join("apps", "web", ".env.local");

/** Walks up from `startDir` to the directory that contains pnpm-workspace.yaml. */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = startDir;
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Could not find ${WORKSPACE_MARKER} above ${startDir}. Run this command inside the Fynix repository.`,
      );
    }
    current = parent;
  }
}

/** Loads apps/web/.env.local into process.env. Variables already set in the environment win. */
export function loadLocalEnv(): void {
  const path = join(findWorkspaceRoot(), LOCAL_ENV_RELATIVE_PATH);
  if (!existsSync(path)) {
    throw new Error(`${path} does not exist. Run "pnpm env:init" to create it.`);
  }
  config({ path, quiet: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Add it to ${LOCAL_ENV_RELATIVE_PATH}, or run "pnpm env:init" for a fresh file.`);
  }
  return value;
}
```

Create `packages/db/src/local-env-template.ts`:
```ts
export interface LocalEnvSecrets {
  readonly osUser: string;
  readonly appPassword: string;
  readonly staffPassword: string;
  readonly authSecret: string;
}

const DATABASE_HOST = "localhost:5432";
export const DEV_DATABASE = "fynix_platform";
export const TEST_DATABASE = "fynix_platform_test";

function ownerUrl(osUser: string, database: string): string {
  return `postgresql://${encodeURIComponent(osUser)}@${DATABASE_HOST}/${database}`;
}

function roleUrl(role: string, password: string, database: string): string {
  return `postgresql://${role}:${encodeURIComponent(password)}@${DATABASE_HOST}/${database}`;
}

/** Contents of apps/web/.env.local for local development. */
export function buildLocalEnvFile(secrets: LocalEnvSecrets): string {
  return [
    "# Local development only. Generated by `pnpm env:init`. Never commit this file.",
    "",
    "# Migrations and role setup connect as your local Postgres superuser.",
    `DATABASE_URL_OWNER=${ownerUrl(secrets.osUser, DEV_DATABASE)}`,
    `DATABASE_URL_OWNER_TEST=${ownerUrl(secrets.osUser, TEST_DATABASE)}`,
    "",
    "# Passwords for the application roles created by `pnpm db:roles`.",
    `FYNIX_APP_PASSWORD=${secrets.appPassword}`,
    `FYNIX_STAFF_PASSWORD=${secrets.staffPassword}`,
    "",
    "# Runtime connections. fynix_app is bound by row-level security; fynix_staff does staff and system work.",
    `DATABASE_URL=${roleUrl("fynix_app", secrets.appPassword, DEV_DATABASE)}`,
    `DATABASE_URL_STAFF=${roleUrl("fynix_staff", secrets.staffPassword, DEV_DATABASE)}`,
    `DATABASE_URL_TEST=${roleUrl("fynix_app", secrets.appPassword, TEST_DATABASE)}`,
    `DATABASE_URL_STAFF_TEST=${roleUrl("fynix_staff", secrets.staffPassword, TEST_DATABASE)}`,
    "",
    "# Auth",
    `BETTER_AUTH_SECRET=${secrets.authSecret}`,
    "",
    "# Hosts. Chrome and Firefox resolve *.localhost to this machine.",
    "MARKETING_ORIGIN=http://localhost:3000",
    "APP_ORIGIN=http://app.localhost:3000",
    "ADMIN_ORIGIN=http://admin.localhost:3000",
    "",
  ].join("\n");
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run:
```bash
pnpm --filter @brandbasket/db test
```
Expected: PASS (7 tests).

- [ ] **Step 7: The script that writes `.env.local`**

Create `packages/db/scripts/init-local-env.ts`:
```ts
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { buildLocalEnvFile } from "../src/local-env-template";
import { findWorkspaceRoot, LOCAL_ENV_RELATIVE_PATH } from "../src/local-env";

const path = join(findWorkspaceRoot(), LOCAL_ENV_RELATIVE_PATH);

if (existsSync(path)) {
  console.error(`${path} already exists, so nothing was changed. Remove it first if you want new secrets.`);
  process.exit(1);
}

const contents = buildLocalEnvFile({
  osUser: userInfo().username,
  appPassword: randomBytes(24).toString("hex"),
  staffPassword: randomBytes(24).toString("hex"),
  authSecret: randomBytes(32).toString("base64"),
});

writeFileSync(path, contents, { mode: 0o600 });
console.log(`Wrote ${path}`);
```

- [ ] **Step 8: Root scripts for everything this plan adds**

Replace the root `package.json` with:
```json
{
  "name": "fynix",
  "private": true,
  "packageManager": "pnpm@10.30.3",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "pnpm --filter @brandbasket/web dev",
    "build": "pnpm --filter @brandbasket/web build",
    "lint": "pnpm --filter @brandbasket/web lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:integration": "pnpm db:migrate:test && pnpm -r --workspace-concurrency=1 test:integration",
    "env:init": "pnpm --filter @brandbasket/db env:init",
    "db:roles": "pnpm --filter @brandbasket/db db:roles",
    "db:migrate": "pnpm --filter @brandbasket/db db:migrate",
    "db:migrate:test": "pnpm --filter @brandbasket/db db:migrate:test",
    "staff:create": "pnpm --filter @brandbasket/auth staff:create"
  }
}
```

- [ ] **Step 9: Document every variable**

Replace `apps/web/.env.example` with:
```
# Copy nothing by hand for local development: run `pnpm env:init` to generate .env.local.
# This file lists every variable so production configuration can be checked against it.

# Public URL of the marketing site, used for canonical links, the sitemap and social previews.
# Required in production. Example: https://example.com
NEXT_PUBLIC_SITE_URL=

# WhatsApp number that receives preview requests: digits only, country code
# first, no + or leading zeros (for example 447700900123). Required in production.
NEXT_PUBLIC_WHATSAPP_NUMBER=

# Optional contact email shown on the contact page and in the footer.
NEXT_PUBLIC_CONTACT_EMAIL=

# Migrations and role setup (a Postgres role allowed to create roles and tables).
DATABASE_URL_OWNER=
DATABASE_URL_OWNER_TEST=

# Passwords for the fynix_app and fynix_staff roles.
FYNIX_APP_PASSWORD=
FYNIX_STAFF_PASSWORD=

# Runtime connections: fynix_app (row-level security) and fynix_staff (staff and system work).
DATABASE_URL=
DATABASE_URL_STAFF=
DATABASE_URL_TEST=
DATABASE_URL_STAFF_TEST=

# At least 32 random characters. Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=

# Origins of the three surfaces served by apps/web.
MARKETING_ORIGIN=
APP_ORIGIN=
ADMIN_ORIGIN=
```

- [ ] **Step 10: Generate the local env file**

Run:
```bash
pnpm env:init && grep -c "=" apps/web/.env.local
```
Expected: `Wrote /Users/siddiqueahmed/projects/fynix-platform/apps/web/.env.local`, then a count of `12`.

- [ ] **Step 11: Checkpoint**

Run:
```bash
pnpm --filter @brandbasket/db typecheck && pnpm --filter @brandbasket/db test
```
Expected: `tsc` exits 0; 7 tests pass.

---

### Task 4: Schema and the initial migration

**Files:**
- Create: `packages/db/src/schema/columns.ts`, `auth.ts`, `businesses.ts`, `staff.ts`, `rate-limits.ts`, `index.ts`
- Create: `packages/db/src/client.ts`, `packages/db/drizzle.config.ts`
- Generate: `packages/db/migrations/0000_init.sql`

- [ ] **Step 1: Shared column helpers**

Create `packages/db/src/schema/columns.ts`:
```ts
import { timestamp } from "drizzle-orm/pg-core";

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Set by the database on insert and refreshed by Drizzle on every update made through the ORM. */
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
```

- [ ] **Step 2: Auth tables (field names are the ones Better Auth expects)**

Create `packages/db/src/schema/auth.ts`:
```ts
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns";

/**
 * Better Auth core tables. Property names must match Better Auth's field names; column names are snake_case.
 * The adapter is configured with usePlural, so the model "user" maps to the export `users`.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);
```

- [ ] **Step 3: Businesses (the tenant) and memberships**

Create `packages/db/src/schema/businesses.ts`:
```ts
import { index, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { users } from "./auth";
import { createdAt } from "./columns";

export const businessMemberRole = pgEnum("business_member_role", ["owner", "editor"]);
export type BusinessMemberRole = (typeof businessMemberRole.enumValues)[number];

/** A business is the tenant: the isolation, billing and hosting boundary. */
export const businesses = pgTable("businesses", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const businessMembers = pgTable(
  "business_members",
  {
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: businessMemberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.businessId, table.userId] }),
    index("business_members_user_id_idx").on(table.userId),
  ],
);
```

- [ ] **Step 4: Staff and rate-limit tables**

Create `packages/db/src/schema/staff.ts`:
```ts
import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt } from "./columns";

export const staffRole = pgEnum("staff_role", ["admin", "builder", "support"]);
export type StaffRole = (typeof staffRole.enumValues)[number];

/** Staff access is its own table, so no customer row can be edited into a staff account. */
export const staffMembers = pgTable("staff_members", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  role: staffRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});
```

Create `packages/db/src/schema/rate-limits.ts`:
```ts
import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** Fixed-window counters. One row per key per window; older windows for a key are removed on each hit. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);
```

Create `packages/db/src/schema/index.ts`:
```ts
export * from "./auth";
export * from "./businesses";
export * from "./rate-limits";
export * from "./staff";
```

- [ ] **Step 5: Connection factory**

Create `packages/db/src/client.ts`:
```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { readonly $client: Pool };

export interface DatabaseHandle {
  readonly db: Database;
  /** Ends the pool. Safe to call more than once. */
  readonly close: () => Promise<void>;
}

export interface DatabaseOptions {
  /** Maximum pooled connections. */
  readonly max?: number;
  /**
   * Called when an idle pooled connection fails, for example when Postgres restarts. Without a listener
   * Node would crash the process on the pool's "error" event. Defaults to logging to stderr.
   */
  readonly onIdleConnectionError?: (error: Error) => void;
}

const DEFAULT_POOL_SIZE = 10;
/** Fail fast instead of waiting forever when every pooled connection is busy or the server is down. */
const CONNECTION_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 30_000;

function logIdleConnectionError(error: Error): void {
  console.error("An idle Postgres connection failed; the pool opens a new one when needed.", error);
}

export function createDatabase(connectionString: string, options: DatabaseOptions = {}): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: options.max ?? DEFAULT_POOL_SIZE,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  });
  pool.on("error", options.onIdleConnectionError ?? logIdleConnectionError);
  const db = drizzle({ client: pool, schema });

  let closing: Promise<void> | undefined;
  return {
    db,
    close: () => {
      closing ??= pool.end();
      return closing;
    },
  };
}
```

(Review fix: covered by `packages/db/src/client.test.ts`, which checks that closing twice is safe and that idle-connection errors reach the handler.)

- [ ] **Step 6: drizzle-kit configuration**

Create `packages/db/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
import { loadLocalEnv, requireEnv } from "./src/local-env";

loadLocalEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: requireEnv("DATABASE_URL_OWNER") },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 7: Generate the initial migration**

Run:
```bash
pnpm --filter @brandbasket/db exec drizzle-kit generate --name init && ls packages/db/migrations
```
Expected: drizzle-kit reports 8 tables. `migrations` contains `0000_init.sql` and `meta/`. Open `0000_init.sql` and confirm it has `CREATE TYPE` for `business_member_role` and `staff_role`, and `CREATE TABLE` for `users`, `sessions`, `accounts`, `verifications`, `businesses`, `business_members`, `staff_members` and `rate_limit_buckets`.

- [ ] **Step 8: Checkpoint**

Run:
```bash
pnpm --filter @brandbasket/db typecheck
```
Expected: exits 0.

---

### Task 5: Roles, row-level security, and migrating both databases

**Files:**
- Create: `packages/db/src/roles.ts`, `packages/db/scripts/setup-roles.ts`, `packages/db/scripts/migrate.ts`
- Generate then fill: `packages/db/migrations/0001_rls_and_grants.sql`

- [ ] **Step 1: Role definitions**

Create `packages/db/src/roles.ts`:
```ts
/** Login roles the application uses. Created by `pnpm db:roles`; migrations grant their privileges. */
export const APPLICATION_ROLES = [
  { name: "fynix_app", passwordEnv: "FYNIX_APP_PASSWORD" },
  { name: "fynix_staff", passwordEnv: "FYNIX_STAFF_PASSWORD" },
] as const;
```

- [ ] **Step 2: Role setup script**

Create `packages/db/scripts/setup-roles.ts`:
```ts
import { Client } from "pg";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { APPLICATION_ROLES } from "../src/roles";

/** Least privilege: login only. Row-level security applies because these roles never own tables or bypass RLS. */
const ROLE_ATTRIBUTES = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS";

loadLocalEnv();

// Read every password first, so a missing variable can't leave the roles half set up.
const roles = APPLICATION_ROLES.map((role) => ({ name: role.name, password: requireEnv(role.passwordEnv) }));

const client = new Client({ connectionString: requireEnv("DATABASE_URL_OWNER") });
await client.connect();

try {
  for (const role of roles) {
    const identifier = client.escapeIdentifier(role.name);
    const password = client.escapeLiteral(role.password);
    const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role.name]);

    if (existing.rowCount === 0) {
      await client.query(`CREATE ROLE ${identifier} ${ROLE_ATTRIBUTES} PASSWORD ${password}`);
      console.log(`Created role ${role.name}`);
    } else {
      // Roles are cluster-wide: this resets the password for every local checkout that uses this Postgres server.
      await client.query(`ALTER ROLE ${identifier} ${ROLE_ATTRIBUTES} PASSWORD ${password}`);
      console.log(`Updated role ${role.name}; its password now matches this checkout's .env.local`);
    }
  }
} finally {
  await client.end();
}
```

- [ ] **Step 3: Migration runner**

Create `packages/db/scripts/migrate.ts`:
```ts
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { APPLICATION_ROLES } from "../src/roles";

const TARGET_CONNECTIONS = {
  dev: "DATABASE_URL_OWNER",
  test: "DATABASE_URL_OWNER_TEST",
} as const;

type Target = keyof typeof TARGET_CONNECTIONS;

function isTarget(value: string): value is Target {
  return Object.hasOwn(TARGET_CONNECTIONS, value);
}

const { values } = parseArgs({ options: { target: { type: "string" } } });
const target = values.target;
if (target === undefined || !isTarget(target)) {
  throw new Error(`--target must be "dev" or "test", received ${JSON.stringify(target)}`);
}

loadLocalEnv();

const pool = new Pool({ connectionString: requireEnv(TARGET_CONNECTIONS[target]), max: 1 });
try {
  // Migrations grant privileges to the application roles, so they must exist first.
  const requiredRoles: readonly string[] = APPLICATION_ROLES.map((role) => role.name);
  const found = await pool.query<{ rolname: string }>("SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [
    requiredRoles,
  ]);
  const missingRoles = requiredRoles.filter((name) => !found.rows.some((row) => row.rolname === name));
  if (missingRoles.length > 0) {
    throw new Error(`Missing database roles: ${missingRoles.join(", ")}. Run "pnpm db:roles" before migrating.`);
  }

  await migrate(drizzle({ client: pool }), {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  console.log(`Migrations applied to the ${target} database.`);
} finally {
  await pool.end();
}
```

- [ ] **Step 4: Generate an empty custom migration**

Run:
```bash
pnpm --filter @brandbasket/db exec drizzle-kit generate --custom --name rls_and_grants && ls packages/db/migrations
```
Expected: `0001_rls_and_grants.sql` now exists and contains only a placeholder comment.

- [ ] **Step 5: Write the grants and policies**

Replace the whole content of `packages/db/migrations/0001_rls_and_grants.sql` with:
```sql
-- Roles are created by `pnpm db:roles` before migrations run.
-- fynix_app: customer-facing runtime, bound by row-level security.
-- fynix_staff: staff console and system work; explicit allow-all policies below.

GRANT USAGE ON SCHEMA public TO fynix_app, fynix_staff;
--> statement-breakpoint

-- Request-scoped identity, set with set_config(..., true) inside a transaction (SET LOCAL semantics).
CREATE FUNCTION app_current_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint

CREATE FUNCTION app_current_business_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.business_id', true), '')::uuid $$;
--> statement-breakpoint

-- Auth tables are looked up by email and session token before any identity is known, so they are not tenant-scoped.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications TO fynix_app, fynix_staff;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO fynix_app, fynix_staff;
--> statement-breakpoint

-- Tenant tables: customers read their own rows; only staff and system work may write.
GRANT SELECT ON businesses, business_members TO fynix_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON businesses, business_members, staff_members TO fynix_staff;
--> statement-breakpoint

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY business_members_own_rows ON business_members
  FOR SELECT TO fynix_app
  USING (user_id = app_current_user_id());
--> statement-breakpoint

CREATE POLICY businesses_members_only ON businesses
  FOR SELECT TO fynix_app
  USING (
    EXISTS (
      SELECT 1 FROM business_members m
      WHERE m.business_id = businesses.id AND m.user_id = app_current_user_id()
    )
  );
--> statement-breakpoint

CREATE POLICY businesses_staff_all ON businesses
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY business_members_staff_all ON business_members
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY staff_members_staff_all ON staff_members
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
```

- [ ] **Step 6: Create the test database**

Run:
```bash
psql -h localhost -d postgres -c "CREATE DATABASE fynix_platform_test"
```
Expected: `CREATE DATABASE`. If it reports that the database already exists, check with `psql -h localhost -d fynix_platform_test -c "\dt"` that it has no tables, then continue.

- [ ] **Step 7: Create roles and migrate both databases**

Run:
```bash
pnpm db:roles && pnpm db:migrate && pnpm db:migrate:test
```
Expected: `Created role fynix_app`, `Created role fynix_staff`, `Migrations applied to the dev database.`, `Migrations applied to the test database.`

- [ ] **Step 8: Prove the app role is bound by RLS**

Run:
```bash
set -a && source apps/web/.env.local && set +a && psql "$DATABASE_URL" -Atc "select count(*) from businesses" && psql "$DATABASE_URL" -c "insert into businesses (id, slug, name) values (gen_random_uuid(), 'x', 'x')"
```
Expected: first command prints `0`; second fails with `ERROR:  permission denied for table businesses`.

- [ ] **Step 9: Harden the public schema (added after security review)**

PostgreSQL 14 lets every role create objects in `public`, so an application role could plant a function that owner-run code later executes. Run `pnpm --filter @brandbasket/db exec drizzle-kit generate --custom --name harden_public_schema`, then replace the whole content of `packages/db/migrations/0002_harden_public_schema.sql` with:
```sql
-- Security hardening after review of 0001.
-- PostgreSQL 14 lets every role create objects in the public schema. The application roles must never be able
-- to plant functions or tables that owner-run migrations, scripts or developers would later execute or collide with.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint

-- Qualify pg_catalog so a caller's search_path can never redirect these lookups. A plain SQL body (no SET clause)
-- keeps the functions inlinable into row-level security policies.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(pg_catalog.current_setting('app.user_id', true), '') $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_current_business_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(pg_catalog.current_setting('app.business_id', true), '')::pg_catalog.uuid $$;
```
Run `pnpm db:migrate && pnpm db:migrate:test`. Then `set -a && source apps/web/.env.local && set +a && psql "$DATABASE_URL_TEST" -c "create table public.planted (id int)"`.
Expected: `ERROR:  permission denied for schema public`.

---

### Task 6: Scoped transactions and tenant queries (TDD against the test database)

**Files:**
- Create: `packages/db/src/testing/index.ts`
- Create: `packages/db/src/rls.integration.test.ts`
- Create: `packages/db/src/scope.ts`, `packages/db/src/queries/memberships.ts`, `packages/db/src/queries/staff.ts`, `packages/db/src/index.ts`

- [ ] **Step 1: Test helpers (not the code under test)**

Create `packages/db/src/testing/index.ts`:
```ts
import { sql } from "drizzle-orm";
import { createDatabase, type DatabaseHandle } from "../client";
import { loadLocalEnv, requireEnv } from "../local-env";

export interface TestDatabases {
  readonly app: DatabaseHandle;
  readonly staff: DatabaseHandle;
  readonly owner: DatabaseHandle;
  readonly closeAll: () => Promise<void>;
}

/** Truncation is destructive, so refuse any owner URL that does not name a *_test database. */
export function assertTestDatabaseUrl(connectionString: string): void {
  const database = new URL(connectionString).pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to use "${database}" for tests: the database name must end with "_test".`);
  }
}

export function openTestDatabases(): TestDatabases {
  loadLocalEnv();
  const ownerUrl = requireEnv("DATABASE_URL_OWNER_TEST");
  assertTestDatabaseUrl(ownerUrl);
  assertTestDatabaseUrl(requireEnv("DATABASE_URL_TEST"));
  assertTestDatabaseUrl(requireEnv("DATABASE_URL_STAFF_TEST"));

  const app = createDatabase(requireEnv("DATABASE_URL_TEST"));
  const staff = createDatabase(requireEnv("DATABASE_URL_STAFF_TEST"));
  const owner = createDatabase(ownerUrl, { max: 1 });

  return {
    app,
    staff,
    owner,
    closeAll: async () => {
      await Promise.all([app.close(), staff.close(), owner.close()]);
    },
  };
}

const TABLES = [
  "rate_limit_buckets",
  "business_members",
  "staff_members",
  "businesses",
  "verifications",
  "accounts",
  "sessions",
  "users",
] as const;

export async function resetTestDatabase(owner: DatabaseHandle): Promise<void> {
  await owner.db.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}

/** Drizzle wraps driver errors; this joins the whole cause chain so tests can match the Postgres message. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause === undefined ? error.message : `${error.message}\n${describeError(error.cause)}`;
}

export async function captureErrorText(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    return describeError(error);
  }
  throw new Error("Expected the operation to fail, but it succeeded.");
}
```

- [ ] **Step 2: Write the failing integration tests**

Create `packages/db/src/rls.integration.test.ts`:
```ts
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "./client";
import { requireEnv } from "./local-env";
import { listMembershipsForUser } from "./queries/memberships";
import { countPlatformRecords, findActiveStaffMember } from "./queries/staff";
import { businesses, businessMembers, staffMembers, users } from "./schema";
import { withTenantScope, withUserScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const USER_A = "user-a";
const USER_B = "user-b";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

function idForSlug(rows: readonly { id: string; slug: string }[], slug: string): string {
  const row = rows.find((candidate) => candidate.slug === slug);
  if (row === undefined) throw new Error(`Seed business "${slug}" was not inserted`);
  return row.id;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: USER_A, name: "Ana Diaz", email: "ana@example.com" },
    { id: USER_B, name: "Ben Ortiz", email: "ben@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "riverside-plumbing", name: "Riverside Plumbing" },
      { slug: "bella-vista-bistro", name: "Bella Vista Bistro" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = idForSlug(inserted, "riverside-plumbing");
  businessB = idForSlug(inserted, "bella-vista-bistro");
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: USER_A, role: "owner" },
    { businessId: businessB, userId: USER_B, role: "owner" },
  ]);
});

describe("row-level security for fynix_app", () => {
  it("returns no businesses when no user scope is set", async () => {
    const rows = await dbs.app.db.select({ id: businesses.id }).from(businesses);
    expect(rows).toEqual([]);
  });

  it("returns only the scoped user's businesses", async () => {
    const rows = await withUserScope(dbs.app.db, USER_A, (tx) => tx.select({ id: businesses.id }).from(businesses));
    expect(rows).toEqual([{ id: businessA }]);
  });

  it("hides other users' membership rows even when filtered by their business id", async () => {
    const rows = await withUserScope(dbs.app.db, USER_A, (tx) =>
      tx.select().from(businessMembers).where(eq(businessMembers.businessId, businessB)),
    );
    expect(rows).toEqual([]);
  });

  it("denies the app role any write to businesses", async () => {
    const message = await captureErrorText(
      withUserScope(dbs.app.db, USER_A, (tx) => tx.insert(businesses).values({ slug: "sneaky", name: "Sneaky" })),
    );
    expect(message).toMatch(/permission denied for table businesses/);
  });

  it("denies the app role any access to staff_members", async () => {
    const message = await captureErrorText(dbs.app.db.select().from(staffMembers));
    expect(message).toMatch(/permission denied for table staff_members/);
  });

  it("sets user and business ids only for the duration of the transaction", async () => {
    const single = createDatabase(requireEnv("DATABASE_URL_TEST"), { max: 1 });
    const readSettings = sql`select current_setting('app.user_id', true) as user_id, current_setting('app.business_id', true) as business_id`;
    try {
      const inside = await withTenantScope(single.db, { userId: USER_A, businessId: businessA }, async (tx) => {
        const result = await tx.execute<{ user_id: string | null; business_id: string | null }>(readSettings);
        return result.rows[0];
      });
      expect(inside).toEqual({ user_id: USER_A, business_id: businessA });

      const after = await single.db.execute<{ user_id: string | null; business_id: string | null }>(readSettings);
      expect(after.rows[0]?.user_id ?? "").toBe("");
      expect(after.rows[0]?.business_id ?? "").toBe("");
    } finally {
      await single.close();
    }
  });

  it("rejects an empty user id before touching the database", async () => {
    await expect(withUserScope(dbs.app.db, "", async () => "unreachable")).rejects.toThrow("userId must not be empty");
  });

  it("rejects a business id that is not a UUID before touching the database", async () => {
    await expect(
      withTenantScope(dbs.app.db, { userId: USER_A, businessId: "not-a-uuid" }, async () => "unreachable"),
    ).rejects.toThrow('businessId must be a UUID, received "not-a-uuid"');
  });
});

describe("row-level security coverage", () => {
  // Any new table fynix_app can read must enable row-level security, or be added to this list on purpose.
  it("leaves only the auth and rate-limit tables readable by fynix_app without RLS", async () => {
    const result = await dbs.owner.db.execute<{ table_name: string }>(sql`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and has_table_privilege('fynix_app', c.oid, 'SELECT')
        and not c.relrowsecurity
      order by c.relname
    `);

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "accounts",
      "rate_limit_buckets",
      "sessions",
      "users",
      "verifications",
    ]);
  });
});

describe("listMembershipsForUser", () => {
  it("returns the user's businesses, oldest membership first", async () => {
    const later = await dbs.staff.db
      .insert(businesses)
      .values({ slug: "ironclad-builders", name: "Ironclad Builders" })
      .returning({ id: businesses.id });
    const laterId = later[0]?.id;
    if (laterId === undefined) throw new Error("Seed business was not inserted");
    await dbs.staff.db.insert(businessMembers).values({ businessId: laterId, userId: USER_A, role: "editor" });

    const memberships = await listMembershipsForUser(dbs.app.db, USER_A);

    expect(memberships).toEqual([
      { businessId: businessA, businessName: "Riverside Plumbing", role: "owner" },
      { businessId: laterId, businessName: "Ironclad Builders", role: "editor" },
    ]);
  });

  it("returns an empty list for a user with no business", async () => {
    await dbs.staff.db.insert(users).values({ id: "user-c", name: "Cy", email: "cy@example.com" });
    expect(await listMembershipsForUser(dbs.app.db, "user-c")).toEqual([]);
  });
});

describe("staff queries", () => {
  it("finds active staff and ignores inactive staff", async () => {
    await dbs.staff.db.insert(staffMembers).values([
      { userId: USER_A, role: "admin" },
      { userId: USER_B, role: "support", active: false },
    ]);

    expect(await findActiveStaffMember(dbs.staff.db, USER_A)).toEqual({ userId: USER_A, role: "admin" });
    expect(await findActiveStaffMember(dbs.staff.db, USER_B)).toBeNull();
    expect(await findActiveStaffMember(dbs.staff.db, "nobody")).toBeNull();
  });

  it("counts businesses and active staff across all tenants", async () => {
    await dbs.staff.db.insert(staffMembers).values([
      { userId: USER_A, role: "admin" },
      { userId: USER_B, role: "builder", active: false },
    ]);

    expect(await countPlatformRecords(dbs.staff.db)).toEqual({ businesses: 2, activeStaff: 1 });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run:
```bash
pnpm --filter @brandbasket/db test:integration
```
Expected: FAIL. Vitest cannot resolve `./scope`, `./queries/memberships` and `./queries/staff`.

- [ ] **Step 4: Implement scoped transactions**

Create `packages/db/src/scope.ts`:
```ts
import { sql } from "drizzle-orm";
import type { Database } from "./client";

export type ScopedTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface TenantScope {
  readonly userId: string;
  readonly businessId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertNotEmpty(value: string, name: string): void {
  if (value.trim() === "") throw new Error(`${name} must not be empty`);
}

/** Postgres would reject a malformed id deep inside a policy; fail early with a clear message instead. */
function assertUuid(value: string, name: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID, received "${value}"`);
}

/** Runs `work` in a transaction where row-level security sees `userId`. The setting ends with the transaction. */
export async function withUserScope<T>(
  db: Database,
  userId: string,
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  assertNotEmpty(userId, "userId");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}

/** Like withUserScope, and also scopes row-level security to one business. */
export async function withTenantScope<T>(
  db: Database,
  scope: TenantScope,
  work: (tx: ScopedTransaction) => Promise<T>,
): Promise<T> {
  assertNotEmpty(scope.userId, "userId");
  assertUuid(scope.businessId, "businessId");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${scope.userId}, true), set_config('app.business_id', ${scope.businessId}, true)`,
    );
    return work(tx);
  });
}
```

- [ ] **Step 5: Implement the queries**

Create `packages/db/src/queries/memberships.ts`:
```ts
import { asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, businessMembers, type BusinessMemberRole } from "../schema";
import { withUserScope } from "../scope";

export interface BusinessMembership {
  readonly businessId: string;
  readonly businessName: string;
  readonly role: BusinessMemberRole;
}

/** Reads through row-level security as the user, so it can only ever return that user's businesses. */
export async function listMembershipsForUser(db: Database, userId: string): Promise<BusinessMembership[]> {
  return withUserScope(db, userId, (tx) =>
    tx
      .select({
        businessId: businesses.id,
        businessName: businesses.name,
        role: businessMembers.role,
      })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
      .where(eq(businessMembers.userId, userId))
      .orderBy(asc(businessMembers.createdAt)),
  );
}
```

Create `packages/db/src/queries/staff.ts`:
```ts
import { and, count, eq } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, staffMembers, type StaffRole } from "../schema";

export interface ActiveStaffMember {
  readonly userId: string;
  readonly role: StaffRole;
}

export interface PlatformCounts {
  readonly businesses: number;
  readonly activeStaff: number;
}

/** Use with the staff connection. */
export async function findActiveStaffMember(db: Database, userId: string): Promise<ActiveStaffMember | null> {
  const rows = await db
    .select({ userId: staffMembers.userId, role: staffMembers.role })
    .from(staffMembers)
    .where(and(eq(staffMembers.userId, userId), eq(staffMembers.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** Use with the staff connection. */
export async function countPlatformRecords(db: Database): Promise<PlatformCounts> {
  const [businessRows, staffRows] = await Promise.all([
    db.select({ value: count() }).from(businesses),
    db.select({ value: count() }).from(staffMembers).where(eq(staffMembers.active, true)),
  ]);
  return { businesses: businessRows[0]?.value ?? 0, activeStaff: staffRows[0]?.value ?? 0 };
}
```

Create `packages/db/src/index.ts`:
```ts
export { createDatabase, type Database, type DatabaseHandle, type DatabaseOptions } from "./client";
export { listMembershipsForUser, type BusinessMembership } from "./queries/memberships";
export {
  countPlatformRecords,
  findActiveStaffMember,
  type ActiveStaffMember,
  type PlatformCounts,
} from "./queries/staff";
export * from "./schema";
export { withTenantScope, withUserScope, type ScopedTransaction, type TenantScope } from "./scope";
```

- [ ] **Step 6: Run the tests to see them pass**

Run:
```bash
pnpm --filter @brandbasket/db test:integration
```
Expected: PASS (13 tests).

> **Review fixes applied after implementation:** these supersede the code blocks above, so the files on disk are authoritative.
> - `listMembershipsForUser` orders by `createdAt`, then `businessId`, as a tiebreaker.
> - Ordering tests insert rows out of order and test ties.
> - A failure-path scope test was added.
> - The RLS coverage query also covers views, partitioned tables and column grants.
> - `testDatabaseName` rejects `host` query params and requires all three test URLs to name the same database.
> - `resetTestDatabase` truncates every public table, only in a `*_test` database.
> - `describeError` caps recursion.
> - Integration tests now total 15.

- [ ] **Step 7: Checkpoint**

Run:
```bash
pnpm --filter @brandbasket/db typecheck && pnpm --filter @brandbasket/db test
```
Expected: `tsc` exits 0; unit tests pass.

---

### Task 7: Postgres-backed rate limiter

Server-side Better Auth calls skip its HTTP rate limiter, so sign-in actions need their own. This limiter also serves the lead form in 1B.

**Files:**
- Create: `packages/db/src/rate-limit.test.ts`, `packages/db/src/rate-limit.integration.test.ts`, `packages/db/src/rate-limit.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `packages/db/src/rate-limit.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { assertValidRule, windowStartFor } from "./rate-limit";

describe("windowStartFor", () => {
  it("floors the time to the start of its window", () => {
    const now = new Date("2026-09-15T10:07:42.500Z");
    expect(windowStartFor(now, 15 * 60).toISOString()).toBe("2026-09-15T10:00:00.000Z");
    expect(windowStartFor(now, 60).toISOString()).toBe("2026-09-15T10:07:00.000Z");
  });

  it("starts a new window exactly on the boundary", () => {
    const boundary = new Date("2026-09-15T10:15:00.000Z");
    expect(windowStartFor(boundary, 15 * 60).toISOString()).toBe("2026-09-15T10:15:00.000Z");
  });
});

describe("assertValidRule", () => {
  it("accepts positive whole numbers", () => {
    expect(() => assertValidRule({ limit: 5, windowSeconds: 60 })).not.toThrow();
  });

  it("rejects zero, negative and fractional values", () => {
    expect(() => assertValidRule({ limit: 0, windowSeconds: 60 })).toThrow(RangeError);
    expect(() => assertValidRule({ limit: 5, windowSeconds: -1 })).toThrow(RangeError);
    expect(() => assertValidRule({ limit: 1.5, windowSeconds: 60 })).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Write the failing integration tests**

Create `packages/db/src/rate-limit.integration.test.ts`:
```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit } from "./rate-limit";
import { rateLimitBuckets } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const RULE = { limit: 2, windowSeconds: 60 };
const KEY = "sign-in:customer:client:203.0.113.7";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("consumeRateLimit", () => {
  it("allows hits up to the limit, then blocks with a retry time", async () => {
    const now = new Date("2026-09-15T10:00:15.000Z");

    const first = await consumeRateLimit(dbs.app.db, KEY, RULE, now);
    const second = await consumeRateLimit(dbs.app.db, KEY, RULE, now);
    const third = await consumeRateLimit(dbs.app.db, KEY, RULE, now);

    expect(first).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(second).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
    expect(third).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 45 });
  });

  it("counts keys independently", async () => {
    const now = new Date("2026-09-15T10:00:00.000Z");
    await consumeRateLimit(dbs.app.db, KEY, RULE, now);
    await consumeRateLimit(dbs.app.db, KEY, RULE, now);

    const other = await consumeRateLimit(dbs.app.db, "sign-in:customer:client:198.51.100.1", RULE, now);

    expect(other.allowed).toBe(true);
  });

  it("resets in the next window and removes the old window's row", async () => {
    await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:00:10.000Z"));
    await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:00:20.000Z"));
    await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:00:30.000Z"));

    const nextWindow = await consumeRateLimit(dbs.app.db, KEY, RULE, new Date("2026-09-15T10:01:05.000Z"));
    const rows = await dbs.app.db.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.key, KEY));

    expect(nextWindow).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.windowStart.toISOString()).toBe("2026-09-15T10:01:00.000Z");
  });

  it("rejects an empty key", async () => {
    await expect(consumeRateLimit(dbs.app.db, " ", RULE)).rejects.toThrow("Rate limit key must not be empty");
  });
});
```

- [ ] **Step 3: Run both to see them fail**

Run:
```bash
pnpm --filter @brandbasket/db test; pnpm --filter @brandbasket/db test:integration
```
Expected: both FAIL, unable to resolve `./rate-limit`.

- [ ] **Step 4: Implement the limiter**

Create `packages/db/src/rate-limit.ts`:
```ts
import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import { rateLimitBuckets } from "./schema";

export interface RateLimitRule {
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export function assertValidRule(rule: RateLimitRule): void {
  if (!Number.isSafeInteger(rule.limit) || rule.limit < 1) {
    throw new RangeError(`Rate limit must be a positive whole number, received ${rule.limit}`);
  }
  if (!Number.isSafeInteger(rule.windowSeconds) || rule.windowSeconds < 1) {
    throw new RangeError(`Rate limit window must be a positive whole number of seconds, received ${rule.windowSeconds}`);
  }
}

export function windowStartFor(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** Records one hit for `key` and reports whether it is within the rule. Atomic under concurrent hits. */
export async function consumeRateLimit(
  db: Database,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  if (key.trim() === "") throw new Error("Rate limit key must not be empty");
  assertValidRule(rule);

  const windowStart = windowStartFor(now, rule.windowSeconds);
  const rows = await db
    .insert(rateLimitBuckets)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });

  const hits = rows[0]?.count;
  if (hits === undefined) throw new Error(`Rate limit upsert returned no row for key "${key}"`);

  await db
    .delete(rateLimitBuckets)
    .where(and(eq(rateLimitBuckets.key, key), lt(rateLimitBuckets.windowStart, windowStart)));

  if (hits <= rule.limit) {
    return { allowed: true, remaining: rule.limit - hits, retryAfterSeconds: 0 };
  }
  const windowEndMs = windowStart.getTime() + rule.windowSeconds * 1000;
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((windowEndMs - now.getTime()) / 1000) };
}
```

In `packages/db/src/index.ts`, add this line after the `./client` export:
```ts
export { assertValidRule, consumeRateLimit, windowStartFor, type RateLimitResult, type RateLimitRule } from "./rate-limit";
```

- [ ] **Step 5: Run both to see them pass**

Run:
```bash
pnpm --filter @brandbasket/db test && pnpm --filter @brandbasket/db test:integration
```
Expected: unit PASS (15 tests: review fixes in Tasks 3 and 4 added 4 tests to the original 7, plus these 4); integration PASS (19 tests).

- [ ] **Step 6: Checkpoint**

Run:
```bash
pnpm --filter @brandbasket/db typecheck
```
Expected: exits 0.

---

### Task 8: `@brandbasket/auth`: Better Auth with an invite-only gate

Accounts may only be created by Fynix Digital's own server code: the staff CLI now, invite redemption in 1B. The gate is an `AsyncLocalStorage` grant that Better Auth's `user.create.before` hook checks. Phase 1 mounts no Better Auth HTTP route, so no public endpoint can create accounts either.

**Files:**
- Create: `packages/auth/package.json`, `packages/auth/tsconfig.json`, `packages/auth/vitest.config.ts`, `packages/auth/vitest.integration.config.ts`
- Create: `packages/auth/src/account-creation-grant.test.ts`, `packages/auth/src/account-creation-grant.ts`
- Create: `packages/auth/src/create-auth.integration.test.ts`, `packages/auth/src/create-auth.ts`, `packages/auth/src/errors.ts`, `packages/auth/src/index.ts`

- [ ] **Step 1: Package manifest and configs**

Create `packages/auth/package.json`:
```json
{
  "name": "@brandbasket/auth",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "staff:create": "tsx scripts/create-staff.ts"
  },
  "dependencies": {
    "@brandbasket/db": "workspace:*",
    "better-auth": "1.7.5",
    "drizzle-orm": "0.45.2",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/node": "^24.13.4",
    "tsx": "4.23.13",
    "typescript": "^5",
    "vitest": "^5.0.0"
  }
}
```

Create `packages/auth/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "scripts", "vitest.config.ts", "vitest.integration.config.ts"]
}
```

Create `packages/auth/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
  },
});
```

Create `packages/auth/vitest.integration.config.ts`:
```ts
import { defineConfig } from "vitest/config";

/** Shares the test database with @brandbasket/db, so files run one at a time. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

Run:
```bash
pnpm install
```
Expected: `better-auth` and the workspace link to `@brandbasket/db` install.

- [ ] **Step 2: Write the failing unit tests for the grant**

Create `packages/auth/src/account-creation-grant.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hasAccountCreationGrant, withAccountCreationGrant } from "./account-creation-grant";

describe("account creation grants", () => {
  it("is absent outside a grant", () => {
    expect(hasAccountCreationGrant("owner@example.com")).toBe(false);
  });

  it("applies to the granted email, ignoring case and surrounding spaces", async () => {
    const inside = await withAccountCreationGrant(" Owner@Example.com ", async () =>
      hasAccountCreationGrant("owner@example.com"),
    );
    expect(inside).toBe(true);
  });

  it("does not apply to a different email", async () => {
    const inside = await withAccountCreationGrant("owner@example.com", async () =>
      hasAccountCreationGrant("someone-else@example.com"),
    );
    expect(inside).toBe(false);
  });

  it("survives awaits inside the granted work", async () => {
    const inside = await withAccountCreationGrant("owner@example.com", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return hasAccountCreationGrant("owner@example.com");
    });
    expect(inside).toBe(true);
  });

  it("ends when the granted work finishes", async () => {
    await withAccountCreationGrant("owner@example.com", async () => undefined);
    expect(hasAccountCreationGrant("owner@example.com")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run:
```bash
pnpm --filter @brandbasket/auth test
```
Expected: FAIL, unable to resolve `./account-creation-grant`.

- [ ] **Step 4: Implement the grant**

Create `packages/auth/src/account-creation-grant.ts`:
```ts
import { AsyncLocalStorage } from "node:async_hooks";

interface AccountCreationGrant {
  readonly email: string;
}

const grants = new AsyncLocalStorage<AccountCreationGrant>();

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Runs `work` with permission to create an account for `email`. Nothing else can create accounts. */
export function withAccountCreationGrant<T>(email: string, work: () => Promise<T>): Promise<T> {
  return grants.run({ email: normaliseEmail(email) }, work);
}

export function hasAccountCreationGrant(email: string): boolean {
  const grant = grants.getStore();
  return grant !== undefined && grant.email === normaliseEmail(email);
}
```

- [ ] **Step 5: Run to see it pass**

Run:
```bash
pnpm --filter @brandbasket/auth test
```
Expected: PASS (5 tests).

- [ ] **Step 6: Write the failing integration tests**

Create `packages/auth/src/create-auth.integration.test.ts`:
```ts
import { users } from "@brandbasket/db";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { count } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withAccountCreationGrant } from "./account-creation-grant";
import { createAuth, type Auth } from "./create-auth";
import { isAuthApiError } from "./errors";

const ORIGIN = "http://app.localhost:3000";
const OWNER = { email: "owner@example.com", name: "Riley Owner", password: "correct-horse-battery" };

let dbs: TestDatabases;
let auth: Auth;

async function userCount(): Promise<number> {
  const rows = await dbs.staff.db.select({ value: count() }).from(users);
  return rows[0]?.value ?? 0;
}

beforeAll(() => {
  dbs = openTestDatabases();
  auth = createAuth({
    db: dbs.app.db,
    secret: "integration-test-secret-with-at-least-32-chars",
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    nextCookies: false,
  });
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("account creation", () => {
  it("is refused without a grant", async () => {
    await captureErrorText(auth.api.signUpEmail({ body: OWNER }));
    expect(await userCount()).toBe(0);
  });

  it("is refused when the grant names another email", async () => {
    await captureErrorText(
      withAccountCreationGrant("someone-else@example.com", () => auth.api.signUpEmail({ body: OWNER })),
    );
    expect(await userCount()).toBe(0);
  });

  it("succeeds inside a matching grant", async () => {
    const result = await withAccountCreationGrant(OWNER.email, () => auth.api.signUpEmail({ body: OWNER }));

    expect(result.user.email).toBe(OWNER.email);
    expect(await userCount()).toBe(1);
  });
});

describe("sign in", () => {
  beforeEach(async () => {
    await withAccountCreationGrant(OWNER.email, () => auth.api.signUpEmail({ body: OWNER }));
  });

  it("accepts the right password", async () => {
    const result = await auth.api.signInEmail({ body: { email: OWNER.email, password: OWNER.password } });
    expect(result.user.email).toBe(OWNER.email);
  });

  it("rejects a wrong password with an auth API error", async () => {
    const failure = await auth.api
      .signInEmail({ body: { email: OWNER.email, password: "wrong-password-123" } })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(isAuthApiError(failure)).toBe(true);
  });
});
```

- [ ] **Step 7: Run to see it fail**

Run:
```bash
pnpm --filter @brandbasket/auth test:integration
```
Expected: FAIL, unable to resolve `./create-auth` and `./errors`.

- [ ] **Step 8: Implement the auth factory**

Create `packages/auth/src/errors.ts`:
```ts
import { APIError } from "better-auth/api";

/** Better Auth reports expected failures, such as a wrong password, as APIError. */
export function isAuthApiError(error: unknown): error is APIError {
  return error instanceof APIError;
}
```

Create `packages/auth/src/create-auth.ts`:
```ts
import { accounts, sessions, users, verifications, type Database } from "@brandbasket/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { hasAccountCreationGrant } from "./account-creation-grant";

export const PASSWORD_MIN_LENGTH = 10;
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

export interface AuthConfig {
  readonly db: Database;
  readonly secret: string;
  readonly baseURL: string;
  readonly trustedOrigins: readonly string[];
  /** Server actions need this to write session cookies. Scripts and tests run outside Next.js and must leave it off. */
  readonly nextCookies: boolean;
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    appName: "Fynix",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [...config.trustedOrigins],
    database: drizzleAdapter(config.db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      autoSignIn: false,
    },
    session: {
      expiresIn: SESSION_LIFETIME_SECONDS,
    },
    // IDs: Better Auth's default text IDs. Do not set advanced.database.generateId to "uuid": on the pg
    // provider that defers ID generation to the database, and these text id columns have no default.
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!hasAccountCreationGrant(user.email)) return false;
            return { data: user };
          },
        },
      },
    },
    plugins: config.nextCookies ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

Create `packages/auth/src/index.ts`:
```ts
export { hasAccountCreationGrant, normaliseEmail, withAccountCreationGrant } from "./account-creation-grant";
export { createAuth, PASSWORD_MIN_LENGTH, type Auth, type AuthConfig } from "./create-auth";
export { isAuthApiError } from "./errors";
```

- [ ] **Step 9: Run to see it pass**

Run:
```bash
pnpm --filter @brandbasket/auth test:integration
```
Expected: PASS (5 tests). Better Auth may log the refused creations to stderr; that's expected.

> **Review fixes applied after implementation:** the files in `packages/auth/src` supersede the code blocks in this task.
> - `createAccountWithGrant` + `AccountAlreadyExistsError` (`src/create-account.ts`): Better Auth answers a duplicate email with a fake success.
> - `isAuthApiError` uses Better Auth's `isAPIError`; `isInvalidCredentialsError` was added.
> - `createAuth` rejects secrets shorter than 32 characters and a set `BETTER_AUTH_SECRETS` env var.
> - The hook refuses with `return false` and never throws a 403.
> - The grant validates its email.
> - The public exports are `createAuth`, `PASSWORD_MIN_LENGTH`, `Auth`, `AuthConfig`, `createAccountWithGrant`, `AccountAlreadyExistsError`, `NewAccount`, `CreatedAccount`, `isAuthApiError` and `isInvalidCredentialsError`.
> - Final counts: 10 unit tests and 12 integration tests.

- [ ] **Step 10: Checkpoint**

Run:
```bash
pnpm --filter @brandbasket/auth typecheck && pnpm --filter @brandbasket/auth test
```
Expected: `tsc` exits 0; 5 unit tests pass.

---

### Task 9: Staff account CLI

**Files:**
- Create: `packages/auth/scripts/prompt-hidden.ts`, `packages/auth/scripts/create-staff.ts`

- [ ] **Step 1: Masked terminal input**

Create `packages/auth/scripts/prompt-hidden.ts`:
```ts
import { stdin, stdout } from "node:process";

const ENTER = new Set(["\r", "\n"]);
const CTRL_C = "\x03";
const BACKSPACE = new Set(["\x7f", "\b"]);

/** Reads one line from the terminal without echoing what is typed. */
export function promptHidden(question: string): Promise<string> {
  if (!stdin.isTTY) {
    return Promise.reject(new Error("This command needs an interactive terminal to read a password."));
  }

  return new Promise((resolve, reject) => {
    let value = "";

    const finish = (error: Error | null): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error === null) resolve(value);
      else reject(error);
    };

    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (ENTER.has(character)) return finish(null);
        if (character === CTRL_C) return finish(new Error("Cancelled."));
        if (BACKSPACE.has(character)) {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };

    stdout.write(question);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
```

- [ ] **Step 2: The create-or-promote command**

Create `packages/auth/scripts/create-staff.ts`:
```ts
import { parseArgs } from "node:util";
import { createDatabase, staffMembers, staffRole, users } from "@brandbasket/db";
import { loadLocalEnv, requireEnv } from "@brandbasket/db/local-env";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createAccountWithGrant, createAuth, PASSWORD_MIN_LENGTH } from "../src";
import { promptHidden } from "./prompt-hidden";

// Usage: pnpm staff:create --email you@example.com --name "Your Name" [--role admin|builder|support]
// Creates the account if the email is new; otherwise grants staff access to the existing account.

const argsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("--email must be a valid email address")),
  name: z.string().trim().min(1, "--name is required").max(120, "--name must be 120 characters or fewer"),
  role: z.enum(staffRole.enumValues, "--role must be admin, builder or support"),
});

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "admin" },
  },
});

const parsed = argsSchema.safeParse(values);
if (!parsed.success) {
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
const { email, name, role } = parsed.data;

loadLocalEnv();
const adminOrigin = requireEnv("ADMIN_ORIGIN");
const staffDatabase = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });

try {
  const existing = await staffDatabase.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  let userId = existing[0]?.id;

  if (userId === undefined) {
    const password = await promptHidden(`Password for ${email} (at least ${PASSWORD_MIN_LENGTH} characters): `);
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`The password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if ((await promptHidden("Repeat the password: ")) !== password) {
      throw new Error("The passwords don't match.");
    }

    const auth = createAuth({
      db: staffDatabase.db,
      secret: requireEnv("BETTER_AUTH_SECRET"),
      baseURL: adminOrigin,
      trustedOrigins: [adminOrigin],
      nextCookies: false,
    });
    // createAccountWithGrant confirms the row exists: Better Auth reports duplicates as a fake success.
    const created = await createAccountWithGrant(auth, staffDatabase.db, { email, name, password });
    userId = created.userId;
    console.log(`Created account ${email}.`);
  } else {
    console.log(`${email} already has an account; granting staff access to it.`);
  }

  await staffDatabase.db
    .insert(staffMembers)
    .values({ userId, role })
    .onConflictDoUpdate({ target: staffMembers.userId, set: { role, active: true } });

  console.log(`${email} is now active staff (${role}). Sign in at ${adminOrigin}/login`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await staffDatabase.close();
}
```

- [ ] **Step 3: Create your own staff account**

Run, substituting your details:
```bash
pnpm staff:create --email you@example.com --name "Your Name" --role admin
```
Type a password of at least 10 characters twice.
Expected: `Created account you@example.com.` then `you@example.com is now active staff (admin). Sign in at http://admin.localhost:3000/login`.

> **Review fixes applied after implementation:** the files in `packages/auth/scripts` supersede the code blocks in this task.
> - `--role` is required, with no default: a re-run can never silently promote someone to admin.
> - For existing accounts, the command prints the account name, the previous staff role and status, and warns when there is no password.
> - `--help`; readable argument errors.
> - Prompts are written to stderr; Ctrl-D cancels.
> - Password rules (length, control characters, match) live in `scripts/password-rules.ts` with tests.
> - Database errors print only their cause, never SQL params.

Run it a second time with the same email and role.
Expected: `already has an account; granting staff access to it.` with no password prompt, which shows the command is safe to re-run.

- [ ] **Step 4: Checkpoint**

Run:
```bash
pnpm --filter @brandbasket/auth typecheck
```
Expected: exits 0.

---

### Task 10: Host-based routing

**Files:**
- Create: `apps/web/lib/surfaces.test.ts`, `apps/web/lib/surfaces.ts`, `apps/web/proxy.ts`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/surfaces.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  normaliseHost,
  readOriginsFromEnv,
  resolveSurface,
  rewritePathForSurface,
  type SurfaceOrigins,
} from "./surfaces";

const origins: SurfaceOrigins = {
  marketing: "http://localhost:3000",
  app: "http://app.localhost:3000",
  admin: "http://admin.localhost:3000",
};

describe("normaliseHost", () => {
  it("lowercases and keeps the port", () => {
    expect(normaliseHost("App.LocalHost:3000")).toBe("app.localhost:3000");
  });

  it("drops a trailing dot on the host name", () => {
    expect(normaliseHost("app.localhost.:3000")).toBe("app.localhost:3000");
    expect(normaliseHost("example.com.")).toBe("example.com");
  });

  it("rejects values that are not a host", () => {
    expect(normaliseHost("")).toBeNull();
    expect(normaliseHost("evil.com/path")).toBeNull();
    expect(normaliseHost("user@evil.com")).toBeNull();
    expect(normaliseHost("[::1]:3000")).toBeNull();
  });
});

describe("resolveSurface", () => {
  it("maps each configured host to its surface", () => {
    expect(resolveSurface("localhost:3000", origins)).toBe("marketing");
    expect(resolveSurface("app.localhost:3000", origins)).toBe("app");
    expect(resolveSurface("ADMIN.localhost:3000", origins)).toBe("admin");
  });

  it("returns null for unknown or missing hosts", () => {
    expect(resolveSurface("evil.example", origins)).toBeNull();
    expect(resolveSurface("app.localhost:4000", origins)).toBeNull();
    expect(resolveSurface(null, origins)).toBeNull();
  });
});

describe("rewritePathForSurface", () => {
  it("leaves marketing paths alone", () => {
    expect(rewritePathForSurface("marketing", "/pricing")).toBe("/pricing");
    expect(rewritePathForSurface("marketing", "/app-hostile")).toBe("/app-hostile");
  });

  it("blocks dashboard prefixes on the marketing host", () => {
    expect(rewritePathForSurface("marketing", "/app-host")).toBeNull();
    expect(rewritePathForSurface("marketing", "/app-host/login")).toBeNull();
    expect(rewritePathForSurface("marketing", "/admin-host")).toBeNull();
  });

  it("prefixes dashboard paths", () => {
    expect(rewritePathForSurface("app", "/")).toBe("/app-host");
    expect(rewritePathForSurface("app", "/login")).toBe("/app-host/login");
    expect(rewritePathForSurface("admin", "/")).toBe("/admin-host");
    expect(rewritePathForSurface("admin", "/login")).toBe("/admin-host/login");
  });
});

describe("readOriginsFromEnv", () => {
  it("reads all three origins", () => {
    expect(
      readOriginsFromEnv({
        MARKETING_ORIGIN: origins.marketing,
        APP_ORIGIN: origins.app,
        ADMIN_ORIGIN: origins.admin,
      }),
    ).toEqual(origins);
  });

  it("returns null when any origin is missing", () => {
    expect(readOriginsFromEnv({ MARKETING_ORIGIN: origins.marketing, APP_ORIGIN: origins.app })).toBeNull();
  });

  it("throws on an origin that is not a URL", () => {
    expect(() =>
      readOriginsFromEnv({ MARKETING_ORIGIN: "localhost", APP_ORIGIN: origins.app, ADMIN_ORIGIN: origins.admin }),
    ).toThrow("MARKETING_ORIGIN");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run:
```bash
pnpm --filter @brandbasket/web test
```
Expected: FAIL, unable to resolve `./surfaces`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/surfaces.ts`:
```ts
export type Surface = "marketing" | "app" | "admin";

export interface SurfaceOrigins {
  readonly marketing: string;
  readonly app: string;
  readonly admin: string;
}

/** Route folders under app/ that hold each dashboard. They are only reachable through their own host. */
export const SURFACE_PATH_PREFIX = {
  app: "/app-host",
  admin: "/admin-host",
} as const;

const HOST_PATTERN = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.?(?::(\d{1,5}))?$/;

/** Lowercases a Host header, drops a trailing dot and keeps the port. Anything else returns null. */
export function normaliseHost(rawHost: string): string | null {
  const match = HOST_PATTERN.exec(rawHost.trim().toLowerCase());
  const name = match?.[1];
  if (name === undefined) return null;
  const port = match?.[2];
  return port === undefined ? name : `${name}:${port}`;
}

function hostOfOrigin(origin: string): string | null {
  return normaliseHost(new URL(origin).host);
}

export function resolveSurface(rawHost: string | null, origins: SurfaceOrigins): Surface | null {
  if (rawHost === null) return null;
  const host = normaliseHost(rawHost);
  if (host === null) return null;
  if (host === hostOfOrigin(origins.app)) return "app";
  if (host === hostOfOrigin(origins.admin)) return "admin";
  if (host === hostOfOrigin(origins.marketing)) return "marketing";
  return null;
}

function hasPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The internal path to render, or null when the path must 404 on this surface. */
export function rewritePathForSurface(surface: Surface, pathname: string): string | null {
  if (surface === "marketing") {
    const reserved = Object.values(SURFACE_PATH_PREFIX).some((prefix) => hasPrefix(pathname, prefix));
    return reserved ? null : pathname;
  }
  const prefix = SURFACE_PATH_PREFIX[surface];
  return pathname === "/" ? prefix : `${prefix}${pathname}`;
}

const ORIGIN_VARIABLES = {
  marketing: "MARKETING_ORIGIN",
  app: "APP_ORIGIN",
  admin: "ADMIN_ORIGIN",
} as const;

function parseOrigin(name: string, value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${name} must be an absolute URL such as http://app.localhost:3000, received "${value}"`);
  }
}

/** Null when routing is not configured (for example a marketing-only deploy). Throws on malformed values. */
export function readOriginsFromEnv(env: Readonly<Record<string, string | undefined>>): SurfaceOrigins | null {
  const marketing = env[ORIGIN_VARIABLES.marketing]?.trim();
  const app = env[ORIGIN_VARIABLES.app]?.trim();
  const admin = env[ORIGIN_VARIABLES.admin]?.trim();
  if (!marketing || !app || !admin) return null;
  return {
    marketing: parseOrigin(ORIGIN_VARIABLES.marketing, marketing),
    app: parseOrigin(ORIGIN_VARIABLES.app, app),
    admin: parseOrigin(ORIGIN_VARIABLES.admin, admin),
  };
}
```

- [ ] **Step 4: Run to see it pass**

Run:
```bash
pnpm --filter @brandbasket/web test
```
Expected: PASS, including the existing marketing tests.

- [ ] **Step 5: The proxy**

Create `apps/web/proxy.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { readOriginsFromEnv, resolveSurface, rewritePathForSurface } from "@/lib/surfaces";

const origins = readOriginsFromEnv(process.env);

/**
 * Routes each hostname to its surface. Without configured origins the app serves marketing only,
 * and the dashboard prefixes still return 404. This is routing, not authorization: every dashboard
 * page and server action checks access itself.
 */
export function proxy(request: NextRequest): NextResponse {
  const surface = origins === null ? "marketing" : resolveSurface(request.headers.get("host"), origins);
  if (surface === null) return new NextResponse(null, { status: 404 });

  const { pathname, search } = request.nextUrl;
  const target = rewritePathForSurface(surface, pathname);
  if (target === null) return new NextResponse(null, { status: 404 });

  const response =
    target === pathname ? NextResponse.next() : NextResponse.rewrite(new URL(`${target}${search}`, request.url));
  if (surface !== "marketing") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Skip Next.js internals, API routes, generated icons and any path that ends in a file extension.
  matcher: ["/((?!_next/|api/|icon|apple-icon|.*\\.[^/]+$).*)"],
};
```

- [ ] **Step 6: Allow the dashboard hosts in development**

Replace `apps/web/next.config.ts` with:
```ts
import type { NextConfig } from "next";

const REQUIRED_FOR_PRODUCTION = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_WHATSAPP_NUMBER"] as const;

/** Fails a production deploy early instead of shipping a site with no working contact channel. */
function assertProductionEnvironment(): void {
  if (process.env.VERCEL_ENV !== "production") return;

  const missing = REQUIRED_FOR_PRODUCTION.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Production deployment is missing required environment variables: ${missing.join(", ")}. See .env.example.`,
    );
  }
}

assertProductionEnvironment();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The dev server only trusts localhost by default; the dashboards run on these subdomains locally.
  allowedDevOrigins: ["app.localhost", "admin.localhost"],
};

export default nextConfig;
```

- [ ] **Step 7: Verify routing against the dev server**

Start the dev server with `pnpm dev` in a separate terminal, wait for "Ready", then run:
```bash
curl -s -o /dev/null -w "marketing /pricing: %{http_code}\n" -H "Host: localhost:3000" http://127.0.0.1:3000/pricing
curl -s -o /dev/null -w "marketing /app-host: %{http_code}\n" -H "Host: localhost:3000" http://127.0.0.1:3000/app-host
curl -s -o /dev/null -w "unknown host: %{http_code}\n" -H "Host: evil.example" http://127.0.0.1:3000/
curl -s -D - -o /dev/null -H "Host: app.localhost:3000" http://127.0.0.1:3000/ | grep -i "x-robots-tag"
```
Expected: `marketing /pricing: 200`, `marketing /app-host: 404`, `unknown host: 404`, and `X-Robots-Tag: noindex, nofollow`. The app-host body itself is a 404 until Task 14 adds its pages. Stop the dev server.

- [ ] **Step 8: Checkpoint**

Run:
```bash
pnpm lint && pnpm --filter @brandbasket/web typecheck && pnpm --filter @brandbasket/web test
```
Expected: all pass.

---

### Task 11: Server wiring in the web app

**Files:**
- Modify: `apps/web/package.json` (dependencies), `apps/web/next.config.ts`
- Create (pure, tested): `apps/web/lib/client-ip.ts` (+test), `apps/web/lib/sign-in-form.ts` (+test), `apps/web/lib/access.ts` (+test), `apps/web/lib/names.ts` (+test), `apps/web/lib/sign-in-limits.ts` (+test)
- Create (server): `apps/web/lib/server/env.ts`, `db.ts`, `auth.ts`, `session.ts`, `customer-access.ts`, `staff-access.ts`, `sign-in.ts`, `sign-out.ts`

- [ ] **Step 1: Add dependencies**

Run:
```bash
pnpm --filter @brandbasket/web add @brandbasket/auth@workspace:* @brandbasket/db@workspace:* pg@8.23.0 server-only@0.0.1
```
Expected: `apps/web/package.json` `dependencies` now also lists `"@brandbasket/auth": "workspace:*"`, `"@brandbasket/db": "workspace:*"`, `"pg": "8.23.0"` and `"server-only": "0.0.1"`. `pg` is listed directly because Next.js loads it as an external package at runtime, resolved from `apps/web`.

In `apps/web/next.config.ts`, replace:
```ts
  poweredByHeader: false,
```
with:
```ts
  poweredByHeader: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@brandbasket/auth", "@brandbasket/db"],
```

- [ ] **Step 2: Write the failing unit tests**

Create `apps/web/lib/client-ip.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./client-ip";

describe("clientIpFrom", () => {
  it("uses the first X-Forwarded-For address", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": " 198.51.100.4 " }))).toBe("198.51.100.4");
  });

  it("returns unknown when neither header is present or usable", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});
```

Create `apps/web/lib/sign-in-form.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseSignInForm } from "./sign-in-form";

function form(entries: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseSignInForm", () => {
  it("accepts a valid email and password, normalising the email", () => {
    expect(parseSignInForm(form({ email: "  Owner@Example.COM ", password: "secret-pass" }))).toEqual({
      success: true,
      data: { email: "owner@example.com", password: "secret-pass" },
    });
  });

  it("asks for an email when it is missing", () => {
    expect(parseSignInForm(form({ email: " ", password: "secret-pass" }))).toEqual({
      success: false,
      message: "Enter your email address.",
      email: "",
    });
  });

  it("rejects a malformed email and echoes what was typed", () => {
    expect(parseSignInForm(form({ email: "owner@", password: "secret-pass" }))).toEqual({
      success: false,
      message: "Enter a valid email address.",
      email: "owner@",
    });
  });

  it("asks for a password when it is missing", () => {
    expect(parseSignInForm(form({ email: "owner@example.com", password: "" }))).toMatchObject({
      success: false,
      message: "Enter your password.",
    });
  });

  it("treats uploaded files as empty values", () => {
    expect(parseSignInForm(form({ email: new Blob(["x"]), password: "secret-pass" }))).toMatchObject({
      success: false,
      message: "Enter your email address.",
    });
  });
});
```

Create `apps/web/lib/access.test.ts`:
```ts
import type { BusinessMembership } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { decideCustomerAccess, decideStaffAccess, type SessionUser } from "./access";

const user: SessionUser = { id: "user-1", email: "owner@example.com", name: "Riley Owner" };

const riverside: BusinessMembership = {
  businessId: "0192f3c4-0000-7000-8000-000000000001",
  businessName: "Riverside Plumbing",
  role: "owner",
};

describe("decideCustomerAccess", () => {
  it("is signed-out without a session", () => {
    expect(decideCustomerAccess(null, [riverside])).toEqual({ kind: "signed-out" });
  });

  it("reports an account with no business", () => {
    expect(decideCustomerAccess(user, [])).toEqual({ kind: "no-business", user });
  });

  it("grants access to the first (oldest) membership", () => {
    const later: BusinessMembership = { ...riverside, businessId: "later", businessName: "Later Co", role: "editor" };
    expect(decideCustomerAccess(user, [riverside, later])).toEqual({
      kind: "granted",
      user,
      tenant: {
        userId: user.id,
        businessId: riverside.businessId,
        businessName: "Riverside Plumbing",
        role: "owner",
      },
    });
  });
});

describe("decideStaffAccess", () => {
  it("is signed-out without a session", () => {
    expect(decideStaffAccess(null, { userId: user.id, role: "admin" })).toEqual({ kind: "signed-out" });
  });

  it("refuses accounts without active staff access", () => {
    expect(decideStaffAccess(user, null)).toEqual({ kind: "not-staff", user });
  });

  it("refuses a staff record that belongs to someone else", () => {
    expect(decideStaffAccess(user, { userId: "user-2", role: "admin" })).toEqual({ kind: "not-staff", user });
  });

  it("grants access to active staff", () => {
    expect(decideStaffAccess(user, { userId: user.id, role: "builder" })).toEqual({
      kind: "granted",
      user,
      staff: { userId: user.id, role: "builder" },
    });
  });
});
```

Create `apps/web/lib/names.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { firstName } from "./names";

describe("firstName", () => {
  it("returns the first word of a full name", () => {
    expect(firstName("  Riley   Owner ")).toBe("Riley");
  });

  it("falls back to a neutral greeting for blank names", () => {
    expect(firstName("   ")).toBe("there");
  });
});
```

Create `apps/web/lib/sign-in-limits.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { retryMessage, signInRateLimitChecks } from "./sign-in-limits";

describe("signInRateLimitChecks", () => {
  it("checks the network first, then the account from that network, then the account overall", () => {
    expect(signInRateLimitChecks("customer", "owner@example.com", "203.0.113.7")).toEqual([
      { key: "sign-in:customer:client:203.0.113.7", rule: { limit: 20, windowSeconds: 900 } },
      {
        key: "sign-in:customer:account-client:owner@example.com:203.0.113.7",
        rule: { limit: 8, windowSeconds: 900 },
      },
      { key: "sign-in:customer:account:owner@example.com", rule: { limit: 50, windowSeconds: 900 } },
    ]);
  });

  it("keeps staff and customer limits separate", () => {
    const customerKeys = signInRateLimitChecks("customer", "owner@example.com", "203.0.113.7").map((check) => check.key);
    const staffKeys = signInRateLimitChecks("staff", "owner@example.com", "203.0.113.7").map((check) => check.key);
    expect(customerKeys.some((key) => staffKeys.includes(key))).toBe(false);
  });
});

describe("retryMessage", () => {
  it("rounds up to whole minutes, never less than one", () => {
    expect(retryMessage(1)).toBe("Too many sign-in attempts. Try again in 1 minute.");
    expect(retryMessage(61)).toBe("Too many sign-in attempts. Try again in 2 minutes.");
    expect(retryMessage(900)).toBe("Too many sign-in attempts. Try again in 15 minutes.");
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run:
```bash
pnpm --filter @brandbasket/web test
```
Expected: FAIL, unable to resolve `./client-ip`, `./sign-in-form`, `./access`, `./names` and `./sign-in-limits`.

- [ ] **Step 4: Implement the pure modules**

Create `apps/web/lib/client-ip.ts`:
```ts
const UNKNOWN_CLIENT = "unknown";

/**
 * Client address for rate limiting: the first X-Forwarded-For entry, then X-Real-IP.
 * These headers are only trustworthy behind a proxy that overwrites them, as Vercel and `next dev` do.
 */
export function clientIpFrom(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp ? realIp : UNKNOWN_CLIENT;
}
```

Create `apps/web/lib/sign-in-form.ts`:
```ts
import { z } from "zod";

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your email address.")
    .max(MAX_EMAIL_LENGTH, "That email address is too long.")
    .pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password.").max(MAX_PASSWORD_LENGTH, "That password is too long."),
});

export type SignInInput = z.output<typeof signInSchema>;

export type SignInFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly email: string };

export const initialSignInState: SignInFormState = { status: "idle" };

export type SignInParseResult =
  | { readonly success: true; readonly data: SignInInput }
  | { readonly success: false; readonly message: string; readonly email: string };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseSignInForm(formData: FormData): SignInParseResult {
  const email = textValue(formData, "email");
  const result = signInSchema.safeParse({ email, password: textValue(formData, "password") });
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    message: result.error.issues[0]?.message ?? "Check your email and password.",
    email: email.trim(),
  };
}
```

Create `apps/web/lib/access.ts`:
```ts
import type { ActiveStaffMember, BusinessMembership } from "@brandbasket/db";

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** Everything a customer-facing server operation needs to scope its work to one business. */
export interface TenantContext {
  readonly userId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly role: BusinessMembership["role"];
}

export type CustomerAccess =
  | { readonly kind: "signed-out" }
  | { readonly kind: "no-business"; readonly user: SessionUser }
  | { readonly kind: "granted"; readonly user: SessionUser; readonly tenant: TenantContext };

/**
 * In Phase 1 a customer belongs to one business. If an account has several, the oldest membership wins
 * until a business switcher exists. `memberships` must be ordered oldest first.
 */
export function decideCustomerAccess(
  user: SessionUser | null,
  memberships: readonly BusinessMembership[],
): CustomerAccess {
  if (user === null) return { kind: "signed-out" };
  const membership = memberships[0];
  if (membership === undefined) return { kind: "no-business", user };
  return {
    kind: "granted",
    user,
    tenant: {
      userId: user.id,
      businessId: membership.businessId,
      businessName: membership.businessName,
      role: membership.role,
    },
  };
}

export type StaffAccess =
  | { readonly kind: "signed-out" }
  | { readonly kind: "not-staff"; readonly user: SessionUser }
  | { readonly kind: "granted"; readonly user: SessionUser; readonly staff: ActiveStaffMember };

export function decideStaffAccess(user: SessionUser | null, staff: ActiveStaffMember | null): StaffAccess {
  if (user === null) return { kind: "signed-out" };
  if (staff === null || staff.userId !== user.id) return { kind: "not-staff", user };
  return { kind: "granted", user, staff };
}
```

Create `apps/web/lib/names.ts`:
```ts
const FALLBACK_GREETING_NAME = "there";

/** First word of a person's name, for greetings. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || FALLBACK_GREETING_NAME;
}
```

Create `apps/web/lib/sign-in-limits.ts`:
```ts
import type { RateLimitRule } from "@brandbasket/db";

export type SignInSurface = "customer" | "staff";

export interface RateLimitCheck {
  readonly key: string;
  readonly rule: RateLimitRule;
}

const FIFTEEN_MINUTES = 15 * 60;

/**
 * Sign-in limits, checked in this order and stopping at the first block, so a blocked network cannot keep
 * creating rows by cycling emails:
 * 1. per network: one address trying many accounts;
 * 2. per account from that network: password guessing;
 * 3. per account from anywhere: a high ceiling, so a stranger cannot easily lock a customer out.
 * `email` must already be normalised (trimmed, lowercase), as parseSignInForm does.
 */
export function signInRateLimitChecks(
  surface: SignInSurface,
  email: string,
  clientIp: string,
): readonly RateLimitCheck[] {
  return [
    { key: `sign-in:${surface}:client:${clientIp}`, rule: { limit: 20, windowSeconds: FIFTEEN_MINUTES } },
    {
      key: `sign-in:${surface}:account-client:${email}:${clientIp}`,
      rule: { limit: 8, windowSeconds: FIFTEEN_MINUTES },
    },
    { key: `sign-in:${surface}:account:${email}`, rule: { limit: 50, windowSeconds: FIFTEEN_MINUTES } },
  ];
}

export function retryMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
```

- [ ] **Step 5: Run to see them pass**

Run:
```bash
pnpm --filter @brandbasket/web test
```
Expected: PASS.

- [ ] **Step 6: Server environment, database and auth singletons**

Create `apps/web/lib/server/env.ts`:
```ts
import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url("DATABASE_URL must be a postgresql:// URL"),
  DATABASE_URL_STAFF: z.url("DATABASE_URL_STAFF must be a postgresql:// URL"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  APP_ORIGIN: z.url("APP_ORIGIN must be an absolute URL"),
  ADMIN_ORIGIN: z.url("ADMIN_ORIGIN must be an absolute URL"),
});

export type ServerEnv = z.output<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parsed on first use, so the marketing build does not need dashboard secrets. */
export function serverEnv(): ServerEnv {
  if (cached === undefined) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid server configuration. Run "pnpm env:init" or check apps/web/.env.local.\n${z.prettifyError(parsed.error)}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}
```

Create `apps/web/lib/server/db.ts`:
```ts
import "server-only";
import { createDatabase, type Database } from "@brandbasket/db";
import { serverEnv } from "./env";

// Kept on globalThis so hot reloads in development reuse pools instead of opening new ones.
const holder = globalThis as typeof globalThis & {
  fynixAppDb?: Database;
  fynixStaffDb?: Database;
};

/** Customer-facing work. Bound by row-level security: scope queries with withUserScope / withTenantScope. */
export function getAppDb(): Database {
  holder.fynixAppDb ??= createDatabase(serverEnv().DATABASE_URL).db;
  return holder.fynixAppDb;
}

/** Staff console and system work only. Never call from customer-facing code paths. */
export function getStaffDb(): Database {
  holder.fynixStaffDb ??= createDatabase(serverEnv().DATABASE_URL_STAFF).db;
  return holder.fynixStaffDb;
}
```

Create `apps/web/lib/server/auth.ts`:
```ts
import "server-only";
import { createAuth, type Auth } from "@brandbasket/auth";
import { getAppDb } from "./db";
import { serverEnv } from "./env";

const holder = globalThis as typeof globalThis & { fynixAuth?: Auth };

export function getAuth(): Auth {
  if (holder.fynixAuth === undefined) {
    const env = serverEnv();
    holder.fynixAuth = createAuth({
      db: getAppDb(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_ORIGIN,
      trustedOrigins: [env.APP_ORIGIN, env.ADMIN_ORIGIN],
      nextCookies: true,
    });
  }
  return holder.fynixAuth;
}
```

- [ ] **Step 7: Session and access guards**

Create `apps/web/lib/server/session.ts`:
```ts
import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import type { SessionUser } from "@/lib/access";
import { getAuth } from "./auth";

/**
 * The signed-in user for this request, or null. Refresh is disabled because server components cannot
 * write cookies; sessions last their full lifetime and then require signing in again.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getAuth().api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });
  if (session === null) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
});
```

Create `apps/web/lib/server/customer-access.ts`:
```ts
import "server-only";
import { listMembershipsForUser } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { decideCustomerAccess, type CustomerAccess, type SessionUser, type TenantContext } from "@/lib/access";
import { getAppDb } from "./db";
import { getSessionUser } from "./session";

export const getCustomerAccess = cache(async (): Promise<CustomerAccess> => {
  const user = await getSessionUser();
  if (user === null) return decideCustomerAccess(null, []);
  return decideCustomerAccess(user, await listMembershipsForUser(getAppDb(), user.id));
});

export interface GrantedCustomer {
  readonly user: SessionUser;
  readonly tenant: TenantContext;
}

/**
 * Call in every customer page and layout: layouts and pages render independently, so a layout check alone
 * does not protect a page. Anyone without access is sent to /login, which explains why.
 */
export async function requireCustomerAccess(): Promise<GrantedCustomer> {
  const access = await getCustomerAccess();
  if (access.kind !== "granted") redirect("/login");
  return { user: access.user, tenant: access.tenant };
}
```

Create `apps/web/lib/server/staff-access.ts`:
```ts
import "server-only";
import { findActiveStaffMember, type ActiveStaffMember } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { decideStaffAccess, type SessionUser, type StaffAccess } from "@/lib/access";
import { getStaffDb } from "./db";
import { getSessionUser } from "./session";

export const getStaffAccess = cache(async (): Promise<StaffAccess> => {
  const user = await getSessionUser();
  if (user === null) return decideStaffAccess(null, null);
  return decideStaffAccess(user, await findActiveStaffMember(getStaffDb(), user.id));
});

export interface GrantedStaff {
  readonly user: SessionUser;
  readonly staff: ActiveStaffMember;
}

/** Call in every staff page and layout. Anyone without staff access is sent to /login, which explains why. */
export async function requireStaffAccess(): Promise<GrantedStaff> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") redirect("/login");
  return { user: access.user, staff: access.staff };
}
```

- [ ] **Step 8: Sign-in and sign-out**

Create `apps/web/lib/server/sign-in.ts`:
```ts
import "server-only";
import { isInvalidCredentialsError } from "@brandbasket/auth";
import { consumeRateLimit, type RateLimitResult } from "@brandbasket/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@/lib/client-ip";
import { parseSignInForm, type SignInFormState } from "@/lib/sign-in-form";
import { retryMessage, signInRateLimitChecks, type SignInSurface } from "@/lib/sign-in-limits";
import { getAuth } from "./auth";
import { getAppDb } from "./db";

export type SignInOutcome = SignInFormState | { readonly status: "signed-in" };

/** Consumes each limit in order and returns the first block, or null when every limit allows the attempt. */
async function firstBlockedLimit(
  surface: SignInSurface,
  email: string,
  clientIp: string,
): Promise<RateLimitResult | null> {
  const db = getAppDb();
  for (const check of signInRateLimitChecks(surface, email, clientIp)) {
    const result = await consumeRateLimit(db, check.key, check.rule);
    if (!result.allowed) return result;
  }
  return null;
}

export async function signInWithPassword(formData: FormData, surface: SignInSurface): Promise<SignInOutcome> {
  const parsed = parseSignInForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, email: parsed.email };

  const { email, password } = parsed.data;
  const requestHeaders = await headers();

  const blocked = await firstBlockedLimit(surface, email, clientIpFrom(requestHeaders));
  if (blocked !== null) {
    return { status: "error", message: retryMessage(blocked.retryAfterSeconds), email };
  }

  try {
    await getAuth().api.signInEmail({ body: { email, password }, headers: requestHeaders });
  } catch (error) {
    // Only a genuine credentials failure is shown as such; any other auth fault surfaces as a real error.
    if (isInvalidCredentialsError(error)) {
      return { status: "error", message: "That email and password don't match an account.", email };
    }
    throw error;
  }
  return { status: "signed-in" };
}
```

Create `apps/web/lib/server/sign-out.ts`:
```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

export async function signOut(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
```

- [ ] **Step 9: Checkpoint**

Run:
```bash
pnpm lint && pnpm --filter @brandbasket/web typecheck && pnpm --filter @brandbasket/web test
```
Expected: all pass.

---

### Task 12: Dashboard UI components

These components are shared by the staff console and the customer dashboard. They use the brand tokens from `app/globals.css` (paper, card, line, ink, accent) and the `heading-display` utility, with no eyebrow labels, following the site's design rules.

**Files:**
- Create: `apps/web/components/panel/auth-screen.tsx`, `sign-in-form.tsx`, `sign-out-button.tsx`, `panel-shell.tsx`, `panel-not-found.tsx`

- [ ] **Step 1: Sign-in screen layout**

Create `apps/web/components/panel/auth-screen.tsx`:
```tsx
import type { ReactElement, ReactNode } from "react";
import { Logo } from "@/components/logo";

interface AuthScreenProps {
  readonly title: ReactNode;
  readonly lede: string;
  readonly children: ReactNode;
}

export function AuthScreen({ title, lede, children }: AuthScreenProps): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-5 sm:px-8 sm:py-6">
      <header>
        <Logo />
      </header>
      <main id="main" className="grid flex-1 place-items-center py-12">
        <div className="w-full max-w-md">
          <h1 className="heading-display text-[clamp(2.5rem,7vw,3.5rem)]">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">{lede}</p>
          <div className="mt-10 rounded-3xl border border-line bg-card p-6 sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Sign-in form**

Create `apps/web/components/panel/sign-in-form.tsx`:
```tsx
"use client";

import { useActionState, type ReactElement } from "react";
import { initialSignInState, type SignInFormState } from "@/lib/sign-in-form";

interface SignInFormProps {
  readonly action: (state: SignInFormState, formData: FormData) => Promise<SignInFormState>;
  readonly submitLabel: string;
}

const ERROR_ID = "sign-in-error";
const INPUT_CLASSES =
  "mt-2 block w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent";

export function SignInForm({ action, submitLabel }: SignInFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialSignInState);
  const errorMessage = state.status === "error" ? state.message : null;
  const describedBy = errorMessage === null ? undefined : ERROR_ID;

  return (
    <form action={formAction} noValidate className="space-y-5">
      <div>
        <label htmlFor="sign-in-email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.status === "error" ? state.email : ""}
          aria-invalid={errorMessage !== null}
          aria-describedby={describedBy}
          className={INPUT_CLASSES}
        />
      </div>

      <div>
        <label htmlFor="sign-in-password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="sign-in-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={errorMessage !== null}
          aria-describedby={describedBy}
          className={INPUT_CLASSES}
        />
      </div>

      {errorMessage === null ? null : (
        <p id={ERROR_ID} role="alert" className="rounded-2xl bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-ink px-7 py-4 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep disabled:cursor-wait disabled:opacity-70"
      >
        {isPending ? "Signing in…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Sign-out button, shell and 404**

Create `apps/web/components/panel/sign-out-button.tsx`:
```tsx
import type { ReactElement } from "react";
import { signOut } from "@/lib/server/sign-out";

export function SignOutButton(): ReactElement {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors duration-300 ease-calm hover:bg-paper-deep"
      >
        Sign out
      </button>
    </form>
  );
}
```

Create `apps/web/components/panel/panel-shell.tsx`:
```tsx
import type { ReactElement, ReactNode } from "react";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/panel/sign-out-button";

interface PanelShellProps {
  /** Short name of the surface, shown beside the logo, e.g. "Staff console". */
  readonly surfaceName: string;
  readonly userEmail: string;
  readonly children: ReactNode;
}

export function PanelShell({ surfaceName, userEmail, children }: PanelShellProps): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-card/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden rounded-full bg-paper-deep px-3 py-1 text-xs font-medium text-ink-soft sm:inline">
              {surfaceName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink-soft md:inline">{userEmail}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
    </div>
  );
}
```

Create `apps/web/components/panel/panel-not-found.tsx`:
```tsx
import Link from "next/link";
import type { ReactElement } from "react";
import { Logo } from "@/components/logo";

export function PanelNotFound(): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-5 sm:px-8 sm:py-6">
      <header>
        <Logo />
      </header>
      <main id="main" className="grid flex-1 place-items-center py-12 text-center">
        <div className="max-w-md">
          <h1 className="heading-display text-[clamp(2.5rem,7vw,3.5rem)]">
            Nothing <em>here.</em>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            That page doesn’t exist. It may have moved, or the link might have a typo.
          </p>
          <Link href="/" className="link-underline mt-8 inline-block">
            Back to your dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Checkpoint**

Run:
```bash
pnpm lint && pnpm --filter @brandbasket/web typecheck
```
Expected: both pass.

---

### Task 13: Staff console routes (`admin.localhost:3000`)

**Files:**
- Create: `apps/web/lib/server/surface-host.ts`
- Create: `apps/web/app/admin-host/layout.tsx`, `not-found.tsx`, `[...missing]/page.tsx`
- Create: `apps/web/app/admin-host/login/page.tsx`, `login/actions.ts`
- Create: `apps/web/app/admin-host/(protected)/layout.tsx`, `(protected)/page.tsx`

- [ ] **Step 1: Surface layout, 404 and catch-all**

Create `apps/web/lib/server/surface-host.ts` (added after routing review; Task 14 reuses it):
```ts
import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { readOriginsFromEnv, resolveSurface, type Surface } from "@/lib/surfaces";

const origins = readOriginsFromEnv(process.env);

/**
 * Backup for proxy.ts, which skips static-file paths. A dashboard layout calls this so its routes render a 404 unless
 * the request arrived on that dashboard's own host. It is not an access check: layouts do not re-run on every
 * navigation and never wrap server actions, so every page and action still verifies access itself.
 */
export async function requireSurfaceHost(surface: Exclude<Surface, "marketing">): Promise<void> {
  const host = (await headers()).get("host");
  if (origins === null || resolveSurface(host, origins) !== surface) notFound();
}
```

Create `apps/web/app/admin-host/layout.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { requireSurfaceHost } from "@/lib/server/surface-host";

export const metadata: Metadata = {
  title: { default: "Staff console", template: "%s · Fynix staff" },
  robots: { index: false, follow: false },
};

interface AdminHostLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminHostLayout({ children }: AdminHostLayoutProps): Promise<ReactElement> {
  await requireSurfaceHost("admin");
  return <>{children}</>;
}
```

Create `apps/web/app/admin-host/not-found.tsx`:
```tsx
import type { ReactElement } from "react";
import { PanelNotFound } from "@/components/panel/panel-not-found";

export default function AdminNotFound(): ReactElement {
  return <PanelNotFound />;
}
```

Create `apps/web/app/admin-host/[...missing]/page.tsx`:
```tsx
import { notFound } from "next/navigation";

/** Unmatched staff console URLs render the console's own 404 instead of the marketing one. */
export default function AdminMissingPage(): never {
  notFound();
}
```

- [ ] **Step 2: Sign-in page and action**

Create `apps/web/app/admin-host/login/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import type { SignInFormState } from "@/lib/sign-in-form";
import { signInWithPassword } from "@/lib/server/sign-in";

export async function signInStaff(_previous: SignInFormState, formData: FormData): Promise<SignInFormState> {
  const outcome = await signInWithPassword(formData, "staff");
  if (outcome.status === "signed-in") redirect("/");
  return outcome;
}
```

Create `apps/web/app/admin-host/login/page.tsx`:
```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { AuthScreen } from "@/components/panel/auth-screen";
import { SignInForm } from "@/components/panel/sign-in-form";
import { SignOutButton } from "@/components/panel/sign-out-button";
import { getStaffAccess } from "@/lib/server/staff-access";
import { signInStaff } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage(): Promise<ReactElement> {
  const access = await getStaffAccess();
  if (access.kind === "granted") redirect("/");

  if (access.kind === "not-staff") {
    return (
      <AuthScreen
        title={
          <>
            No staff <em>access.</em>
          </>
        }
        lede={`${access.user.email} is signed in, but it isn’t a Fynix staff account. Sign out and use your staff account instead.`}
      >
        <SignOutButton />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={
        <>
          Staff <em>sign in.</em>
        </>
      }
      lede="For the Fynix team. Customers sign in to their own dashboard."
    >
      <SignInForm action={signInStaff} submitLabel="Sign in" />
    </AuthScreen>
  );
}
```

- [ ] **Step 3: Protected layout and overview**

Create `apps/web/app/admin-host/(protected)/layout.tsx`:
```tsx
import type { ReactElement, ReactNode } from "react";
import { PanelShell } from "@/components/panel/panel-shell";
import { requireStaffAccess } from "@/lib/server/staff-access";

interface AdminProtectedLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminProtectedLayout({ children }: AdminProtectedLayoutProps): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  return (
    <PanelShell surfaceName="Staff console" userEmail={user.email}>
      {children}
    </PanelShell>
  );
}
```

Create `apps/web/app/admin-host/(protected)/page.tsx`:
```tsx
import { countPlatformRecords, type StaffRole } from "@brandbasket/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { firstName } from "@/lib/names";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Overview" };

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  builder: "Builder",
  support: "Support",
};

interface StatProps {
  readonly label: string;
  readonly value: number;
}

function Stat({ label, value }: StatProps): ReactElement {
  return (
    <div className="rounded-3xl border border-line bg-card p-6">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-2 font-serif text-5xl tracking-tight">{value}</dd>
    </div>
  );
}

export default async function AdminOverviewPage(): Promise<ReactElement> {
  const { user, staff } = await requireStaffAccess();
  const counts = await countPlatformRecords(getStaffDb());

  return (
    <>
      <h1 className="heading-display text-[clamp(2.5rem,6vw,4rem)]">
        Hello, <em>{firstName(user.name)}.</em>
      </h1>
      <p className="mt-3 text-lg text-ink-soft">Role: {ROLE_LABELS[staff.role]}</p>
      <dl className="mt-10 grid gap-4 sm:grid-cols-2">
        <Stat label="Businesses" value={counts.businesses} />
        <Stat label="Active staff" value={counts.activeStaff} />
      </dl>
    </>
  );
}
```

- [ ] **Step 4: Checkpoint**

Run:
```bash
pnpm lint && pnpm --filter @brandbasket/web typecheck
```
Expected: both pass.

---

### Task 14: Customer dashboard routes (`app.localhost:3000`)

**Files:**
- Create: `apps/web/app/app-host/layout.tsx`, `not-found.tsx`, `[...missing]/page.tsx`
- Create: `apps/web/app/app-host/login/page.tsx`, `login/actions.ts`
- Create: `apps/web/app/app-host/(protected)/layout.tsx`, `(protected)/page.tsx`

- [ ] **Step 1: Surface layout, 404 and catch-all**

Create `apps/web/app/app-host/layout.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { requireSurfaceHost } from "@/lib/server/surface-host";

export const metadata: Metadata = {
  title: { default: "Your dashboard", template: "%s · Fynix" },
  robots: { index: false, follow: false },
};

interface AppHostLayoutProps {
  readonly children: ReactNode;
}

export default async function AppHostLayout({ children }: AppHostLayoutProps): Promise<ReactElement> {
  await requireSurfaceHost("app");
  return <>{children}</>;
}
```

Create `apps/web/app/app-host/not-found.tsx`:
```tsx
import type { ReactElement } from "react";
import { PanelNotFound } from "@/components/panel/panel-not-found";

export default function AppNotFound(): ReactElement {
  return <PanelNotFound />;
}
```

Create `apps/web/app/app-host/[...missing]/page.tsx`:
```tsx
import { notFound } from "next/navigation";

/** Unmatched dashboard URLs render the dashboard's own 404 instead of the marketing one. */
export default function AppMissingPage(): never {
  notFound();
}
```

- [ ] **Step 2: Sign-in page and action**

Create `apps/web/app/app-host/login/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import type { SignInFormState } from "@/lib/sign-in-form";
import { signInWithPassword } from "@/lib/server/sign-in";

export async function signInCustomer(_previous: SignInFormState, formData: FormData): Promise<SignInFormState> {
  const outcome = await signInWithPassword(formData, "customer");
  if (outcome.status === "signed-in") redirect("/");
  return outcome;
}
```

Create `apps/web/app/app-host/login/page.tsx`:
```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { AuthScreen } from "@/components/panel/auth-screen";
import { SignInForm } from "@/components/panel/sign-in-form";
import { SignOutButton } from "@/components/panel/sign-out-button";
import { getCustomerAccess } from "@/lib/server/customer-access";
import { signInCustomer } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function AppLoginPage(): Promise<ReactElement> {
  const access = await getCustomerAccess();
  if (access.kind === "granted") redirect("/");

  if (access.kind === "no-business") {
    return (
      <AuthScreen
        title={
          <>
            Almost <em>there.</em>
          </>
        }
        lede={`${access.user.email} is signed in, but it isn’t linked to a business yet. Contact Fynix and we’ll sort it out.`}
      >
        <SignOutButton />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={
        <>
          Welcome <em>back.</em>
        </>
      }
      lede="Sign in to your Fynix dashboard. New to Fynix? Your account is created from the private setup link we send after your call."
    >
      <SignInForm action={signInCustomer} submitLabel="Sign in" />
    </AuthScreen>
  );
}
```

- [ ] **Step 3: Protected layout and home**

Create `apps/web/app/app-host/(protected)/layout.tsx`:
```tsx
import type { ReactElement, ReactNode } from "react";
import { PanelShell } from "@/components/panel/panel-shell";
import { requireCustomerAccess } from "@/lib/server/customer-access";

interface AppProtectedLayoutProps {
  readonly children: ReactNode;
}

export default async function AppProtectedLayout({ children }: AppProtectedLayoutProps): Promise<ReactElement> {
  const { user, tenant } = await requireCustomerAccess();
  return (
    <PanelShell surfaceName={tenant.businessName} userEmail={user.email}>
      {children}
    </PanelShell>
  );
}
```

Create `apps/web/app/app-host/(protected)/page.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { firstName } from "@/lib/names";
import { requireCustomerAccess } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Home" };

export default async function AppHomePage(): Promise<ReactElement> {
  const { user, tenant } = await requireCustomerAccess();

  return (
    <>
      <h1 className="heading-display text-[clamp(2.5rem,6vw,4rem)]">
        Hello, <em>{firstName(user.name)}.</em>
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
        This is the Fynix dashboard for {tenant.businessName}. Your next step will appear here as your website
        takes shape.
      </p>
    </>
  );
}
```

- [ ] **Step 4: Checkpoint**

Run:
```bash
pnpm lint && pnpm --filter @brandbasket/web typecheck && pnpm build
```
Expected: all pass. The build route table now also lists `/admin-host`, `/admin-host/login`, `/admin-host/[...missing]`, `/app-host`, `/app-host/login` and `/app-host/[...missing]` as dynamic (ƒ) routes.

---

### Task 15: README and full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README for the workspace**

Replace `README.md` with:
````markdown
# Fynix

Fynix builds and looks after websites for local businesses. This repository holds the marketing site, the customer dashboard and the staff console.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4, zod, PostgreSQL, Drizzle and Better Auth, in a pnpm workspace.

## Local setup

Requires Node 24+, pnpm 10 and a local PostgreSQL where your macOS user can create databases and roles.

```bash
pnpm install
pnpm env:init                                              # writes apps/web/.env.local with fresh secrets
psql -h localhost -d postgres -c "CREATE DATABASE fynix_platform" # skip if it already exists
psql -h localhost -d postgres -c "CREATE DATABASE fynix_platform_test"
pnpm db:roles                                              # creates fynix_app and fynix_staff
pnpm db:migrate && pnpm db:migrate:test
pnpm staff:create --email you@example.com --name "Your Name" --role admin
pnpm dev
```

Use Chrome or Firefox, which resolve `*.localhost` to your machine:

| Surface          | URL                          |
| ---------------- | ---------------------------- |
| Marketing site   | http://localhost:3000        |
| Customer sign-in | http://app.localhost:3000    |
| Staff console    | http://admin.localhost:3000  |

## Scripts

| Command                   | What it does                                                   |
| ------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                | Start the web app                                              |
| `pnpm build`              | Production build of the web app                                |
| `pnpm lint`               | ESLint                                                         |
| `pnpm typecheck`          | Type-check every workspace package                             |
| `pnpm test`               | Unit tests (Vitest)                                            |
| `pnpm test:integration`   | Migrate the test database, then run database-backed tests     |
| `pnpm db:migrate`         | Apply migrations to the development database                   |
| `pnpm staff:create`       | Create a staff account, or grant staff access to an existing one |

## Where things live

- `apps/web/app/(marketing)/`: marketing routes (home, case studies, services, pricing, about, contact)
- `apps/web/app/app-host/` and `apps/web/app/admin-host/`: customer dashboard and staff console, reached through their own hostnames (see `apps/web/proxy.ts`)
- `apps/web/components/`: shared UI; `components/panel/` is dashboard UI
- `apps/web/content/`: page copy and structured content
- `apps/web/lib/pricing.ts`: every price on the site, in US cents. Change prices here only.
- `packages/db/`: schema, migrations, row-level security, scoped queries, rate limiting
- `packages/auth/`: Better Auth setup. Accounts can only be created by Fynix Digital's own server code.
- `docs/superpowers/`: the platform spec and implementation plans

## Content rules

- Case studies marked `concept` are illustrative and are always labelled on the page.
- Never add invented clients, results, testimonials or logos. Add a `client` case study only for a real, live site with its public URL.
````

- [ ] **Step 2: Run every automated check**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build
```
Expected: ESLint clean; `tsc` passes in `@brandbasket/web`, `@brandbasket/db` and `@brandbasket/auth`; unit tests pass in all three; integration tests pass (23 in db, 5 in auth; review fixes added tests beyond the counts stated in earlier tasks); the build succeeds.

- [ ] **Step 3: Manual verification in the browser**

Start `pnpm dev`, then in Chrome:

1. `http://localhost:3000`: the marketing home page looks exactly as before, with header, footer and smooth scrolling. `http://localhost:3000/pricing` works. `http://localhost:3000/app-host` shows a 404.
2. `http://admin.localhost:3000`: redirects to `/login` and shows **Staff sign in.**
   - Sign in with a wrong password: *"That email and password don't match an account."* The email stays filled in.
   - Sign in with the account from Task 9: **Hello, <first name>.**, "Role: Admin", and counts (Businesses 0, Active staff 1).
3. `http://admin.localhost:3000/anything`: the dashboard-styled "Nothing here." page.
4. `http://app.localhost:3000`: redirects to `/login` and shows **Welcome back.**
   - Sign in with the staff account: "Almost there." explains that the account isn't linked to a business, with a Sign out button.
   - Sign out: you return to the sign-in form.
   - The admin host session is separate: `http://admin.localhost:3000` is still signed in, because cookies are host-only.
5. On `http://app.localhost:3000/login`, submit a wrong password 9 times for the same email: the 9th attempt shows *"Too many sign-in attempts. Try again in … minutes."*
6. Sign out of the staff console: you return to **Staff sign in.**

Expected: every step behaves as described. If step 5 has locked your own email, wait 15 minutes or clear it with:
```bash
set -a && source apps/web/.env.local && set +a && psql "$DATABASE_URL_OWNER" -c "DELETE FROM rate_limit_buckets"
```

- [ ] **Step 4: Final checkpoint**

Do not commit. Report to the user:
- the results of Step 2 (lint ✓ · typecheck ✓ · unit tests ✓ · integration tests ✓ · build ✓);
- the manual checks from Step 3;
- that Phase 1B (lead form, Calendly, setup invites, email outbox) is the next plan.
