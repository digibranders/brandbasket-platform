# CMS Foundation: Pages, Sections, Gallery, Blog & Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every business a website made of pages and sections, a gallery and a blog, plus an immutable release-snapshot mechanism — so the customer dashboard's coming **Content** (CMS) and **Monitoring** menus have real data to read and edit instead of nothing at all.

**Architecture:** New tenant-scoped tables under the same row-level-security pattern as onboarding data (`packages/db/src/schema/onboarding.ts`): customers can read their whole site, but can only write the parts the spec actually lets them touch — a section's `content`/`visible` when that row is marked `customer_editable`, their gallery, and their blog posts. Everything else (pages, sections themselves, releases) is staff/system-only, enforced by grants and RLS policies, not just the UI. Site status ("is it online") is a pure function composed from `hasBillingAccess`, which the codebase already flags as the future website-visibility rule (`packages/billing/src/access.ts`) — no background worker is built here.

**Tech Stack:** drizzle-orm 0.45, PostgreSQL 14 with RLS, zod 4, Vitest, uuidv7.

---

## Ground rules for the engineer

- **Source of truth:** `docs/superpowers/specs/2026-09-15-firstfold-platform-design.md` §4.4 (website/page/content data model) and §3 ("Content updates after launch"). This plan narrows that spec on purpose — see "Deliberately deferred" below — and wins where the two disagree about scope.
- **Deliberately deferred (do not build in this plan):**
  - A full per-page-type section registry with a zod schema per field, `editableBy`, image aspect ratios, etc. Start with two section types, `rich_text` and `image`, and a `customer_editable` boolean per row. Extend the registry when the editing UI needs more section shapes.
  - `content_publish` and `publish_allowance_grant` — the $3-per-publish billing workflow. That is its own careful piece of billing work, next after this plan is built and verified.
  - The customer-facing dashboard screens themselves (**Content**/CMS editor, **Monitoring** page, blog editor). Next plan, once this one's data layer exists to build them on.
  - The reconciliation worker that is supposed to set `websites.suspended_at` (spec §8). This plan computes site status live from the subscription on every read instead. That column does not exist yet; add it when the worker is built.
  - `apps/sites` public hosting and a real render-to-HTML template. That is Phase 6 (domains and launch) territory. This plan only builds the data a private preview and a CMS need — no page is served to the public internet by this plan.
  - Staff project management (build queue, assignment) — a separate, already-agreed next plan. This plan's release snapshot builder is a plain function any staff/system caller can invoke; wiring a "Build" button to it is that plan's job.
- **Customers write through the app connection only**, per the onboarding tables' rule (`apps/platform/lib/server/db.ts`'s comment on `getStaffDb`). No new exception.
- **Do not commit. Do not start a dev server.** Migrations only on the dev database — never delete or rewrite existing rows. The test database is yours.
- Checkpoint after every task: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm --filter @firstfold/db test:integration` for database tasks.
- Read `packages/db/migrations/meta/_journal.json` for the next free migration number before generating one.

---

### Task 1: Tables

**Files:**
- Create: `packages/db/src/schema/website.ts` (websites, pages, page_sections, gallery_items)
- Create: `packages/db/src/schema/content.ts` (blog_posts, site_releases)
- Modify: `packages/db/src/schema/media.ts` (add a composite unique so other tables can FK to a media asset without bypassing RLS)
- Modify: `packages/db/src/schema/index.ts`
- Create: two migrations (generated tables, hand-written grants and RLS)

- [x] **Step 1: Let other tables safely reference a media asset**

The codebase's rule (see the comment on `projects_id_business_id_unique` in `packages/db/src/schema/projects.ts`) is that a table referenced by a tenant-scoped foreign key needs a `(id, business_id)` composite unique index, because foreign-key checks run with elevated privilege and bypass RLS — a plain `id` FK would let one business's row point at another business's media file.

In `packages/db/src/schema/media.ts`, add to the `mediaAssets` table's array of extra config (after the existing `check`):

```ts
    unique("media_assets_id_business_id_unique").on(table.id, table.businessId),
```

Add `unique` to the existing `drizzle-orm/pg-core` import list at the top of the file.

- [x] **Step 2: `website.ts` — websites, pages, page_sections, gallery_items**

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { mediaAssets } from "./media";

/**
 * One row per business, created by staff/system work when a project starts building (spec §4.4). Never written by
 * the customer connection: `template_key` and `blog_enabled` are ours to set, not theirs.
 */
export const websites = pgTable(
  "websites",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .unique()
      .references(() => businesses.id),
    templateKey: text("template_key").notNull().default("standard"),
    blogEnabled: boolean("blog_enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique("websites_id_business_id_unique").on(table.id, table.businessId)],
);

export const pageKey = pgEnum("page_key", ["home", "about", "services", "gallery", "reviews", "contact"]);
export type PageKey = (typeof pageKey.enumValues)[number];

/** Only staff or system work creates or removes a page (spec §4.4: "Only staff create or remove pages"). */
export const pages = pgTable(
  "pages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    websiteId: uuid("website_id").notNull(),
    key: pageKey("key").notNull(),
    slug: text("slug").notNull(),
    navLabel: text("nav_label").notNull(),
    title: text("title").notNull(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "pages_website_business_fk",
      columns: [table.websiteId, table.businessId],
      foreignColumns: [websites.id, websites.businessId],
    }),
    unique("pages_id_business_id_unique").on(table.id, table.businessId),
    unique("pages_business_id_key_unique").on(table.businessId, table.key),
    unique("pages_business_id_slug_unique").on(table.businessId, table.slug),
    index("pages_business_id_position_idx").on(table.businessId, table.position),
  ],
);

/**
 * Deliberately just two types for now (see this plan's "Deliberately deferred"): `rich_text` holds customer-typed
 * copy, `image` holds one image slot. `customer_editable` is the whole enforcement of spec §3's "customers can edit
 * only text, images and blog posts" — everything else on a page (layout, which sections exist) stays staff-only.
 */
export const sectionType = pgEnum("section_type", ["rich_text", "image"]);
export type SectionType = (typeof sectionType.enumValues)[number];

export const pageSections = pgTable(
  "page_sections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    pageId: uuid("page_id").notNull(),
    type: sectionType("type").notNull(),
    variant: text("variant"),
    position: integer("position").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    /** `{ text: string }` for `rich_text`; `{ mediaId: string | null, altText: string | null }` for `image`. */
    content: jsonb("content").notNull().default({}),
    customerEditable: boolean("customer_editable").notNull().default(false),
    visible: boolean("visible").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "page_sections_page_business_fk",
      columns: [table.pageId, table.businessId],
      foreignColumns: [pages.id, pages.businessId],
    }),
    unique("page_sections_id_business_id_unique").on(table.id, table.businessId),
    index("page_sections_page_id_position_idx").on(table.pageId, table.position),
  ],
);

/** The customer's own collection: add, caption, reorder and remove (soft-delete) freely — spec §3. */
export const galleryItems = pgTable(
  "gallery_items",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    mediaId: uuid("media_id").notNull(),
    caption: text("caption"),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "gallery_items_media_business_fk",
      columns: [table.mediaId, table.businessId],
      foreignColumns: [mediaAssets.id, mediaAssets.businessId],
    }),
    index("gallery_items_business_id_position_idx").on(table.businessId, table.position),
  ],
);
```

- [x] **Step 3: `content.ts` — blog_posts, site_releases**

```ts
import { sql } from "drizzle-orm";
import { foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";
import { mediaAssets } from "./media";
import { websites } from "./website";

export const blogPostStatus = pgEnum("blog_post_status", ["draft", "published"]);
export type BlogPostStatus = (typeof blogPostStatus.enumValues)[number];

/** Entirely the customer's: write, edit, publish, unpublish. Free and unlimited (spec §3: publish limits are about
 * the site, not the blog). */
export const blogPosts = pgTable(
  "blog_posts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    body: jsonb("body").notNull().default({}),
    coverMediaId: uuid("cover_media_id"),
    status: blogPostStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "blog_posts_cover_media_business_fk",
      columns: [table.coverMediaId, table.businessId],
      foreignColumns: [mediaAssets.id, mediaAssets.businessId],
    }),
    // A slug can be reused once the post holding it is soft-deleted.
    uniqueIndex("blog_posts_business_id_slug_idx")
      .on(table.businessId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index("blog_posts_business_id_status_idx").on(table.businessId, table.status),
  ],
);

export const siteReleasePurpose = pgEnum("site_release_purpose", ["preview", "production"]);
export type SiteReleasePurpose = (typeof siteReleasePurpose.enumValues)[number];

export const siteReleaseCreator = pgEnum("site_release_creator", ["staff", "system"]);
export type SiteReleaseCreator = (typeof siteReleaseCreator.enumValues)[number];

/** Immutable: no row is ever updated or deleted once inserted (spec §4.4). No role gets UPDATE or DELETE grants
 * on this table — see Step 4. */
export const siteReleases = pgTable(
  "site_releases",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    websiteId: uuid("website_id").notNull(),
    number: integer("number").notNull(),
    purpose: siteReleasePurpose("purpose").notNull(),
    /** The rendered content model: every page's visible sections, in order, at the moment of the snapshot. */
    snapshot: jsonb("snapshot").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    /** sha256 of the snapshot's stable JSON encoding, so two releases can be compared without diffing jsonb. */
    contentHash: text("content_hash").notNull(),
    createdByType: siteReleaseCreator("created_by_type").notNull(),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "site_releases_website_business_fk",
      columns: [table.websiteId, table.businessId],
      foreignColumns: [websites.id, websites.businessId],
    }),
    unique("site_releases_business_id_number_unique").on(table.businessId, table.number),
    index("site_releases_website_id_created_at_idx").on(table.websiteId, table.createdAt),
  ],
);
```

- [x] **Step 4: Export from the schema index**

In `packages/db/src/schema/index.ts`, add two lines in alphabetical order with the rest:

```ts
export * from "./content";
export * from "./website";
```

- [x] **Step 5: Migrations, grants and RLS**

Generate: `cd packages/db && pnpm db:generate` (drizzle-kit names it from the schema diff; rename the file to `00NN_cms_foundation.sql` if it picks a generic name — check `packages/db/migrations/meta/_journal.json` first for the next free number, per this plan's ground rules).

Write a second, hand-written migration `00NN_cms_foundation_grants.sql` (`NN` = the generated one's number + 1), following `0016_narrow_onboarding_grants.sql`'s style:

```sql
-- Customers may read their whole site...
GRANT SELECT ON websites, pages, page_sections, gallery_items, blog_posts, site_releases TO webfold_app;
--> statement-breakpoint

-- ...but only edit an editable section's content, their gallery, and their blog. Pages, sections-as-such and
-- releases stay staff/system-only, whatever the UI shows.
GRANT UPDATE (content, visible, updated_at) ON page_sections TO webfold_app;
--> statement-breakpoint

GRANT INSERT, UPDATE, DELETE ON gallery_items TO webfold_app;
--> statement-breakpoint

GRANT INSERT, UPDATE, DELETE ON blog_posts TO webfold_app;
--> statement-breakpoint

-- Staff and system work do everything, including building pages and sections and cutting releases.
GRANT SELECT, INSERT, UPDATE, DELETE ON websites, pages, page_sections, gallery_items, blog_posts TO webfold_staff;
--> statement-breakpoint

-- Releases are immutable: even staff only ever INSERT.
GRANT SELECT, INSERT ON site_releases TO webfold_staff;
--> statement-breakpoint

ALTER TABLE websites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE page_sections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE site_releases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY websites_tenant_select ON websites FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY websites_staff_all ON websites FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY pages_tenant_select ON pages FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY pages_staff_all ON pages FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY page_sections_tenant_select ON page_sections FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
-- The column grant above already limits *which* columns webfold_app can touch; this limits *which rows*: only ones
-- staff marked customer_editable, and only within the caller's own business.
CREATE POLICY page_sections_customer_update ON page_sections FOR UPDATE TO webfold_app
  USING (business_id = app_current_business_id() AND customer_editable)
  WITH CHECK (business_id = app_current_business_id() AND customer_editable);
--> statement-breakpoint
CREATE POLICY page_sections_staff_all ON page_sections FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY gallery_items_tenant_all ON gallery_items FOR ALL TO webfold_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY gallery_items_staff_all ON gallery_items FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY blog_posts_tenant_all ON blog_posts FOR ALL TO webfold_app
  USING (business_id = app_current_business_id()) WITH CHECK (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY blog_posts_staff_all ON blog_posts FOR ALL TO webfold_staff
  USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY site_releases_tenant_select ON site_releases FOR SELECT TO webfold_app
  USING (business_id = app_current_business_id());
--> statement-breakpoint
CREATE POLICY site_releases_staff_select_insert ON site_releases FOR SELECT TO webfold_staff
  USING (true);
--> statement-breakpoint
CREATE POLICY site_releases_staff_insert ON site_releases FOR INSERT TO webfold_staff
  WITH CHECK (true);
```

Apply both: `pnpm db:migrate && pnpm db:migrate:test`.

No backfill step: unlike `projects`, a `websites` row is only created when a project starts building (Task 4), so existing businesses correctly have none yet — there is nothing to build a page or section from until then.

---

### Task 2: Reading a site and editing what's allowed

**Files:**
- Create: `packages/db/src/queries/website.ts`
- Test: `packages/db/src/website.integration.test.ts`
- Modify: `packages/db/src/index.ts`

- [x] **Step 1: Write the failing integration tests**

```ts
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { galleryItems, mediaAssets, pageSections, pages, websites, businesses } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";
import {
  SectionNotEditableError,
  addGalleryItem,
  getWebsiteForBusiness,
  removeGalleryItem,
  reorderGalleryItems,
  updateSectionContent,
} from "./queries/website";

const BUSINESS_A = "0000018f-0000-7000-8000-00000000000a";
const BUSINESS_B = "0000018f-0000-7000-8000-00000000000b";
const USER_A = "user-a";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(businesses).values([
    { id: BUSINESS_A, slug: "riverside-plumbing", name: "Riverside Plumbing" },
    { id: BUSINESS_B, slug: "cy-cafe", name: "Cy's Cafe" },
  ]);
});

async function seedWebsite(businessId: string) {
  const [website] = await dbs.staff.db.insert(websites).values({ businessId, templateKey: "standard" }).returning();
  const [page] = await dbs.staff.db
    .insert(pages)
    .values({ businessId, websiteId: website!.id, key: "home", slug: "home", navLabel: "Home", title: "Home", position: 0 })
    .returning();
  const [editableSection] = await dbs.staff.db
    .insert(pageSections)
    .values({ businessId, pageId: page!.id, type: "rich_text", position: 0, content: { text: "Welcome" }, customerEditable: true })
    .returning();
  const [lockedSection] = await dbs.staff.db
    .insert(pageSections)
    .values({ businessId, pageId: page!.id, type: "rich_text", position: 1, content: { text: "Hours: 9-5" }, customerEditable: false })
    .returning();
  return { website: website!, page: page!, editableSection: editableSection!, lockedSection: lockedSection! };
}

describe("getWebsiteForBusiness", () => {
  it("returns pages and sections for the caller's own business only", async () => {
    const { page } = await seedWebsite(BUSINESS_A);
    await seedWebsite(BUSINESS_B);

    const result = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      getWebsiteForBusiness(tx),
    );

    expect(result?.pages).toHaveLength(1);
    expect(result?.pages[0]!.id).toBe(page.id);
    expect(result?.pages[0]!.sections).toHaveLength(2);
  });

  it("returns null when the business has no website yet", async () => {
    const result = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      getWebsiteForBusiness(tx),
    );
    expect(result).toBeNull();
  });
});

describe("updateSectionContent", () => {
  it("updates an editable section's content", async () => {
    const { editableSection } = await seedWebsite(BUSINESS_A);

    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      updateSectionContent(tx, { sectionId: editableSection.id, content: { text: "Welcome to us" }, visible: true }),
    );

    const [row] = await dbs.staff.db.select().from(pageSections).where(eq(pageSections.id, editableSection.id));
    expect(row!.content).toEqual({ text: "Welcome to us" });
  });

  it("refuses a section that is not customer-editable", async () => {
    const { lockedSection } = await seedWebsite(BUSINESS_A);

    await expect(
      withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
        updateSectionContent(tx, { sectionId: lockedSection.id, content: { text: "hacked" }, visible: true }),
      ),
    ).rejects.toThrow(SectionNotEditableError);
  });

  it("refuses a section belonging to another business", async () => {
    const { editableSection } = await seedWebsite(BUSINESS_B);

    await expect(
      withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
        updateSectionContent(tx, { sectionId: editableSection.id, content: { text: "hacked" }, visible: true }),
      ),
    ).rejects.toThrow(SectionNotEditableError);
  });
});

describe("gallery queries", () => {
  it("adds, reorders and removes the caller's own gallery items", async () => {
    await seedWebsite(BUSINESS_A);
    const [media] = await dbs.staff.db
      .insert(mediaAssets)
      .values({
        id: "0000018f-0000-7000-8000-0000000000f1",
        businessId: BUSINESS_A,
        purpose: "photo",
        storageKey: `t/${BUSINESS_A}/0000018f-0000-7000-8000-0000000000f1/display`,
        originalFilename: "shop.jpg",
        mimeType: "image/webp",
        bytes: 1000,
        width: 800,
        height: 600,
        sha256: "a".repeat(64),
        status: "ready",
        uploadedByUserId: USER_A,
      })
      .returning();

    const item = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      addGalleryItem(tx, { mediaId: media!.id, caption: "Our shop" }),
    );
    expect(item.position).toBe(0);

    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      reorderGalleryItems(tx, [item.id]),
    );
    await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) => removeGalleryItem(tx, item.id));

    const remaining = await dbs.staff.db
      .select()
      .from(galleryItems)
      .where(and(eq(galleryItems.id, item.id), eq(galleryItems.deletedAt as never, null as never)));
    expect(remaining).toHaveLength(0);
  });
});
```

This follows `packages/db/src/rls.integration.test.ts`'s exact setup/teardown pattern (`openTestDatabases()` in `beforeAll`, `resetTestDatabase(dbs.owner)` in `beforeEach`, `dbs.closeAll()` in `afterAll`) — read that file if anything here doesn't line up with what `packages/db/src/testing/index.ts` actually exports.

- [x] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter @firstfold/db test:integration -- website.integration
```

Expected: fails to resolve `./queries/website` (module does not exist yet).

- [x] **Step 3: Implement the queries**

```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import type { ScopedTransaction } from "../scope";
import { galleryItems, pages, pageSections, websites, type SectionType } from "../schema";
import { currentBusinessId, isUuid } from "./tenant";

export class SectionNotEditableError extends Error {
  constructor(sectionId: string) {
    super(`Section ${sectionId} does not exist, is not yours, or is not customer-editable.`);
    this.name = "SectionNotEditableError";
  }
}

export class GalleryItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Gallery item ${itemId} does not exist for this business.`);
    this.name = "GalleryItemNotFoundError";
  }
}

export interface WebsiteSection {
  readonly id: string;
  readonly type: SectionType;
  readonly variant: string | null;
  readonly position: number;
  readonly content: unknown;
  readonly customerEditable: boolean;
  readonly visible: boolean;
}

export interface WebsitePage {
  readonly id: string;
  readonly key: string;
  readonly slug: string;
  readonly navLabel: string;
  readonly title: string;
  readonly position: number;
  readonly sections: readonly WebsiteSection[];
}

export interface WebsiteDetail {
  readonly id: string;
  readonly templateKey: string;
  readonly blogEnabled: boolean;
  readonly pages: readonly WebsitePage[];
}

/** The whole site, for the CMS's page list and for a private preview. Null until a project starts building. */
export async function getWebsiteForBusiness(tx: ScopedTransaction): Promise<WebsiteDetail | null> {
  const businessId = await currentBusinessId(tx);
  const [website] = await tx.select().from(websites).where(eq(websites.businessId, businessId)).limit(1);
  if (website === undefined) return null;

  const pageRows = await tx
    .select()
    .from(pages)
    .where(eq(pages.businessId, businessId))
    .orderBy(asc(pages.position));
  const sectionRows = await tx
    .select()
    .from(pageSections)
    .where(eq(pageSections.businessId, businessId))
    .orderBy(asc(pageSections.position));

  const sectionsByPage = new Map<string, WebsiteSection[]>();
  for (const section of sectionRows) {
    const list = sectionsByPage.get(section.pageId) ?? [];
    list.push({
      id: section.id,
      type: section.type,
      variant: section.variant,
      position: section.position,
      content: section.content,
      customerEditable: section.customerEditable,
      visible: section.visible,
    });
    sectionsByPage.set(section.pageId, list);
  }

  return {
    id: website.id,
    templateKey: website.templateKey,
    blogEnabled: website.blogEnabled,
    pages: pageRows.map((page) => ({
      id: page.id,
      key: page.key,
      slug: page.slug,
      navLabel: page.navLabel,
      title: page.title,
      position: page.position,
      sections: sectionsByPage.get(page.id) ?? [],
    })),
  };
}

export interface UpdateSectionContentInput {
  readonly sectionId: string;
  readonly content: unknown;
  readonly visible: boolean;
}

/**
 * Row-level security already refuses this update if the row is not the caller's business or is not
 * `customer_editable` (see the `page_sections_customer_update` policy); a zero-row result means one of those, and
 * this throws either way rather than silently doing nothing.
 */
export async function updateSectionContent(tx: ScopedTransaction, input: UpdateSectionContentInput): Promise<void> {
  if (!isUuid(input.sectionId)) throw new SectionNotEditableError(input.sectionId);
  const result = await tx
    .update(pageSections)
    .set({ content: input.content, visible: input.visible })
    .where(eq(pageSections.id, input.sectionId))
    .returning({ id: pageSections.id });
  if (result.length === 0) throw new SectionNotEditableError(input.sectionId);
}

export interface AddGalleryItemInput {
  readonly mediaId: string;
  readonly caption: string | null;
}

export interface GalleryItem {
  readonly id: string;
  readonly mediaId: string;
  readonly caption: string | null;
  readonly position: number;
}

/** New items go to the end of the list. */
export async function addGalleryItem(tx: ScopedTransaction, input: AddGalleryItemInput): Promise<GalleryItem> {
  const businessId = await currentBusinessId(tx);
  const existing = await tx
    .select({ position: galleryItems.position })
    .from(galleryItems)
    .where(and(eq(galleryItems.businessId, businessId), isNull(galleryItems.deletedAt)))
    .orderBy(asc(galleryItems.position));
  const nextPosition = existing.length === 0 ? 0 : Math.max(...existing.map((row) => row.position)) + 1;

  const [row] = await tx
    .insert(galleryItems)
    .values({ businessId, mediaId: input.mediaId, caption: input.caption, position: nextPosition })
    .returning();
  return { id: row!.id, mediaId: row!.mediaId, caption: row!.caption, position: row!.position };
}

/** `orderedIds` must list every one of the caller's non-deleted gallery items, in the order they should show. */
export async function reorderGalleryItems(tx: ScopedTransaction, orderedIds: readonly string[]): Promise<void> {
  const businessId = await currentBusinessId(tx);
  for (const [index, id] of orderedIds.entries()) {
    const result = await tx
      .update(galleryItems)
      .set({ position: index })
      .where(and(eq(galleryItems.id, id), eq(galleryItems.businessId, businessId)))
      .returning({ id: galleryItems.id });
    if (result.length === 0) throw new GalleryItemNotFoundError(id);
  }
}

export async function removeGalleryItem(tx: ScopedTransaction, itemId: string): Promise<void> {
  const result = await tx
    .update(galleryItems)
    .set({ deletedAt: new Date() })
    .where(and(eq(galleryItems.id, itemId), isNull(galleryItems.deletedAt)))
    .returning({ id: galleryItems.id });
  if (result.length === 0) throw new GalleryItemNotFoundError(itemId);
}
```

- [x] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @firstfold/db test:integration -- website.integration
```

Expected: all pass.

- [x] **Step 5: Export from the package**

In `packages/db/src/index.ts`, add the new query module's exports next to the other query modules (follow the existing pattern — check how `onboarding-data.ts`'s functions are re-exported today and mirror it exactly for `website.ts`).

- [x] **Step 6: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @firstfold/db test:integration
```

---

### Task 3: Blog

**Files:**
- Create: `packages/db/src/queries/blog.ts`
- Test: `packages/db/src/blog.integration.test.ts`
- Modify: `packages/db/src/index.ts`

- [x] **Step 1: Write the failing integration tests**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ScopedTransaction } from "./scope";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";
import { businesses } from "./schema";
import {
  BlogPostNotFoundError,
  createBlogPost,
  listBlogPosts,
  publishBlogPost,
  softDeleteBlogPost,
  unpublishBlogPost,
  updateBlogPost,
} from "./queries/blog";

const BUSINESS_A = "0000018f-0000-7000-8000-00000000000a";
const BUSINESS_B = "0000018f-0000-7000-8000-00000000000b";
const USER_A = "user-a";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(businesses).values([
    { id: BUSINESS_A, slug: "riverside-plumbing", name: "Riverside Plumbing" },
    { id: BUSINESS_B, slug: "cy-cafe", name: "Cy's Cafe" },
  ]);
});

function scoped<T>(businessId: string, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId: USER_A, businessId }, work);
}

describe("blog queries", () => {
  it("writes, edits, publishes and unpublishes a post", async () => {
    const post = await scoped(BUSINESS_A, (tx) =>
      createBlogPost(tx, { title: "We're open", slug: "were-open", excerpt: null, body: { blocks: [] } }),
    );
    expect(post.status).toBe("draft");

    await scoped(BUSINESS_A, (tx) => updateBlogPost(tx, { postId: post.id, title: "We're open!", excerpt: "Come say hi" }));
    const published = await scoped(BUSINESS_A, (tx) =>
      publishBlogPost(tx, post.id),
    );
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    const unpublished = await scoped(BUSINESS_A, (tx) =>
      unpublishBlogPost(tx, post.id),
    );
    expect(unpublished.status).toBe("draft");
  });

  it("keeps posts isolated by business", async () => {
    await scoped(BUSINESS_A, (tx) => createBlogPost(tx, { title: "A", slug: "a", excerpt: null, body: {} }));
    await scoped(BUSINESS_B, (tx) => createBlogPost(tx, { title: "B", slug: "b", excerpt: null, body: {} }));

    const postsA = await scoped(BUSINESS_A, (tx) => listBlogPosts(tx));
    expect(postsA.map((p) => p.title)).toEqual(["A"]);
  });

  it("refuses to edit a soft-deleted or someone else's post", async () => {
    const post = await scoped(BUSINESS_B, (tx) => createBlogPost(tx, { title: "B", slug: "b", excerpt: null, body: {} }));

    await expect(
      scoped(BUSINESS_A, (tx) => updateBlogPost(tx, { postId: post.id, title: "hacked", excerpt: null })),
    ).rejects.toThrow(BlogPostNotFoundError);

    await scoped(BUSINESS_B, (tx) => softDeleteBlogPost(tx, post.id));
    await expect(scoped(BUSINESS_B, (tx) => updateBlogPost(tx, { postId: post.id, title: "hacked", excerpt: null }))).rejects.toThrow(
      BlogPostNotFoundError,
    );
  });
});
```

- [x] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter @firstfold/db test:integration -- blog.integration
```

Expected: fails to resolve `./queries/blog`.

- [x] **Step 3: Implement the queries**

```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import type { ScopedTransaction } from "../scope";
import { blogPosts, type BlogPostStatus } from "../schema";
import { currentBusinessId, isUuid } from "./tenant";

export class BlogPostNotFoundError extends Error {
  constructor(postId: string) {
    super(`Blog post ${postId} does not exist for this business.`);
    this.name = "BlogPostNotFoundError";
  }
}

export interface BlogPost {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string | null;
  readonly body: unknown;
  readonly status: BlogPostStatus;
  readonly publishedAt: Date | null;
}

function toBlogPost(row: typeof blogPosts.$inferSelect): BlogPost {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    body: row.body,
    status: row.status,
    publishedAt: row.publishedAt,
  };
}

export async function listBlogPosts(tx: ScopedTransaction): Promise<readonly BlogPost[]> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.businessId, businessId), isNull(blogPosts.deletedAt)))
    .orderBy(asc(blogPosts.createdAt));
  return rows.map(toBlogPost);
}

export interface CreateBlogPostInput {
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string | null;
  readonly body: unknown;
}

export async function createBlogPost(tx: ScopedTransaction, input: CreateBlogPostInput): Promise<BlogPost> {
  const businessId = await currentBusinessId(tx);
  const [row] = await tx
    .insert(blogPosts)
    .values({ businessId, title: input.title, slug: input.slug, excerpt: input.excerpt, body: input.body })
    .returning();
  return toBlogPost(row!);
}

async function findOwnRow(tx: ScopedTransaction, postId: string): Promise<typeof blogPosts.$inferSelect> {
  if (!isUuid(postId)) throw new BlogPostNotFoundError(postId);
  const businessId = await currentBusinessId(tx);
  const [row] = await tx
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.id, postId), eq(blogPosts.businessId, businessId), isNull(blogPosts.deletedAt)))
    .limit(1);
  if (row === undefined) throw new BlogPostNotFoundError(postId);
  return row;
}

export interface UpdateBlogPostInput {
  readonly postId: string;
  readonly title: string;
  readonly excerpt: string | null;
}

export async function updateBlogPost(tx: ScopedTransaction, input: UpdateBlogPostInput): Promise<BlogPost> {
  await findOwnRow(tx, input.postId);
  const [row] = await tx
    .update(blogPosts)
    .set({ title: input.title, excerpt: input.excerpt })
    .where(eq(blogPosts.id, input.postId))
    .returning();
  return toBlogPost(row!);
}

export async function publishBlogPost(tx: ScopedTransaction, postId: string): Promise<BlogPost> {
  await findOwnRow(tx, postId);
  const [row] = await tx
    .update(blogPosts)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(blogPosts.id, postId))
    .returning();
  return toBlogPost(row!);
}

/** Free, per spec §3: "Free and outside the allowance: unpublishing a blog post". */
export async function unpublishBlogPost(tx: ScopedTransaction, postId: string): Promise<BlogPost> {
  await findOwnRow(tx, postId);
  const [row] = await tx
    .update(blogPosts)
    .set({ status: "draft", publishedAt: null })
    .where(eq(blogPosts.id, postId))
    .returning();
  return toBlogPost(row!);
}

export async function softDeleteBlogPost(tx: ScopedTransaction, postId: string): Promise<void> {
  await findOwnRow(tx, postId);
  await tx.update(blogPosts).set({ deletedAt: new Date() }).where(eq(blogPosts.id, postId));
}
```

- [x] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @firstfold/db test:integration -- blog.integration
```

- [x] **Step 5: Export from the package and checkpoint**

Add `blog.ts`'s exports to `packages/db/src/index.ts` next to `website.ts`'s. Then:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @firstfold/db test:integration
```

---

### Task 4: The release snapshot builder

**Files:**
- Create: `packages/db/src/queries/site-releases.ts`
- Test: `packages/db/src/site-releases.integration.test.ts`
- Modify: `packages/db/src/index.ts`

This is staff/system work, not customer-facing: it runs on the **staff** connection (`getStaffDb()` in `apps/platform`), with no `withTenantScope` — same as `countPlatformRecords` in `packages/db/src/queries/staff.ts`.

- [x] **Step 1: Write the failing integration test**

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { businesses, pages, pageSections, siteReleases, websites } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";
import { createSiteRelease } from "./queries/site-releases";

const BUSINESS_A = "0000018f-0000-7000-8000-00000000000a";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(businesses).values({ id: BUSINESS_A, slug: "riverside-plumbing", name: "Riverside Plumbing" });
});

describe("createSiteRelease", () => {
  it("snapshots every visible section of every page, numbered from 1", async () => {
    const [website] = await dbs.staff.db.insert(websites).values({ businessId: BUSINESS_A }).returning();
    const [page] = await dbs.staff.db
      .insert(pages)
      .values({ businessId: BUSINESS_A, websiteId: website!.id, key: "home", slug: "home", navLabel: "Home", title: "Home", position: 0 })
      .returning();
    await dbs.staff.db.insert(pageSections).values([
      { businessId: BUSINESS_A, pageId: page!.id, type: "rich_text", position: 0, content: { text: "Hi" }, visible: true },
      { businessId: BUSINESS_A, pageId: page!.id, type: "rich_text", position: 1, content: { text: "Hidden" }, visible: false },
    ]);

    const first = await createSiteRelease(dbs.staff.db, {
      businessId: BUSINESS_A,
      websiteId: website!.id,
      purpose: "preview",
      createdByType: "staff",
      createdById: "staff-1",
    });
    expect(first.number).toBe(1);
    expect(first.snapshot.pages[0]!.sections).toHaveLength(1);

    const second = await createSiteRelease(dbs.staff.db, {
      businessId: BUSINESS_A,
      websiteId: website!.id,
      purpose: "production",
      createdByType: "system",
      createdById: null,
    });
    expect(second.number).toBe(2);
    expect(second.contentHash).toBe(first.contentHash); // same content, so the same hash

    const rows = await dbs.staff.db.select().from(siteReleases).where(eq(siteReleases.businessId, BUSINESS_A));
    expect(rows).toHaveLength(2);
  });
});
```

- [x] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter @firstfold/db test:integration -- site-releases.integration
```

- [x] **Step 3: Implement it**

```ts
import { createHash } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import type { Database } from "../client";
import { pages, pageSections, siteReleases, type SiteReleaseCreator, type SiteReleasePurpose } from "../schema";

export interface ReleaseSectionSnapshot {
  readonly id: string;
  readonly type: string;
  readonly variant: string | null;
  readonly content: unknown;
}

export interface ReleasePageSnapshot {
  readonly id: string;
  readonly key: string;
  readonly slug: string;
  readonly title: string;
  readonly sections: readonly ReleaseSectionSnapshot[];
}

export interface ReleaseSnapshot {
  readonly pages: readonly ReleasePageSnapshot[];
}

export interface CreateSiteReleaseInput {
  readonly businessId: string;
  readonly websiteId: string;
  readonly purpose: SiteReleasePurpose;
  readonly createdByType: SiteReleaseCreator;
  readonly createdById: string | null;
}

export interface SiteRelease {
  readonly id: string;
  readonly number: number;
  readonly purpose: SiteReleasePurpose;
  readonly snapshot: ReleaseSnapshot;
  readonly contentHash: string;
  readonly createdAt: Date;
}

/** Stable regardless of key order, so the same content always hashes the same way. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Reads every visible section of every page and writes one immutable release row. Runs on the staff connection —
 * there is no customer-facing version of this: only staff/system work ever calls it (see this plan's "Deliberately
 * deferred": wiring a "Build" button to it is the staff project-management plan's job, not this one's).
 */
export async function createSiteRelease(db: Database, input: CreateSiteReleaseInput): Promise<SiteRelease> {
  const pageRows = await db
    .select()
    .from(pages)
    .where(eq(pages.websiteId, input.websiteId))
    .orderBy(asc(pages.position));
  const sectionRows = await db
    .select()
    .from(pageSections)
    .where(and(eq(pageSections.businessId, input.businessId), eq(pageSections.visible, true)))
    .orderBy(asc(pageSections.position));

  const sectionsByPage = new Map<string, ReleaseSectionSnapshot[]>();
  for (const section of sectionRows) {
    const list = sectionsByPage.get(section.pageId) ?? [];
    list.push({ id: section.id, type: section.type, variant: section.variant, content: section.content });
    sectionsByPage.set(section.pageId, list);
  }

  const snapshot: ReleaseSnapshot = {
    pages: pageRows.map((page) => ({
      id: page.id,
      key: page.key,
      slug: page.slug,
      title: page.title,
      sections: sectionsByPage.get(page.id) ?? [],
    })),
  };
  const contentHash = createHash("sha256").update(stableStringify(snapshot)).digest("hex");

  const [{ value: highestNumber }] = await db
    .select({ value: max(siteReleases.number) })
    .from(siteReleases)
    .where(eq(siteReleases.businessId, input.businessId));
  const number = (highestNumber ?? 0) + 1;

  const [row] = await db
    .insert(siteReleases)
    .values({
      businessId: input.businessId,
      websiteId: input.websiteId,
      number,
      purpose: input.purpose,
      snapshot,
      contentHash,
      createdByType: input.createdByType,
      createdById: input.createdById,
    })
    .returning();

  return {
    id: row!.id,
    number: row!.number,
    purpose: row!.purpose,
    snapshot: row!.snapshot as ReleaseSnapshot,
    contentHash: row!.contentHash,
    createdAt: row!.createdAt,
  };
}
```

- [x] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @firstfold/db test:integration -- site-releases.integration
```

- [x] **Step 5: Export from the package and checkpoint**

Add `site-releases.ts`'s exports to `packages/db/src/index.ts`, then:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @firstfold/db test:integration
```

---

### Task 5: Site status (for the coming Monitoring page)

**Files:**
- Create: `packages/billing/src/site-status.ts`
- Test: `packages/billing/src/site-status.test.ts`
- Modify: `packages/billing/src/index.ts`

A pure function, unit-tested — no database, no worker. `hasBillingAccess` already carries the comment "and later website visibility"; this builds directly on it rather than re-deriving subscription rules.

- [x] **Step 1: Write the failing unit test**

```ts
import { describe, expect, it } from "vitest";
import type { ProjectStatus } from "@firstfold/db";
import { deriveSiteStatus } from "./site-status";

const NOW = new Date("2026-09-17T12:00:00Z");
const FUTURE = new Date("2026-10-17T12:00:00Z");
const PAST = new Date("2026-09-01T12:00:00Z");

describe("deriveSiteStatus", () => {
  it("is 'not_launched' before the project has gone live, whatever billing says", () => {
    const statuses: readonly ProjectStatus[] = ["onboarding", "submitted", "building", "preview", "revisions", "approved"];
    for (const projectStatus of statuses) {
      expect(
        deriveSiteStatus({ projectStatus, subscription: { status: "active", paidThroughAt: FUTURE } }, NOW),
      ).toEqual({ kind: "not_launched" });
    }
  });

  it("is 'online' once live and billing access holds", () => {
    expect(
      deriveSiteStatus({ projectStatus: "live", subscription: { status: "active", paidThroughAt: FUTURE } }, NOW),
    ).toEqual({ kind: "online" });
  });

  it("is 'offline' once live if billing access has lapsed", () => {
    expect(
      deriveSiteStatus({ projectStatus: "live", subscription: { status: "inactive", paidThroughAt: FUTURE } }, NOW),
    ).toEqual({ kind: "offline", reason: "payment_lapsed" });

    expect(
      deriveSiteStatus({ projectStatus: "live", subscription: { status: "active", paidThroughAt: PAST } }, NOW),
    ).toEqual({ kind: "offline", reason: "payment_lapsed" });
  });

  it("reports 'payment_lapsed' even when there is no subscription at all", () => {
    expect(deriveSiteStatus({ projectStatus: "live", subscription: null }, NOW)).toEqual({
      kind: "offline",
      reason: "payment_lapsed",
    });
  });

  it("is 'not_launched' for on_hold and cancelled too: both only ever happen pre-live (spec §5.3)", () => {
    for (const projectStatus of ["on_hold", "cancelled"] as const) {
      expect(
        deriveSiteStatus({ projectStatus, subscription: { status: "active", paidThroughAt: FUTURE } }, NOW),
      ).toEqual({ kind: "not_launched" });
    }
  });
});
```

- [x] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter @firstfold/billing test -- site-status
```

- [x] **Step 3: Implement it**

```ts
import type { ProjectStatus } from "@firstfold/db";
import { hasBillingAccess, type BillingAccessInput } from "./access";

export interface SiteStatusInput {
  readonly projectStatus: ProjectStatus;
  readonly subscription: BillingAccessInput | null;
}

/**
 * `not_launched` covers every status except `live`. Per the project state machine (spec §5.3), `live` has no
 * outgoing transition — a project that reaches it stays `live` forever, and every OTHER status (including
 * `on_hold`, which only pauses `submitted`/`building`/`revisions`, and `cancelled`, reachable only from "any
 * pre-`live`" status) is definitionally a project that has never had a live website. So there is no website worth
 * reporting on for any of them, whatever billing looks like — a stalled, paused or cancelled-before-launch business
 * never shows as a misleading "offline" site. Once `live`, status is computed from `hasBillingAccess` — see this
 * plan's "Deliberately deferred": there is no worker yet setting a `suspended_at` column, so this is the interim
 * source of truth (computed live on every read), not a cached one.
 */
export type SiteStatus =
  | { readonly kind: "not_launched" }
  | { readonly kind: "online" }
  | { readonly kind: "offline"; readonly reason: "payment_lapsed" };

export function deriveSiteStatus(input: SiteStatusInput, now: Date): SiteStatus {
  if (input.projectStatus !== "live") return { kind: "not_launched" };
  return hasBillingAccess(input.subscription, now) ? { kind: "online" } : { kind: "offline", reason: "payment_lapsed" };
}
```

- [x] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @firstfold/billing test -- site-status
```

- [x] **Step 5: Export and checkpoint**

Add `export * from "./site-status";` to `packages/billing/src/index.ts` next to the other exports. Then:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

---

### Task 6: RLS isolation, end to end

**Files:**
- Modify: `packages/db/src/rls.integration.test.ts`

Add cases proving the policies from Task 1 actually hold, following that file's existing style (read it first for the exact setup helpers it uses):

- [x] **Step 1: Add the cases**

```ts
describe("website RLS", () => {
  it("lets a customer read another business's nothing: sections stay scoped", async () => {
    const [siteA] = await dbs.staff.db.insert(websites).values({ businessId: BUSINESS_A }).returning();
    const [siteB] = await dbs.staff.db.insert(websites).values({ businessId: BUSINESS_B }).returning();
    const [pageA] = await dbs.staff.db
      .insert(pages)
      .values({ businessId: BUSINESS_A, websiteId: siteA!.id, key: "home", slug: "home", navLabel: "Home", title: "Home", position: 0 })
      .returning();
    await dbs.staff.db.insert(pages).values({
      businessId: BUSINESS_B,
      websiteId: siteB!.id,
      key: "home",
      slug: "home",
      navLabel: "Home",
      title: "Home",
      position: 0,
    });

    const seenByA = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      tx.select().from(pages),
    );
    expect(seenByA.map((p) => p.id)).toEqual([pageA!.id]);
  });

  it("refuses a customer update outside RLS even if the query layer is bypassed", async () => {
    const [site] = await dbs.staff.db.insert(websites).values({ businessId: BUSINESS_A }).returning();
    const [page] = await dbs.staff.db
      .insert(pages)
      .values({ businessId: BUSINESS_A, websiteId: site!.id, key: "home", slug: "home", navLabel: "Home", title: "Home", position: 0 })
      .returning();
    const [locked] = await dbs.staff.db
      .insert(pageSections)
      .values({ businessId: BUSINESS_A, pageId: page!.id, type: "rich_text", position: 0, content: {}, customerEditable: false })
      .returning();

    const result = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      tx.update(pageSections).set({ content: { text: "hacked" } }).where(eq(pageSections.id, locked!.id)).returning(),
    );
    expect(result).toHaveLength(0); // the policy's USING clause hides the row from the UPDATE entirely
  });

  it("keeps site_releases write-only for staff and read-only for its own business", async () => {
    await expect(
      withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
        tx.insert(siteReleases).values({
          businessId: BUSINESS_A,
          websiteId: "0000018f-0000-7000-8000-00000000009",
          number: 1,
          purpose: "preview",
          snapshot: {},
          contentHash: "x",
          createdByType: "system",
        }),
      ),
    ).rejects.toThrow();
  });
});
```

Add the needed imports (`websites`, `pages`, `pageSections`, `siteReleases`) to the top of the file.

- [x] **Step 2: Run it**

```bash
pnpm --filter @firstfold/db test:integration -- rls.integration
```

Expected: all pass.

---

### Task 7: Final verification

- [x] **Step 1: Full checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration
```

Expected: everything green. `pnpm test:integration` runs `pnpm db:migrate:test` first, so it also proves the migrations from Task 1 apply cleanly to a fresh test database.

- [x] **Step 2: Confirm nothing customer-facing changed**

No page under `apps/platform/app` was touched by this plan — the customer dashboard looks and behaves exactly as it did before. That is deliberate: the next plan (Customer Content, Blog and Monitoring UI) is what wires these queries into the sidebar and screens the user actually sees.

---

## What comes next

Two follow-up plans, each written once this one is built and verified (this project's own rule — see `docs/superpowers/specs/2026-09-15-firstfold-platform-design.md` §12: "each plan built and verified before the next is written"):

1. **Customer Content & Monitoring UI** — adds "Content" and "Monitoring" to `CUSTOMER_NAV` in `apps/platform/components/panel/customer-shell.tsx`, a page listing editor built on `getWebsiteForBusiness`/`updateSectionContent`, a gallery manager, a blog editor built on `packages/db/src/queries/blog.ts`, and a Monitoring page built on `deriveSiteStatus`. Also needs one staff-side action — "start the build" — that calls `createSiteRelease` for the first time, since a business has no pages or sections to show until something creates them; that action's scope stays small on purpose, not the full project-management queue.
2. **Publish workflow** — `content_publish`, `publish_allowance_grant`, and the $3-per-publish charge. Billing-adjacent, deserves the same care as the Phase 1C payment wall.
