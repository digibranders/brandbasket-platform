# Tenant site renderer implementation plan

> **RETIRED 2026-09-21, the same day it was built.** A product decision moved customer websites off this platform
> onto per-client static projects, and dropped customer-editable site content in favour of blog posts only. Every
> task below was built, verified live, and then removed. Kept as the record of what existed and why it went.
>
> **What was removed:** `app/site-host/`, `components/site/`, `lib/server/site-{content,tenant}.ts`,
> `packages/db/src/queries/sites.ts`, the `sites` surface in `surfaces.ts`/`proxy.ts`, and the `fynix_sites`
> Postgres role. Migrations 0030 and 0031 were collapsed rather than shipped as a create-then-destroy pair: 0030
> had never been committed, so the history now ends at 0029 as though the role never existed. The role was dropped
> from the cluster by hand, because roles are cluster-wide and a per-database migration cannot revoke grants in the
> other database — which is exactly why `DROP ROLE` failed the first time and why roles live in `setup-roles.ts`,
> not in migrations.
>
> **What survived:** the free `<slug>.fynix.digital` address. The platform still generates and records it during
> onboarding; it is now served by the client's own static project instead of by this app. So
> `FYNIX_SUBDOMAIN_ROOT`, `temporarySubdomainFor` and `isTemporarySubdomain` all stay.
>
> **Still true and worth reading:** the Known debt section at the end. Several items outlived the renderer, in
> particular Payload's local-disk storage and the customer-facing 404.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve each customer's website from their own hostname, rendered from the Payload content they edit on their dashboard, so a save on `/content` changes a real page.

**Architecture:** A third host surface (`sites`) inside `apps/platform`, alongside `app-host` and `admin-host`. Middleware stays pure routing and never touches the database: any host that is not the app or admin origin is rewritten to `/site-host/...`, and the page resolves the hostname to a business itself. Reads go through a new read-only Postgres role (`fynix_sites`) for the main database, and through Payload's Local API for content.

**Why a surface and not `apps/sites` yet:** the design spec puts the renderer in its own app so a bad dashboard deploy cannot take customer sites down, and so the renderer holds no write credentials. That split also requires extracting Payload's config and collections into `@brandbasket/cms`, which the admin-repo-split plan already owns. Doing the split first would mean no working loop for days. This plan closes the loop now behind a clean seam — `lib/server/site-*.ts` has no imports from `app-host` or `admin-host` — so extracting it later is a move, not a rewrite. **Task 7 records the hardening debt; do not mark this plan done without reading it.**

**Tech Stack:** Next.js 16 App Router, Payload 3 Local API, Drizzle + Postgres, Vitest.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/db/src/roles.ts` | add `fynix_sites` to the role registry |
| `packages/db/migrations/0030_sites_role_grants.sql` | read-only SELECT grants for the renderer |
| `packages/db/src/queries/sites.ts` | hostname → business lookup (the only main-DB read the renderer makes) |
| `apps/platform/lib/surfaces.ts` | add the `sites` surface and its host resolution |
| `apps/platform/proxy.ts` | route unknown hosts to `sites`; do not send `noindex` for them |
| `apps/platform/lib/server/db.ts` | `getSitesDb()` on the read-only role |
| `apps/platform/lib/server/site-tenant.ts` | resolve the request's hostname to a business |
| `apps/platform/lib/server/site-content.ts` | read pages, gallery and blog for a business |
| `apps/platform/app/site-host/page.tsx` | the home page |
| `apps/platform/app/site-host/[slug]/page.tsx` | any other page by slug |
| `apps/platform/app/site-host/media/[mediaId]/route.ts` | serve images (Payload's `Media.access.read` denies everything) |

---

### Task 1: The read-only renderer role

**Files:**
- Modify: `packages/db/src/roles.ts`
- Create: `packages/db/migrations/0030_sites_role_grants.sql`
- Modify: `packages/db/src/local-env-template.ts`
- Test: `packages/db/src/local-env-template.test.ts`

- [x] **Step 1: Write the failing test**

In `packages/db/src/local-env-template.test.ts`, add to the existing `describe`:

```ts
it("gives the renderer a read-only connection", () => {
  const env = parseEnvFile(localEnvTemplate(SECRETS));
  expect(env.DATABASE_URL_SITES).toBe("postgresql://fynix_sites:sites-pass@localhost:5432/fynix_platform");
});
```

Add `sitesPassword: "sites-pass"` to the `SECRETS` fixture at the top of that file.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @brandbasket/db vitest run src/local-env-template.test.ts`
Expected: FAIL — `expected undefined to be 'postgresql://fynix_sites:...'`

- [x] **Step 3: Register the role**

In `packages/db/src/roles.ts`, add to `APPLICATION_ROLES`:

```ts
  // The public site renderer. Reads only, and only the three tables migration 0030 grants it.
  { name: "fynix_sites", passwordEnv: "FYNIX_SITES_PASSWORD" },
```

In `packages/db/src/local-env-template.ts`, add `readonly sitesPassword: string;` to the secrets interface, generate it alongside the others, and add these two lines to the generated file next to the other runtime connections:

```ts
    `FYNIX_SITES_PASSWORD=${secrets.sitesPassword}`,
    `DATABASE_URL_SITES=${roleUrl("fynix_sites", secrets.sitesPassword, DEV_DATABASE)}`,
```

- [x] **Step 4: Write the migration**

Create `packages/db/migrations/0030_sites_role_grants.sql`:

```sql
-- The public site renderer. It resolves a hostname to a business and reads nothing else from this database:
-- all page content lives in Payload's separate database. SELECT only, on three tables, with row-level security
-- still applying because the role never owns tables and is NOBYPASSRLS (see scripts/setup-roles.ts).
GRANT USAGE ON SCHEMA public TO fynix_sites;

GRANT SELECT ("id", "name", "slug", "currency") ON "businesses" TO fynix_sites;
GRANT SELECT ("id", "business_id", "hostname", "status", "is_primary", "removed_at") ON "domains" TO fynix_sites;
GRANT SELECT ("id", "business_id", "status") ON "projects" TO fynix_sites;

CREATE POLICY "businesses_sites_read" ON "businesses" FOR SELECT TO fynix_sites USING (true);
CREATE POLICY "domains_sites_read" ON "domains" FOR SELECT TO fynix_sites USING (true);
CREATE POLICY "projects_sites_read" ON "projects" FOR SELECT TO fynix_sites USING (true);
```

- [x] **Step 5: Register the migration in Drizzle's journal**

Hand-written `.sql` files are invisible to the migrator until they are listed in `packages/db/migrations/meta/_journal.json`. `pnpm db:migrate` will print "Migrations applied" and silently do nothing otherwise. Append an entry to `entries`, keeping `idx` in sequence with the tag:

```json
    { "idx": 30, "version": "7", "when": 1789800000000, "tag": "0030_sites_role_grants", "breakpoints": true }
```

Use `Date.now()` for `when`.

- [x] **Step 6: Apply it and create the role**

Run: `pnpm db:roles && pnpm db:migrate && pnpm db:migrate:test`

Then add the two new variables to your own `apps/platform/.env.local` by hand (the template only affects freshly generated files):

```
FYNIX_SITES_PASSWORD=<any 48-char hex string>
DATABASE_URL_SITES=postgresql://fynix_sites:<that password>@localhost:5432/fynix_platform
```

Re-run `pnpm db:roles` so the role's password matches what you just wrote.

- [x] **Step 7: Verify the grant is real, not assumed**

Do not skip this: a migration that was never registered in the journal still prints "Migrations applied".

```bash
psql "$DATABASE_URL_SITES" -c "select hostname from domains limit 1"          # expect a row
psql "$DATABASE_URL_SITES" -c "update domains set status='pending'"           # permission denied
psql "$DATABASE_URL_SITES" -c "select * from payments limit 1"                # permission denied
psql "$DATABASE_URL_SITES" -c "select * from users limit 1"                   # permission denied
psql "$DATABASE_URL_SITES" -c "select owner_confirmed_at from domains limit 1" # permission denied
```

The last one proves the grant is column-level, not table-wide.

- [x] **Step 8: Run the db tests**

Run: `pnpm --filter @brandbasket/db test`
Expected: PASS

---

### Task 2: Hostname to business

**Files:**
- Create: `packages/db/src/queries/sites.ts`
- Create: `packages/db/src/sites.integration.test.ts`
- Modify: `packages/db/src/index.ts`

- [x] **Step 1: Write the failing test**

Create `packages/db/src/sites.integration.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { findSiteByHostname } from "./queries/sites";
import { freshDatabase, seedBusiness } from "./testing";

describe("findSiteByHostname", () => {
  let db: Awaited<ReturnType<typeof freshDatabase>>;

  beforeEach(async () => {
    db = await freshDatabase();
  });

  it("finds a business by its live primary hostname", async () => {
    const { businessId } = await seedBusiness(db, { name: "Aster Physio", hostname: "asterphysio.com" });
    await expect(findSiteByHostname(db, "asterphysio.com")).resolves.toMatchObject({ businessId, name: "Aster Physio" });
  });

  it("ignores the port and the case of the host", async () => {
    const { businessId } = await seedBusiness(db, { name: "Aster Physio", hostname: "asterphysio.com" });
    await expect(findSiteByHostname(db, "AsterPhysio.com:3002")).resolves.toMatchObject({ businessId });
  });

  it("falls back to the slug for a *.localhost address", async () => {
    const { businessId } = await seedBusiness(db, { name: "Aster Physio", hostname: "asterphysio.com" });
    await expect(findSiteByHostname(db, "aster-physio.localhost:3002")).resolves.toMatchObject({ businessId });
  });

  it("returns null for a hostname nobody owns", async () => {
    await expect(findSiteByHostname(db, "nobody.example")).resolves.toBeNull();
  });

  it("does not serve a domain that was removed", async () => {
    await seedBusiness(db, { name: "Gone", hostname: "gone.com", removed: true });
    await expect(findSiteByHostname(db, "gone.com")).resolves.toBeNull();
  });

  it("reports how the host matched and what the project status is", async () => {
    await seedBusiness(db, { name: "Aster Physio", hostname: "asterphysio.com", projectStatus: "building" });
    await expect(findSiteByHostname(db, "asterphysio.com")).resolves.toMatchObject({
      matchedBy: "domain",
      projectStatus: "building",
    });
    await expect(findSiteByHostname(db, "aster-physio.localhost")).resolves.toMatchObject({ matchedBy: "slug" });
  });
});
```

`seedBusiness` must accept an optional `projectStatus` (default `"live"`) and create the project row with it.

**As built, this differed from the sketch above and the built version is the one to follow.** There is no
`freshDatabase`/`seedBusiness` helper in this repo; integration tests use `openTestDatabases()` +
`resetTestDatabase(dbs.owner)`. So the test file seeds through `dbs.owner.db` with a local `seedSite` helper, and
`TestDatabases` gained a `sites` handle (from `DATABASE_URL_SITES_TEST`) alongside `app`, `staff`, `publicRole` and
`owner`. **Every read in the test goes through `dbs.sites.db`, not the owner's connection** — that is the point: a
missing grant then fails in the test rather than in production. This also means `DATABASE_URL_SITES_TEST` must
exist in `.env.local`, and `openTestDatabases` asserts it names the same `_test` database as the others.

Read `packages/db/src/onboarding.integration.test.ts` first and reuse whatever helper it uses to build a business with a domain; add `seedBusiness` to `packages/db/src/testing/index.ts` only if no equivalent exists.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @brandbasket/db vitest run --config vitest.integration.config.ts src/sites.integration.test.ts`
Expected: FAIL — `findSiteByHostname is not a function`

- [x] **Step 3: Write the implementation**

Create `packages/db/src/queries/sites.ts`:

```ts
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, domains, projects } from "../schema";
import type { ProjectStatus } from "./projects";

/** The one thing the public renderer reads from this database: which business a hostname belongs to. */
export interface SiteTenant {
  readonly businessId: string;
  readonly name: string;
  readonly slug: string;
  /** The business's latest project status, or null when it has no project. Drives `isSiteServable`. */
  readonly projectStatus: ProjectStatus | null;
  /** `domain` = a real `domains` row; `slug` = the `<slug>.localhost` preview address. */
  readonly matchedBy: "domain" | "slug";
}

/**
 * Whether this request may be served to the public.
 *
 * A real domain serves only once the site is live: until then the build is half-finished and nobody outside the
 * team should reach it. The slug address is the preview and always serves, which is what staff and the customer
 * use to look at the build before it launches.
 *
 * Pure on purpose — the rule is the thing worth testing, not the query around it.
 */
export function isSiteServable(site: SiteTenant): boolean {
  return site.matchedBy === "slug" || site.projectStatus === "live";
}

const LOCALHOST_SUFFIX = ".localhost";

/** Lowercases and drops the port. `null` when the value is not a usable host. */
function normaliseSiteHost(rawHost: string): string | null {
  const host = rawHost.trim().toLowerCase().split(":")[0];
  return host === undefined || host === "" ? null : host;
}

const TENANT_COLUMNS = {
  businessId: businesses.id,
  name: businesses.name,
  slug: businesses.slug,
  projectStatus: projects.status,
} as const;

/**
 * Resolves a request's Host header to a business, or null when no live domain matches. Takes the read-only
 * renderer connection. A `<slug>.localhost` address resolves by slug instead, so every business is reachable in
 * local development without touching DNS or /etc/hosts; that branch can never fire in production, where no host
 * ends in `.localhost`.
 */
export async function findSiteByHostname(db: Database, rawHost: string): Promise<SiteTenant | null> {
  const host = normaliseSiteHost(rawHost);
  if (host === null) return null;

  const matched = await db
    .select(TENANT_COLUMNS)
    .from(domains)
    .innerJoin(businesses, eq(businesses.id, domains.businessId))
    .leftJoin(projects, eq(projects.businessId, businesses.id))
    .where(and(sql`lower(${domains.hostname}) = ${host}`, eq(domains.isPrimary, true), isNull(domains.removedAt)))
    .limit(1);
  const found = matched[0];
  if (found !== undefined) return { ...found, matchedBy: "domain" };

  if (!host.endsWith(LOCALHOST_SUFFIX)) return null;
  const slug = host.slice(0, -LOCALHOST_SUFFIX.length);
  if (slug === "" || slug.includes(".")) return null;

  const bySlug = await db
    .select(TENANT_COLUMNS)
    .from(businesses)
    .leftJoin(projects, eq(projects.businessId, businesses.id))
    .where(eq(businesses.slug, slug))
    .limit(1);
  const site = bySlug[0];
  return site === undefined ? null : { ...site, matchedBy: "slug" };
}
```

- [x] **Step 4: Export it**

In `packages/db/src/index.ts`, add:

```ts
export { findSiteByHostname, isSiteServable, type SiteTenant } from "./queries/sites";
```

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @brandbasket/db vitest run --config vitest.integration.config.ts src/sites.integration.test.ts`
Expected: PASS, 5 tests

- [x] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): resolve a hostname to a business for the site renderer"
```

---

### Task 3: Routing unknown hosts to the renderer

**Files:**
- Modify: `apps/platform/lib/surfaces.ts`
- Test: `apps/platform/lib/surfaces.test.ts`
- Modify: `apps/platform/proxy.ts`
- Test: `apps/platform/proxy.test.ts`

- [x] **Step 1: Write the failing surface test**

Add to `apps/platform/lib/surfaces.test.ts`:

```ts
describe("resolveSurface with the sites surface", () => {
  const origins = { app: "http://app.localhost:3001", admin: "http://admin.localhost:3001" };

  it("still routes the two dashboard hosts", () => {
    expect(resolveSurface("app.localhost:3001", origins)).toBe("app");
    expect(resolveSurface("admin.localhost:3001", origins)).toBe("admin");
  });

  it("treats every other host as a customer site", () => {
    expect(resolveSurface("asterphysio.com", origins)).toBe("sites");
    expect(resolveSurface("aster-physio.localhost:3002", origins)).toBe("sites");
  });

  it("still refuses a host it cannot parse", () => {
    expect(resolveSurface("not a host", origins)).toBeNull();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @brandbasket/platform vitest run lib/surfaces.test.ts`
Expected: FAIL — `expected null to be 'sites'`

- [x] **Step 3: Add the surface**

In `apps/platform/lib/surfaces.ts`:

```ts
export type Surface = "app" | "admin" | "sites";
```

```ts
export const SURFACE_PATH_PREFIX = {
  app: "/app-host",
  admin: "/admin-host",
  sites: "/site-host",
} as const;
```

Replace the final `return null` of `resolveSurface` with:

```ts
  // Anything that is not a dashboard host is a customer's own website. This is routing, not authorization: the
  // page looks the hostname up and 404s when no business owns it. The lookup cannot happen here, because this
  // runs in middleware, which has no database connection.
  return "sites";
```

- [x] **Step 4: Write the failing proxy test**

Add to `apps/platform/proxy.test.ts`:

```ts
it("rewrites a customer hostname into the site surface", () => {
  const response = handle("asterphysio.com", "/about");
  expect(response.headers.get("x-middleware-rewrite")).toContain("/site-host/about");
});

it("lets a customer site be indexed", () => {
  expect(handle("asterphysio.com", "/").headers.get("X-Robots-Tag")).toBeNull();
});

it("keeps the dashboards out of search results", () => {
  expect(handle("app.localhost:3001", "/").headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
});
```

Match `handle` to whatever helper that file already defines for building a request and calling the proxy.

- [x] **Step 5: Run it to verify it fails**

Run: `pnpm --filter @brandbasket/platform vitest run proxy.test.ts`
Expected: FAIL — the robots assertion fails, because `rewriteTo` sets the header unconditionally.

- [x] **Step 6: Make robots conditional**

In `apps/platform/proxy.ts`, change `rewriteTo` and its two call sites:

```ts
/**
 * `indexable` is false for the dashboards, which must never appear in search results, and true for a customer's
 * own website, whose entire purpose is being found. Getting this backwards would quietly deindex every client
 * site we host, so it is asserted in proxy.test.ts.
 */
function rewriteTo(request: NextRequest, targetPath: string, search: string, indexable: boolean): NextResponse {
  const response = NextResponse.rewrite(new URL(`${targetPath}${search}`, request.url));
  if (!indexable) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
```

The Payload-admin branch becomes `return rewriteTo(request, pathname, search, false);` and the final return becomes:

```ts
    return rewriteTo(request, rewritePathForSurface(surface, pathname), search, surface === "sites");
```

- [x] **Step 7: Run both test files**

Run: `pnpm --filter @brandbasket/platform vitest run proxy.test.ts lib/surfaces.test.ts`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add apps/platform/lib/surfaces.ts apps/platform/lib/surfaces.test.ts apps/platform/proxy.ts apps/platform/proxy.test.ts
git commit -m "feat(platform): route unknown hosts to the site renderer"
```

---


**As built:** typecheck caught that `readOriginsFromEnv` was keyed on `Surface`, which now includes `sites` — a
surface with no origin variable and never any. Added `ConfiguredSurface = Exclude<Surface, "sites">` and keyed the
env reader on that instead, so the type says out loud that `sites` is the fallback rather than a configured host.

### Task 4: The read-only connection and tenant resolution

**Files:**
- Modify: `apps/platform/lib/server/env.ts`
- Modify: `apps/platform/lib/server/db.ts`
- Create: `apps/platform/lib/server/site-tenant.ts`

- [x] **Step 1: Add the variable**

In `apps/platform/lib/server/env.ts`, add `DATABASE_URL_SITES` to the schema exactly as `DATABASE_URL_STAFF` is declared beside it.

- [x] **Step 2: Add the connection**

In `apps/platform/lib/server/db.ts`, copy the existing `getStaffDb` export and change the variable it reads to `DATABASE_URL_SITES`, naming it `getSitesDb`, with this comment:

```ts
/** The public renderer's connection: SELECT on three tables and nothing else (migration 0030). Never use this
 * for a dashboard read — it cannot see most of the schema — and never use a writing connection for a site page. */
```

- [x] **Step 3: Write the tenant resolver**

Create `apps/platform/lib/server/site-tenant.ts`:

```ts
import "server-only";
import { findSiteByHostname, isSiteServable, type SiteTenant } from "@brandbasket/db";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getSitesDb } from "./db";

/**
 * The business whose website this request is for, from the Host header. Read once per request: the layout and the
 * page both ask for it.
 *
 * 404s in two cases, deliberately indistinguishable from outside: nobody owns this hostname, and the hostname is a
 * real domain whose site has not launched yet. The second is the important one — without it, pointing a domain at
 * us would publish a half-finished build. Staff and the customer look at an unlaunched build through the slug
 * address instead, which `isSiteServable` always allows.
 */
export const requireSiteTenant = cache(async (): Promise<SiteTenant> => {
  const host = (await headers()).get("host");
  const tenant = host === null ? null : await findSiteByHostname(getSitesDb(), host);
  if (tenant === null || !isSiteServable(tenant)) notFound();
  return tenant;
});
```

- [x] **Step 4: Typecheck**

Run: `pnpm --filter @brandbasket/platform typecheck`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/platform/lib/server/env.ts apps/platform/lib/server/db.ts apps/platform/lib/server/site-tenant.ts
git commit -m "feat(platform): read-only site connection and tenant resolution"
```

---


**As built, beyond the plan:** the plan ended this task at a typecheck, but `requireSiteTenant` is the only
gate between anonymous traffic on an arbitrary hostname and a tenant's content, so it got
`lib/server/site-tenant.test.ts` (5 tests): servable host resolves; unknown host 404s; found-but-not-servable 404s;
no Host header 404s *without* querying; and the read goes through `getSitesDb`. The new variables were also added
to `apps/platform/.env.example`, since `DATABASE_URL_SITES` is required and a missing one now fails env validation
at boot.

### Task 5: Reading a business's published content

**Files:**
- Create: `apps/platform/lib/server/site-content.ts`
- Test: `apps/platform/lib/server/site-content.test.ts`

The customer's own editor reads the same Payload collections in `apps/platform/lib/server/content.ts`. This reader differs in two ways: it returns **every** field, not just `customerEditable` ones (the public site shows all of them), and it has no session — the business id comes from the hostname.

- [x] **Step 1: Write the failing test**

Create `apps/platform/lib/server/site-content.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { sitePageFrom } from "./site-content";

vi.mock("server-only", () => ({}));

describe("sitePageFrom", () => {
  it("keeps every field, not only the customer-editable ones", () => {
    const page = sitePageFrom({
      id: 7,
      title: "Home",
      navLabel: "Home",
      slug: "home",
      updatedAt: "2026-09-21T00:00:00Z",
      fields: [
        { key: "heroHeadline", label: "Hero headline", customerEditable: true, type: "text", textValue: "Walk in" },
        { key: "legalName", label: "Legal name", customerEditable: false, type: "text", textValue: "Aster LLP" },
      ],
    });
    expect(page.fields.map((field) => field.key)).toEqual(["heroHeadline", "legalName"]);
  });

  it("points an image at this surface's own media route", () => {
    const page = sitePageFrom({
      id: 7,
      title: "Home",
      navLabel: "Home",
      slug: "home",
      updatedAt: "2026-09-21T00:00:00Z",
      fields: [{ key: "hero", label: "Hero", customerEditable: false, type: "image", image: { id: 12, width: 800, height: 600 } }],
    });
    expect(page.fields[0]?.image?.url).toBe("/media/12");
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @brandbasket/platform vitest run lib/server/site-content.test.ts`
Expected: FAIL — cannot find module `./site-content`

- [x] **Step 3: Write the reader**

Create `apps/platform/lib/server/site-content.ts`. Open `apps/platform/lib/server/content.ts` beside it and mirror its `RawPage`, `RawPageField` and `RawMediaRelation` interfaces rather than inventing new shapes.

```ts
import "server-only";
import { getPayload } from "payload";
import { cache } from "react";
import config from "@/payload.config";

export interface SiteImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface SiteField {
  readonly key: string;
  readonly label: string;
  readonly type: "text" | "image";
  readonly textValue: string | null;
  readonly image: SiteImage | null;
}

export interface SitePage {
  readonly id: string;
  readonly title: string;
  readonly navLabel: string;
  readonly slug: string;
  readonly fields: readonly SiteField[];
}

interface RawMediaRelation {
  readonly id: string | number;
  readonly width?: number | null;
  readonly height?: number | null;
}

interface RawPageField {
  readonly key: string;
  readonly label: string;
  readonly customerEditable: boolean;
  readonly type: "text" | "image";
  readonly textValue?: string | null;
  readonly image?: RawMediaRelation | string | number | null;
}

interface RawPage {
  readonly id: string | number;
  readonly title: string;
  readonly navLabel: string;
  readonly slug: string;
  readonly updatedAt: string;
  readonly fields?: readonly RawPageField[] | null;
}

/** Payload's `Media.access.read` denies every request, so a raw upload url 403s. Images are served by this
 * surface's own route instead, which reads through the Local API with `overrideAccess: true`. */
function siteImageFrom(image: RawMediaRelation | string | number | null | undefined): SiteImage | null {
  if (image === null || image === undefined || typeof image !== "object") return null;
  return { url: `/media/${String(image.id)}`, width: image.width ?? 0, height: image.height ?? 0 };
}

/** Exported for its own test: the shaping is the part worth checking without a database. */
export function sitePageFrom(page: RawPage): SitePage {
  return {
    id: String(page.id),
    title: page.title,
    navLabel: page.navLabel,
    slug: page.slug,
    fields: (page.fields ?? []).map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      textValue: field.textValue ?? null,
      image: siteImageFrom(field.image),
    })),
  };
}

/**
 * Every page this business has, in position order. Scoped explicitly to `businessId`, which came from the
 * hostname — exactly the discipline content.ts documents for the dashboard reader, and the only isolation
 * boundary there is.
 */
export const getSitePages = cache(async (businessId: string): Promise<readonly SitePage[]> => {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "pages",
    where: { businessId: { equals: businessId } },
    sort: "position",
    depth: 1,
    limit: 200,
    overrideAccess: true,
  });
  return (result.docs as unknown as readonly RawPage[]).map(sitePageFrom);
});
```

- [x] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @brandbasket/platform vitest run lib/server/site-content.test.ts`
Expected: PASS, 2 tests

- [x] **Step 5: Commit**

```bash
git add apps/platform/lib/server/site-content.ts apps/platform/lib/server/site-content.test.ts
git commit -m "feat(platform): read a business's published pages for its own site"
```

---

### Task 6: The pages and the image route

**Files:**
- Create: `apps/platform/app/site-host/layout.tsx`
- Create: `apps/platform/app/site-host/page.tsx`
- Create: `apps/platform/app/site-host/[slug]/page.tsx`
- Create: `apps/platform/app/site-host/media/[mediaId]/route.ts`

- [x] **Step 1: Write the image route**

`apps/platform/lib/server/payload-media-serving.ts` already exports `servePayloadMediaFile(mediaId, businessId | null)`, where a non-null business id scopes the read to that business's uploads. The admin route passes `null` because staff are unscoped; this route must pass the tenant's id, so one customer's hostname can never serve another's images.

Create `apps/platform/app/site-host/media/[mediaId]/route.ts`:

```ts
import "server-only";
import { servePayloadMediaFile } from "@/lib/server/payload-media-serving";
import { requireSiteTenant } from "@/lib/server/site-tenant";

/**
 * `GET /media/{mediaId}` on a customer's own hostname: the image bytes for that business, and only that business.
 *
 * Payload's raw `/api/media/file/<filename>` url cannot be used — `collections/Media.ts`'s `access.read` denies
 * every request on purpose — so this reads through the Local API exactly as the two dashboard media routes do.
 * Unlike them it is public, which is why the business id comes from `requireSiteTenant()` (the Host header) and
 * is passed as the scope: an unscoped read here would let any hostname enumerate every tenant's uploads.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/site-host/media/[mediaId]">,
): Promise<Response> {
  const tenant = await requireSiteTenant();
  const { mediaId } = await context.params;
  return servePayloadMediaFile(mediaId, tenant.businessId);
}
```

Confirm the helper's second parameter really scopes the read before relying on it: open `apps/platform/lib/server/payload-media-serving.ts` and check that a non-null business id is applied to the Payload query. If it is not, fix the helper first and add a test for it.

- [x] **Step 2: Write the shared layout**

Create `apps/platform/app/site-host/layout.tsx`:

```tsx
import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { getSitePages } from "@/lib/server/site-content";
import { requireSiteTenant } from "@/lib/server/site-tenant";

export default async function SiteLayout({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  const tenant = await requireSiteTenant();
  const pages = await getSitePages(tenant.businessId);

  return (
    <html lang="en">
      <body>
        <header>
          <p>{tenant.name}</p>
          <nav aria-label="Pages">
            {pages.map((page) => (
              <Link key={page.id} href={page.slug === "home" ? "/" : `/${page.slug}`}>
                {page.navLabel}
              </Link>
            ))}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

This deliberately carries no styling. Choosing the visual design of customer sites is a separate decision (see Task 7); this plan only proves the content pipeline.

- [x] **Step 3: Write a shared page body**

Create `apps/platform/app/site-host/page-body.tsx`:

```tsx
import Image from "next/image";
import type { ReactElement } from "react";
import type { SitePage } from "@/lib/server/site-content";

export function PageBody({ page }: { readonly page: SitePage }): ReactElement {
  return (
    <article>
      <h1>{page.title}</h1>
      {page.fields.map((field) =>
        field.type === "text" ? (
          <p key={field.key}>{field.textValue}</p>
        ) : field.image === null ? null : (
          <Image
            key={field.key}
            src={field.image.url}
            alt={field.label}
            width={field.image.width}
            height={field.image.height}
            unoptimized
          />
        ),
      )}
    </article>
  );
}
```

- [x] **Step 4: Write the two page routes**

Create `apps/platform/app/site-host/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { PageBody } from "./page-body";
import { getSitePages } from "@/lib/server/site-content";
import { requireSiteTenant } from "@/lib/server/site-tenant";

export default async function SiteHomePage(): Promise<ReactElement> {
  const tenant = await requireSiteTenant();
  const pages = await getSitePages(tenant.businessId);
  const home = pages.find((page) => page.slug === "home") ?? pages[0];
  if (home === undefined) notFound();
  return <PageBody page={home} />;
}
```

Create `apps/platform/app/site-host/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { PageBody } from "../page-body";
import { getSitePages } from "@/lib/server/site-content";
import { requireSiteTenant } from "@/lib/server/site-tenant";

export default async function SiteSlugPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<ReactElement> {
  const { slug } = await params;
  const tenant = await requireSiteTenant();
  const pages = await getSitePages(tenant.businessId);
  const page = pages.find((candidate) => candidate.slug === slug);
  if (page === undefined) notFound();
  return <PageBody page={page} />;
}
```

- [x] **Step 5: Full checkpoint**

Run: `pnpm lint && pnpm --filter @brandbasket/platform typecheck && pnpm test && pnpm --filter @brandbasket/db test:integration && pnpm --filter @brandbasket/platform build`
Expected: all PASS

- [x] **Step 6: Walk it in the browser**

1. `pnpm dev`
2. Open `http://admin.localhost:3001/clients/<businessId>/content` and confirm a page with slug `home` and at least one text field exists.
3. Open `http://<that business's slug>.localhost:3001/` — the field's value renders.
4. Sign in as that customer, edit the field on `/content`, save.
5. Reload the site URL. **The new text is there.** That is the loop closing.
6. Open `http://unknown-business.localhost:3001/` — expect 404.

- [x] **Step 7: Commit**

```bash
git add apps/platform/app/site-host
git commit -m "feat(platform): render a customer's site from their own content"
```

---


**As built, deviations from the sketch above:**

- `PageBody` lives at `components/site/page-body.tsx`, not inside `app/site-host/`, matching how `components/panel/`
  already holds the dashboards' components.
- `site-content.test.ts` must stub `@/payload.config` and `payload`. `sitePageFrom` is pure, but importing its
  module pulls in the Payload config, which validates the entire server environment at load and throws in a bare
  Vitest process.
- The layout calls `requireSurfaceHost("sites")` as defence in depth, the same as `app-host` and `admin-host`, and
  sets no `robots` metadata — these pages exist to be found.
- `[slug]/page.tsx` also exports `generateMetadata`, so a page's own title reaches the browser tab.

**Verified live, not just green:** `launch-check.localhost:3001` rendered the customer's own headline; signing in as
that customer, editing the field on `/content` and reloading the site showed the new text. A second, unlaunched
business (`task8-walkthrough-b`, status `onboarding`) served through its slug address with its own distinct
content, proving both the preview path and tenant isolation.

### Task 7: Record what this deliberately did not do

**Files:**
- Modify: `docs/superpowers/plans/2026-09-21-tenant-site-renderer.md`

- [x] **Step 1: Write the debt down in this file, under a new "Known debt" heading**

These are real and must not be forgotten:

1. **The renderer shares a process with the dashboards.** The design spec wants `apps/sites` so a bad dashboard deploy cannot take customer sites down. Extracting it needs `@brandbasket/cms` (Payload config plus collections), which the admin-repo-split plan already owns.
2. **No design.** Customer sites render unstyled. The open question — one shared template versus per-business code — is still undecided, and the marketing site promises "a design built around your business, not a template."
3. **A customer's save is instantly public.** No publish step, no cache, no version history, no rollback, no staff review.
4. **Gallery and blog are not rendered.** Only pages are. Both collections already carry `businessId` and read the same way.
5. **No sitemap, robots.txt, canonical URL or per-page metadata.** The brand is "be found first"; none of the findability basics exist yet.
6. **Images are served uncached** through the media route, one database read per image per request.
7. **The preview address only exists locally.** `isSiteServable` lets any `<slug>.localhost` address through as the
   pre-launch preview, and gates real domains on `status = 'live'`. In production there is no equivalent host yet,
   so a business that has not launched has no address at all — including one on a free `<slug>.fynix.digital`
   address, since that is stored as a real `domains` row and is therefore gated like any other. Production needs a
   dedicated preview host (`<slug>.preview.fynix.digital`) before the admin's preview link can point at the renderer
   instead of a hand-pasted URL.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-09-21-tenant-site-renderer.md
git commit -m "docs: record the renderer's known debt"
```

---

## Known debt

Written down at the end of the build, including things that only surfaced while building. Nothing here is a bug in
what shipped; all of it is scope this plan deliberately left out. **Read this before treating the renderer as
production-ready.**

### Blocks production

1. **Payload stores uploads on local disk.** `servePayloadMediaFile` reads bytes off the filesystem, resolving
   Payload's own `staticDir`. On Vercel that directory is ephemeral, so every customer image dies on redeploy.
   `collections/Media.ts` already carries this warning for the dashboards; the renderer makes it customer-facing.
   If a storage adapter lands with `disableLocalStorage: true`, that helper must change to fetch from the adapter.
2. **The preview address only exists locally.** `isSiteServable` lets any `<slug>.localhost` through as the
   pre-launch preview and gates real domains on `status = 'live'`. Production has no equivalent host, so an
   unlaunched business has no address at all — including one on a free `<slug>.fynix.digital` address, which is
   stored as a real `domains` row and therefore gated like any other. Production needs a dedicated preview host
   (`<slug>.preview.fynix.digital`) before the admin's preview link can point at the renderer instead of a
   hand-pasted URL.
3. **Wildcard DNS and certificates.** Nothing serves `*.fynix.digital` or a customer's own domain yet, and there is
   no certificate provisioning for customer domains.

### Architecture

4. **The renderer shares a process with the dashboards.** The design spec wants `apps/sites` so a bad dashboard
   deploy cannot take customer sites down, and so the renderer holds no write credentials. It does hold them today
   — `getSitesDb()` is read-only, but `getAppDb()` and `getStaffDb()` live in the same process. Extracting needs
   `@brandbasket/cms` (Payload config plus collections), which the admin-repo-split plan owns. The seam is clean:
   `lib/server/site-*.ts`, `app/site-host/` and `components/site/` import nothing from the dashboards.
5. **The renderer's RLS policies are permissive** (`USING (true)`). Unlike `fynix_app`, this role serves
   anonymous traffic and has no session business id to scope to, so the tenant boundary is the hostname lookup in
   `findSiteByHostname`, not the database. The grants are column-level and SELECT-only to keep the blast radius
   small, but that lookup is the whole isolation story — treat changes to it as security changes.
6. **Role naming is inconsistent.** `fynix_sites` is new-brand; `fynix_app`, `fynix_staff` and
   `fynix_public` keep their original names deliberately (renaming needs a migration). Expect the mismatch.

### Product decisions still open

7. **No design.** Customer sites render close to unstyled. The open question — one shared template versus
   per-business code — is undecided, and the marketing site promises "a design built around your business, not a
   template". Deciding this is the next real fork.
8. **A customer's save is instantly public.** No publish step, no cache, no version history, no rollback, no staff
   review. A client can change their own live homepage at 2am and nobody sees it first. This matches the admin
   editor's own copy ("no separate publish step"), so it is a decision to confirm rather than an accident.

### Missing surface

9. **Gallery and blog are not rendered.** Only pages are. Both collections already carry `businessId` and read the
   same way, so this is additive.
10. **Image fields are read-only for customers.** They render on the site but the dashboard gives no way to replace
    one. The gallery does work.
11. **A customer's 404 is Next's raw default.** Verified: a bad path on a live customer site shows the unstyled
    "404: This page could not be found." There is no `app/site-host/not-found.tsx`.
12. **No findability basics.** No sitemap, no robots.txt, no canonical URL, and no per-page description — only a
    title. The brand is "be found first"; none of this exists yet.
13. **No customer site can use the slug `admin`.** `isPayloadAdminPath` runs before the surface rewrite and 404s
    `/admin` on every host but the admin one. Correct default, silent constraint.

### Performance

14. **Nothing is cached.** Every page request queries Payload, and every image request costs a database read plus a
    file read. `getSitePages` is memoised per request only. Fine locally; needs revalidation strategy at scale.
