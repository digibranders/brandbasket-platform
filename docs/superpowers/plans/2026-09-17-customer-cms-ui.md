# Customer Content & Monitoring UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two real menu items to the customer dashboard — **Content** (edit editable page sections, manage the gallery, write the blog) and **Monitoring** (is the site online right now) — built entirely on the data layer from `docs/superpowers/plans/2026-09-17-cms-foundation.md`.

**Architecture:** Every new customer page follows the existing onboarding pages' shape: a server component reads through `withTenantScope`, server actions guarded by `requireBillingAccess()` do the writes, `refresh()`/`redirect()` bring the page up to date. Because no business has a `websites` row yet (nothing in the codebase creates one — that's deliberately staff project-management work, not yet built), this plan adds one small, clearly-labeled staff stopgap: a "Create & launch website" action in the admin console that seeds real pages/sections and marks the project `live`, standing in for the missing build→preview→approve→launch workflow until that plan exists.

**Tech Stack:** Next.js 16 App Router (server components, server actions), drizzle-orm + PostgreSQL, Vitest, Tailwind 4.

---

## Ground rules for the engineer

- **Source of truth:** the customer-facing rules in `docs/superpowers/specs/2026-09-15-fynix-platform-design.md` §3 ("Content updates after launch") and the just-built query layer in `packages/db/src/queries/website.ts`, `blog.ts`, `site-releases.ts` and `packages/billing/src/site-status.ts` — read all four before starting.
- **Deliberately deferred (do not build in this plan):**
  - A rich-text editor. Blog post bodies and section text are plain text, stored as `{ text: string }`. No WYSIWYG, no formatting toolbar. The user has said explicitly to keep this simple.
  - New photo uploads into the gallery. `/api/uploads` is tightly coupled to onboarding (`isOnboardingOpen` gates it, `storeOnboardingImage`/`consumeUploadAllowance` are onboarding-specific) — generalizing it for post-launch uploads is its own piece of work. This plan's gallery only manages photos already uploaded during onboarding (add to gallery / caption / reorder / remove). Uploading a brand-new photo straight into the gallery is a follow-up.
  - Image-type section editing. The stopgap seed (Task 1) only creates `rich_text` sections, so there is nothing of type `image` to edit yet. When a real template with image sections exists, extend the Content page then.
  - The real staff project-management workflow (queue, assignment, building→preview→approve→launch, revision rounds). Task 1's `launchWebsiteForBusiness` is a named, commented stopgap for exactly that gap — see its doc comment for what a real implementation replaces.
  - The $3-per-publish billing workflow. Every write in this plan (section edits, gallery changes, blog publish/unpublish) writes immediately; there is no `content_publish`/allowance gate yet, matching `packages/db/src/queries/blog.ts`'s existing comment that publishing is "free and unlimited" for now.
- **Write actions require payment**, per the existing rule: call `requireBillingAccess()` (`apps/platform/lib/server/billing.ts`) at the top of every server action that writes. Reads stay open — the dashboard is readable before payment (existing pattern, see `BillingBanner`).
- **Do not commit. Do not start a dev server.** The user runs their own on port 3000/3001 against the dev database.
- Checkpoint after every task: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm --filter @fynix/db test:integration` for the Task 1 database work.

---

### Task 1: Database — the stopgap launcher and a gallery reader

**Files:**
- Create: `packages/db/src/queries/launch.ts`
- Test: `packages/db/src/launch.integration.test.ts`
- Modify: `packages/db/src/queries/website.ts` (add `listGalleryItems`)
- Modify: `packages/db/src/website.integration.test.ts` (test `listGalleryItems`)
- Modify: `packages/db/src/index.ts`

- [x] **Step 1: `listGalleryItems` — write the failing test**

Add to `packages/db/src/website.integration.test.ts`, inside the existing `describe("gallery queries", ...)` block (read the file first — it already has a `seedWebsite` helper and a media-seeding pattern from the "adds, reorders and removes" test; reuse both rather than duplicating):

```ts
  it("lists the caller's own gallery items with the media info needed to render them", async () => {
    await seedWebsite(BUSINESS_A);
    await dbs.staff.db.insert(users).values({ id: USER_A, name: "Ana Diaz", email: "ana@example.com" });
    const [media] = await dbs.staff.db
      .insert(mediaAssets)
      .values({
        id: "0000018f-0000-7000-8000-0000000000f2",
        businessId: BUSINESS_A,
        purpose: "photo",
        storageKey: `t/${BUSINESS_A}/0000018f-0000-7000-8000-0000000000f2/display`,
        originalFilename: "shop.jpg",
        mimeType: "image/webp",
        bytes: 1000,
        width: 800,
        height: 600,
        sha256: "b".repeat(64),
        altText: "Our shopfront",
        status: "ready",
        uploadedByUserId: USER_A,
      })
      .returning();

    const item = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      addGalleryItem(tx, { mediaId: media!.id, caption: "Our shop" }),
    );

    const listed = await withTenantScope(dbs.app.db, { userId: USER_A, businessId: BUSINESS_A }, (tx) =>
      listGalleryItems(tx),
    );
    expect(listed).toEqual([
      {
        id: item.id,
        caption: "Our shop",
        position: 0,
        media: { id: media!.id, width: 800, height: 600, altText: "Our shopfront", originalFilename: "shop.jpg" },
      },
    ]);
  });
```

Add `listGalleryItems` to the `./queries/website` import at the top of the test file, and `users` to the `./schema` import if it is not already imported.

- [x] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter @fynix/db test:integration -- website.integration
```

Expected: fails to resolve/export `listGalleryItems`.

- [x] **Step 3: Implement `listGalleryItems`**

In `packages/db/src/queries/website.ts`, add the import of `mediaAssets` (alongside the existing `galleryItems`, `pages`, `pageSections`, `websites` import from `../schema`) and this function, placed after `addGalleryItem`:

```ts
export interface GalleryPhoto {
  readonly id: string;
  readonly caption: string | null;
  readonly position: number;
  readonly media: {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly altText: string | null;
    readonly originalFilename: string;
  };
}

/** The caller's own gallery, in display order, joined with just enough media info to render each photo. */
export async function listGalleryItems(tx: ScopedTransaction): Promise<readonly GalleryPhoto[]> {
  const businessId = await currentBusinessId(tx);
  const rows = await tx
    .select({
      id: galleryItems.id,
      caption: galleryItems.caption,
      position: galleryItems.position,
      mediaId: mediaAssets.id,
      width: mediaAssets.width,
      height: mediaAssets.height,
      altText: mediaAssets.altText,
      originalFilename: mediaAssets.originalFilename,
    })
    .from(galleryItems)
    .innerJoin(mediaAssets, eq(galleryItems.mediaId, mediaAssets.id))
    .where(and(eq(galleryItems.businessId, businessId), isNull(galleryItems.deletedAt)))
    .orderBy(asc(galleryItems.position));

  return rows.map((row) => ({
    id: row.id,
    caption: row.caption,
    position: row.position,
    media: { id: row.mediaId, width: row.width, height: row.height, altText: row.altText, originalFilename: row.originalFilename },
  }));
}
```

- [x] **Step 4: Run the test and confirm it passes**

```bash
pnpm --filter @fynix/db test:integration -- website.integration
```

- [x] **Step 5: `launchWebsiteForBusiness` — write the failing test**

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { businesses, pages, pageSections, projects, websites } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";
import { launchWebsiteForBusiness, NoProjectError } from "./queries/launch";

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

describe("launchWebsiteForBusiness", () => {
  it("refuses a business with no project at all", async () => {
    await expect(launchWebsiteForBusiness(dbs.staff.db, { businessId: BUSINESS_A })).rejects.toThrow(NoProjectError);
  });

  it("seeds a website with the six standard pages, one editable section each, and marks the project live", async () => {
    const [project] = await dbs.staff.db.insert(projects).values({ businessId: BUSINESS_A }).returning();

    const result = await launchWebsiteForBusiness(dbs.staff.db, { businessId: BUSINESS_A });
    expect(result).toEqual({ websiteCreated: true, projectLaunched: true });

    const [website] = await dbs.staff.db.select().from(websites).where(eq(websites.businessId, BUSINESS_A));
    expect(website).toBeDefined();

    const pageRows = await dbs.staff.db.select().from(pages).where(eq(pages.businessId, BUSINESS_A));
    expect(pageRows.map((p) => p.key).sort()).toEqual(["about", "contact", "gallery", "home", "reviews", "services"]);

    const sectionRows = await dbs.staff.db.select().from(pageSections).where(eq(pageSections.businessId, BUSINESS_A));
    expect(sectionRows).toHaveLength(6);
    expect(sectionRows.every((section) => section.customerEditable && section.type === "rich_text")).toBe(true);

    const [updatedProject] = await dbs.staff.db.select().from(projects).where(eq(projects.id, project!.id));
    expect(updatedProject!.status).toBe("live");
    expect(updatedProject!.launchedAt).not.toBeNull();
  });

  it("is safe to call again: does not duplicate the website or re-stamp launchedAt", async () => {
    const [project] = await dbs.staff.db.insert(projects).values({ businessId: BUSINESS_A }).returning();
    const first = await launchWebsiteForBusiness(dbs.staff.db, { businessId: BUSINESS_A });
    expect(first).toEqual({ websiteCreated: true, projectLaunched: true });

    const [{ launchedAt: firstLaunchedAt }] = await dbs.staff.db
      .select({ launchedAt: projects.launchedAt })
      .from(projects)
      .where(eq(projects.id, project!.id));

    const second = await launchWebsiteForBusiness(dbs.staff.db, { businessId: BUSINESS_A });
    expect(second).toEqual({ websiteCreated: false, projectLaunched: false });

    const [{ launchedAt: secondLaunchedAt }] = await dbs.staff.db
      .select({ launchedAt: projects.launchedAt })
      .from(projects)
      .where(eq(projects.id, project!.id));
    expect(secondLaunchedAt).toEqual(firstLaunchedAt);

    const websiteRows = await dbs.staff.db.select().from(websites).where(eq(websites.businessId, BUSINESS_A));
    expect(websiteRows).toHaveLength(1);
  });
});
```

- [x] **Step 6: Run it and confirm it fails**

```bash
pnpm --filter @fynix/db test:integration -- launch.integration
```

Expected: fails to resolve `./queries/launch`.

- [x] **Step 7: Implement `launchWebsiteForBusiness`**

```ts
import { and, eq, ne } from "drizzle-orm";
import type { Database } from "../client";
import { pages, pageSections, projects, websites, type PageKey } from "../schema";

export class NoProjectError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no project to launch.`);
    this.name = "NoProjectError";
  }
}

export interface LaunchWebsiteInput {
  readonly businessId: string;
}

export interface LaunchWebsiteResult {
  readonly websiteCreated: boolean;
  readonly projectLaunched: boolean;
}

/**
 * STOPGAP. Stands in for the real staff project-management workflow (a build queue, assignment, and the
 * submitted → building → preview → revisions → approved → live state machine — spec §5.3) which has not been
 * built yet (see docs/superpowers/plans/2026-09-17-cms-foundation.md's "What comes next"). Until that exists,
 * this is the only way a business gets a real website: it seeds the six standard pages with one empty,
 * customer-editable text section each, and jumps the project straight to `live`. Delete this file and replace its
 * one call site (the admin "Create & launch website" action) with the real workflow once it is built.
 *
 * Idempotent: calling it again for a business that already has a website and a live project does nothing and
 * reports that nothing changed, so the button that calls this is safe to click more than once.
 */
export async function launchWebsiteForBusiness(db: Database, input: LaunchWebsiteInput): Promise<LaunchWebsiteResult> {
  const [project] = await db
    .select({ id: projects.id, status: projects.status })
    .from(projects)
    .where(and(eq(projects.businessId, input.businessId), ne(projects.status, "cancelled")))
    .limit(1);
  if (project === undefined) throw new NoProjectError(input.businessId);

  let projectLaunched = false;
  if (project.status !== "live") {
    await db.update(projects).set({ status: "live", launchedAt: new Date() }).where(eq(projects.id, project.id));
    projectLaunched = true;
  }

  const [existingWebsite] = await db.select({ id: websites.id }).from(websites).where(eq(websites.businessId, input.businessId));
  if (existingWebsite !== undefined) return { websiteCreated: false, projectLaunched };

  const [website] = await db.insert(websites).values({ businessId: input.businessId }).returning();
  const standardPages: readonly { readonly key: PageKey; readonly navLabel: string; readonly title: string }[] = [
    { key: "home", navLabel: "Home", title: "Home" },
    { key: "about", navLabel: "About", title: "About us" },
    { key: "services", navLabel: "Services", title: "Our services" },
    { key: "gallery", navLabel: "Gallery", title: "Gallery" },
    { key: "reviews", navLabel: "Reviews", title: "Reviews" },
    { key: "contact", navLabel: "Contact", title: "Contact us" },
  ];

  for (const [position, page] of standardPages.entries()) {
    const [row] = await db
      .insert(pages)
      .values({
        businessId: input.businessId,
        websiteId: website!.id,
        key: page.key,
        slug: page.key,
        navLabel: page.navLabel,
        title: page.title,
        position,
      })
      .returning();
    await db.insert(pageSections).values({
      businessId: input.businessId,
      pageId: row!.id,
      type: "rich_text",
      position: 0,
      content: { text: "" },
      customerEditable: true,
    });
  }

  return { websiteCreated: true, projectLaunched };
}
```

- [x] **Step 8: Run the tests and confirm they pass**

```bash
pnpm --filter @fynix/db test:integration -- launch.integration
```

- [x] **Step 9: Export and checkpoint**

Add `listGalleryItems`/`GalleryPhoto`'s exports (they belong with `website.ts`'s existing export block) and a new export block for `launch.ts` (`launchWebsiteForBusiness`, `NoProjectError`, and its types) to `packages/db/src/index.ts`. Then:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @fynix/db test:integration
```

---

### Task 2: Staff UI — "Create & launch website"

**Files:**
- Modify: `apps/platform/app/admin-host/(protected)/clients/[businessId]/actions.ts`
- Modify: `apps/platform/app/admin-host/(protected)/clients/[businessId]/page.tsx`

- [x] **Step 1: The action**

Read `apps/platform/app/admin-host/(protected)/clients/[businessId]/actions.ts` first — follow its existing `"use server"`, `requireStaffAccess()`, `revalidatePath` pattern exactly (it already has `revalidateClient(businessId)` defined; reuse it). Add:

```ts
import { launchWebsiteForBusiness, NoProjectError } from "@fynix/db";
// ... alongside the existing imports

/** Stopgap for the missing staff project-management workflow — see packages/db/src/queries/launch.ts's doc comment. */
export async function launchWebsiteAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "Launch a website's business");

  try {
    await launchWebsiteForBusiness(getStaffDb(), { businessId });
  } catch (error) {
    if (!(error instanceof NoProjectError)) throw error;
  }
  revalidateClient(businessId);
  redirect(`/admin-host/clients/${businessId}`);
}
```

Import `getStaffDb` from `@/lib/server/db` if the file does not already have it (check first — `page.tsx` in the same folder already uses it, but this `actions.ts` might not).

- [x] **Step 2: The button**

In `apps/platform/app/admin-host/(protected)/clients/[businessId]/page.tsx`, find where `client.project` is rendered (search for `ProjectStatusBadge`) and add, near it, a small form — only shown while the project exists and is not already `live`:

```tsx
{client.project !== null && client.project.status !== "live" ? (
  <form action={launchWebsiteAction}>
    <input type="hidden" name="businessId" value={client.businessId} />
    <button
      type="submit"
      className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep"
    >
      Create &amp; launch website
    </button>
  </form>
) : null}
```

Add a one-line note under the button, in `text-sm text-ink-soft`: "Stopgap until the real build workflow exists — seeds six pages and marks the project live immediately." Import `launchWebsiteAction` from `./actions`.

- [x] **Step 3: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

---

### Task 3: Customer nav and the Monitoring page

**Files:**
- Modify: `apps/platform/components/panel/customer-shell.tsx`
- Create: `apps/platform/app/app-host/(protected)/monitoring/page.tsx`

- [x] **Step 1: Nav entries**

In `customer-shell.tsx`, add to `CUSTOMER_NAV` (import `PaletteIcon` and `GaugeIcon` from `@fynix/shared/ui/icons`), placed after "Set up your website" and before "Billing":

```ts
{ href: "/content", label: "Content", icon: <PaletteIcon className="size-5" /> },
{ href: "/monitoring", label: "Monitoring", icon: <GaugeIcon className="size-5" /> },
```

- [x] **Step 2: The Monitoring page**

```tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { deriveSiteStatus, type SiteStatus } from "@fynix/billing";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getProjectOverview } from "@/lib/server/onboarding";

export const metadata: Metadata = { title: "Monitoring" };

function statusCopy(status: SiteStatus): { readonly heading: string; readonly body: string; readonly tone: "ok" | "warn" } {
  switch (status.kind) {
    case "not_launched":
      return {
        heading: "Not live yet",
        body: "There's nothing to monitor until your website is built and launched. Check Your project for where things stand.",
        tone: "warn",
      };
    case "online":
      return { heading: "Your website is online", body: "Everything looks good right now.", tone: "ok" };
    case "offline":
      return {
        heading: "Your website is offline",
        body: "This is because a payment is due. Visit Billing to sort it out — your site returns automatically once it's paid.",
        tone: "warn",
      };
    default: {
      const unhandled: never = status;
      throw new Error(`Unhandled site status: ${JSON.stringify(unhandled)}`);
    }
  }
}

export default async function MonitoringPage(): Promise<ReactElement> {
  const { billing } = await requireCustomerAccess();
  const { project } = await getProjectOverview();

  const status = deriveSiteStatus(
    { projectStatus: project?.status ?? "onboarding", subscription: billing.subscription },
    new Date(),
  );
  const copy = statusCopy(status);

  return (
    <>
      <h1 className="heading-display text-[clamp(2.4rem,5vw,3.4rem)]">
        Monitoring<em>.</em>
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">Whether your website is reachable right now.</p>

      <div
        className={
          copy.tone === "ok"
            ? "mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8"
            : "mt-8 rounded-3xl border border-accent-deep/40 bg-accent-pale p-6 text-ink sm:p-8"
        }
      >
        <h2 className={copy.tone === "ok" ? "font-serif text-2xl" : "font-serif text-2xl text-accent-deep"}>{copy.heading}</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed">{copy.body}</p>
      </div>
    </>
  );
}
```

A project with no row at all (`project === null`, meaning onboarding has not even started) is treated as `"onboarding"` for the status check, which `deriveSiteStatus` correctly reports as `not_launched` — check this is really how `getProjectOverview` behaves (read `apps/platform/lib/server/onboarding.ts`) before relying on it.

- [x] **Step 3: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

---

### Task 4: The Content page — sections and gallery

**Files:**
- Create: `apps/platform/lib/server/content.ts`
- Create: `apps/platform/app/app-host/(protected)/content/page.tsx`
- Create: `apps/platform/app/app-host/(protected)/content/actions.ts`
- Create: `apps/platform/components/panel/section-edit-form.tsx`
- Create: `apps/platform/components/panel/gallery-manager.tsx`

- [ ] **Step 1: The reader**

```ts
import "server-only";
import { getWebsiteForBusiness, listGalleryItems, listMediaAssets, withTenantScope, type GalleryPhoto, type MediaAsset, type WebsiteDetail } from "@fynix/db";
import { cache } from "react";
import { requireCustomerAccess } from "./customer-access";
import { getAppDb } from "./db";

export interface ContentSnapshot {
  readonly website: WebsiteDetail | null;
  readonly gallery: readonly GalleryPhoto[];
  /** Photos already uploaded (during onboarding) that are not in the gallery yet, so they can be added. */
  readonly availablePhotos: readonly MediaAsset[];
}

/** Read once per request: the Content page's sections panel and gallery panel both ask for it. */
export const getContentSnapshot = cache(async (): Promise<ContentSnapshot> => {
  const { tenant } = await requireCustomerAccess();
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const website = await getWebsiteForBusiness(tx);
    const gallery = await listGalleryItems(tx);
    const photos = await listMediaAssets(tx, "photo");
    const inGallery = new Set(gallery.map((item) => item.media.id));
    return { website, gallery, availablePhotos: photos.filter((photo) => !inGallery.has(photo.id)) };
  });
});
```

Check `MediaAsset` is actually exported from `@fynix/db` with this exact name (it is used already in `apps/platform/app/app-host/(protected)/onboarding/brand/page.tsx`) before assuming the import works as written.

- [ ] **Step 2: Section edit form (client component)**

```tsx
"use client";

import { useActionState, type ReactElement } from "react";

export type SectionSaveResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
type SectionSaveAction = (sectionId: string, text: string) => Promise<SectionSaveResult>;

interface SectionEditFormProps {
  readonly sectionId: string;
  readonly initialText: string;
  readonly save: SectionSaveAction;
}

const initialState: SectionSaveResult = { ok: true };

/** One editable section: a textarea and a Save button, following the plan's "keep it simple" — no rich text. */
export function SectionEditForm({ sectionId, initialText, save }: SectionEditFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(
    async (_previous: SectionSaveResult, formData: FormData) => save(sectionId, String(formData.get("text") ?? "")),
    initialState,
  );

  return (
    <form action={formAction} className="mt-3">
      <label htmlFor={`section-${sectionId}`} className="sr-only">
        Section text
      </label>
      <textarea
        id={`section-${sectionId}`}
        name="text"
        defaultValue={initialText}
        rows={4}
        className="block w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-ink px-5 py-2 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {state.ok ? null : (
          <span role="alert" className="text-sm text-accent-deep">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Gallery manager (client component)**

```tsx
"use client";

import { useTransition, type ReactElement } from "react";
import { MediaThumbnail } from "@/components/panel/media-thumbnail";

export interface GalleryPhotoView {
  readonly id: string;
  readonly caption: string | null;
  readonly media: { readonly id: string; readonly width: number; readonly height: number; readonly altText: string | null };
}

export interface AvailablePhotoView {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly altText: string | null;
}

interface GalleryManagerProps {
  readonly items: readonly GalleryPhotoView[];
  readonly available: readonly AvailablePhotoView[];
  readonly onAdd: (mediaId: string) => Promise<void>;
  readonly onRemove: (itemId: string) => Promise<void>;
  readonly onMove: (itemId: string, direction: "up" | "down") => Promise<void>;
}

/** Reorders, captions and removes photos already in the gallery, and adds already-uploaded photos to it. Adding a
 * brand-new photo (not already uploaded) is deliberately out of scope — see this plan's "Deliberately deferred". */
export function GalleryManager({ items, available, onAdd, onRemove, onMove }: GalleryManagerProps): ReactElement {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-4 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <div key={item.id} className="rounded-2xl border border-line bg-paper p-3">
            <MediaThumbnail asset={item.media} alt={item.caption ?? "Gallery photo"} />
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                disabled={isPending || index === 0}
                onClick={() => startTransition(() => onMove(item.id, "up"))}
                className="text-ink-soft hover:text-ink disabled:opacity-30"
              >
                Move up
              </button>
              <button
                type="button"
                disabled={isPending || index === items.length - 1}
                onClick={() => startTransition(() => onMove(item.id, "down"))}
                className="text-ink-soft hover:text-ink disabled:opacity-30"
              >
                Move down
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => onRemove(item.id))}
                className="text-accent-deep hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 ? <p className="text-ink-soft">Nothing in your gallery yet.</p> : null}
      </div>

      {available.length === 0 ? null : (
        <div>
          <h3 className="font-serif text-xl">Add from your uploads</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((photo) => (
              <div key={photo.id} className="rounded-2xl border border-line bg-paper p-3">
                <MediaThumbnail asset={photo} alt={photo.altText ?? "Uploaded photo"} />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => onAdd(photo.id))}
                  className="mt-2 text-sm text-accent-deep hover:underline"
                >
                  Add to gallery
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: The actions**

```ts
"use server";

import {
  addGalleryItem,
  GalleryItemNotFoundError,
  listGalleryItems,
  removeGalleryItem,
  reorderGalleryItems,
  SectionNotEditableError,
  updateSectionContent,
  withTenantScope,
} from "@fynix/db";
import { refresh } from "next/cache";
import { requireBillingAccess } from "@/lib/server/billing";
import { getAppDb } from "@/lib/server/db";
import type { SectionSaveResult } from "@/components/panel/section-edit-form";

export async function saveSectionAction(sectionId: string, text: string): Promise<SectionSaveResult> {
  const { tenant } = await requireBillingAccess();
  try {
    await withTenantScope(getAppDb(), tenant, (tx) =>
      updateSectionContent(tx, { sectionId, content: { text }, visible: true }),
    );
  } catch (error) {
    if (error instanceof SectionNotEditableError) {
      return { ok: false, message: "This section can no longer be edited. Reload the page." };
    }
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function addToGalleryAction(mediaId: string): Promise<void> {
  const { tenant } = await requireBillingAccess();
  await withTenantScope(getAppDb(), tenant, (tx) => addGalleryItem(tx, { mediaId, caption: null }));
  refresh();
}

export async function removeFromGalleryAction(itemId: string): Promise<void> {
  const { tenant } = await requireBillingAccess();
  await withTenantScope(getAppDb(), tenant, (tx) => removeGalleryItem(tx, itemId));
  refresh();
}

/**
 * Swaps `itemId` with its neighbour in display order. Reads the current order fresh inside the same scope rather
 * than trusting what the browser last saw, since `reorderGalleryItems` requires the *exact* current full set.
 */
export async function moveGalleryItemAction(itemId: string, direction: "up" | "down"): Promise<void> {
  const { tenant } = await requireBillingAccess();
  await withTenantScope(getAppDb(), tenant, async (tx) => {
    const current = await listGalleryItems(tx);
    const ids = current.map((item) => item.id);
    const index = ids.indexOf(itemId);
    if (index === -1) throw new GalleryItemNotFoundError(itemId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= ids.length) return; // already at the edge; nothing to do
    [ids[index], ids[swapWith]] = [ids[swapWith]!, ids[index]!];
    await reorderGalleryItems(tx, ids);
  });
  refresh();
}
```

- [ ] **Step 5: The page**

```tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { GalleryManager } from "@/components/panel/gallery-manager";
import { SectionEditForm } from "@/components/panel/section-edit-form";
import { getContentSnapshot } from "@/lib/server/content";
import { addToGalleryAction, moveGalleryItemAction, removeFromGalleryAction, saveSectionAction } from "./actions";

export const metadata: Metadata = { title: "Content" };

function sectionText(content: unknown): string {
  return typeof content === "object" && content !== null && "text" in content && typeof content.text === "string"
    ? content.text
    : "";
}

export default async function ContentPage(): Promise<ReactElement> {
  const { website, gallery, availablePhotos } = await getContentSnapshot();

  if (website === null) {
    return (
      <>
        <h1 className="heading-display text-[clamp(2.4rem,5vw,3.4rem)]">
          Content<em>.</em>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Your content editor will be ready once your website is built. Check Your project for where things stand.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="heading-display text-[clamp(2.4rem,5vw,3.4rem)]">
        Content<em>.</em>
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">
        Edit the text and images we've marked as yours to change. Everything else — services, hours, pages — goes
        through a support request.
      </p>

      <div className="mt-8 grid gap-4">
        {website.pages.map((page) => (
          <section key={page.id} className="rounded-3xl border border-line bg-card p-6 sm:p-8">
            <h2 className="font-serif text-2xl">{page.title}</h2>
            {page.sections.length === 0 ? (
              <p className="mt-2 text-ink-soft">Nothing on this page yet.</p>
            ) : (
              page.sections.map((section) =>
                section.customerEditable ? (
                  <SectionEditForm
                    key={section.id}
                    sectionId={section.id}
                    initialText={sectionText(section.content)}
                    save={saveSectionAction}
                  />
                ) : (
                  <p key={section.id} className="mt-3 text-ink-soft">
                    {sectionText(section.content) || "—"}{" "}
                    <span className="text-sm">(edit through a support request)</span>
                  </p>
                ),
              )
            )}
          </section>
        ))}
      </div>

      <section className="mt-4 rounded-3xl border border-line bg-card p-6 sm:p-8">
        <h2 className="font-serif text-2xl">Gallery</h2>
        <GalleryManager
          items={gallery}
          available={availablePhotos}
          onAdd={addToGalleryAction}
          onRemove={removeFromGalleryAction}
          onMove={moveGalleryItemAction}
        />
      </section>

      <p className="mt-6">
        <a href="/content/blog" className="link-underline text-lg">
          Manage your blog →
        </a>
      </p>
    </>
  );
}
```

Use `Link` from `next/link` instead of a bare `<a>` for the blog link, matching the rest of the codebase's convention — check an existing page (e.g. the admin Overview page) for the import and confirm it applies here too.

- [ ] **Step 6: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

---

### Task 5: Blog

**Files:**
- Create: `apps/platform/lib/server/blog.ts`
- Create: `apps/platform/app/app-host/(protected)/content/blog/page.tsx`
- Create: `apps/platform/app/app-host/(protected)/content/blog/actions.ts`
- Create: `apps/platform/app/app-host/(protected)/content/blog/new/page.tsx`
- Create: `apps/platform/app/app-host/(protected)/content/blog/[postId]/page.tsx`

- [ ] **Step 1: The reader**

```ts
import "server-only";
import { listBlogPosts, withTenantScope, type BlogPost } from "@fynix/db";
import { cache } from "react";
import { requireCustomerAccess } from "./customer-access";
import { getAppDb } from "./db";

export const getBlogPosts = cache(async (): Promise<readonly BlogPost[]> => {
  const { tenant } = await requireCustomerAccess();
  return withTenantScope(getAppDb(), tenant, (tx) => listBlogPosts(tx));
});
```

- [ ] **Step 2: The actions**

```ts
"use server";

import {
  BlogPostNotFoundError,
  createBlogPost,
  publishBlogPost,
  softDeleteBlogPost,
  unpublishBlogPost,
  updateBlogPost,
  withTenantScope,
} from "@fynix/db";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireBillingAccess } from "@/lib/server/billing";
import { getAppDb } from "@/lib/server/db";

export type BlogFormResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export async function createBlogPostAction(_previous: BlogFormResult, formData: FormData): Promise<BlogFormResult> {
  const { tenant } = await requireBillingAccess();
  const title = String(formData.get("title") ?? "").trim();
  if (title === "") return { ok: false, message: "Give the post a title." };
  const slug = slugify(title);
  if (slug === "") return { ok: false, message: "That title doesn't make a usable web address. Try adding some letters." };

  const post = await withTenantScope(getAppDb(), tenant, (tx) =>
    createBlogPost(tx, { title, slug, excerpt: null, body: { text: "" } }),
  );
  redirect(`/content/blog/${post.id}`);
}

export async function updateBlogPostAction(postId: string, title: string, excerpt: string): Promise<BlogFormResult> {
  const { tenant } = await requireBillingAccess();
  try {
    await withTenantScope(getAppDb(), tenant, (tx) =>
      updateBlogPost(tx, { postId, title, excerpt: excerpt.trim() === "" ? null : excerpt }),
    );
  } catch (error) {
    if (error instanceof BlogPostNotFoundError) return { ok: false, message: "This post no longer exists. Reload the page." };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function publishBlogPostAction(postId: string): Promise<void> {
  const { tenant } = await requireBillingAccess();
  await withTenantScope(getAppDb(), tenant, (tx) => publishBlogPost(tx, postId));
  refresh();
}

export async function unpublishBlogPostAction(postId: string): Promise<void> {
  const { tenant } = await requireBillingAccess();
  await withTenantScope(getAppDb(), tenant, (tx) => unpublishBlogPost(tx, postId));
  refresh();
}

export async function deleteBlogPostAction(postId: string): Promise<void> {
  const { tenant } = await requireBillingAccess();
  await withTenantScope(getAppDb(), tenant, (tx) => softDeleteBlogPost(tx, postId));
  redirect("/content/blog");
}
```

Note: `body` is written as `{ text: "" }` on create and is never edited by `updateBlogPostAction` above — this plan deliberately keeps the post body out of the edit form for the first version (title + excerpt only), since a plain-text body editor is genuinely a separate, non-trivial piece of UI (needs its own text area, save action, and the same soft-deleted/cross-tenant guard as everything else here). If you have time and it is genuinely trivial given everything else in this file, add a `body` textarea and extend `updateBlogPostAction` to save it (`{ text: string }`, same shape as a section's content) — otherwise leave it for a quick follow-up and say so in your report.

- [ ] **Step 3: The list page**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { getBlogPosts } from "@/lib/server/blog";

export const metadata: Metadata = { title: "Blog" };

export default async function BlogListPage(): Promise<ReactElement> {
  const posts = await getBlogPosts();

  return (
    <>
      <h1 className="heading-display text-[clamp(2.4rem,5vw,3.4rem)]">
        Blog<em>.</em>
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">Write, edit, publish and unpublish freely — this is entirely yours.</p>

      <p className="mt-6">
        <Link
          href="/content/blog/new"
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep"
        >
          New post
        </Link>
      </p>

      <div className="mt-6 divide-y divide-line rounded-3xl border border-line bg-card">
        {posts.length === 0 ? (
          <p className="p-6 text-ink-soft">No posts yet.</p>
        ) : (
          posts.map((post) => (
            <Link key={post.id} href={`/content/blog/${post.id}`} className="flex items-center justify-between gap-3 p-6 hover:bg-paper-deep/60">
              <span className="font-serif text-lg">{post.title}</span>
              <span className="text-sm text-ink-soft">{post.status === "published" ? "Published" : "Draft"}</span>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: The new-post page**

```tsx
"use client";

import { useActionState, type ReactElement } from "react";
import { createBlogPostAction, type BlogFormResult } from "../actions";

const initialState: BlogFormResult = { ok: true };

export default function NewBlogPostPage(): ReactElement {
  const [state, formAction, isPending] = useActionState(createBlogPostAction, initialState);

  return (
    <>
      <h1 className="heading-display text-[clamp(2.4rem,5vw,3.4rem)]">
        New post<em>.</em>
      </h1>
      <form action={formAction} className="mt-8 max-w-xl rounded-3xl border border-line bg-card p-6 sm:p-8">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          className="mt-1.5 block w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent"
        />
        {state.ok ? null : (
          <p role="alert" className="mt-2 text-sm text-accent-deep">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="mt-4 rounded-full bg-ink px-5 py-2.5 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create post"}
        </button>
      </form>
    </>
  );
}
```

This is a client component because `useActionState` needs it, and `createBlogPostAction` redirects on success — check that a client component calling a redirecting server action through `useActionState` behaves the way you expect in this Next.js version (it should navigate on success without the component needing to do anything extra), and adjust if it does not.

- [ ] **Step 5: The edit page**

```tsx
import { listBlogPosts, withTenantScope } from "@fynix/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { BlogPostEditForm } from "@/components/panel/blog-post-edit-form";
import { deleteBlogPostAction, publishBlogPostAction, unpublishBlogPostAction, updateBlogPostAction } from "../actions";

export const metadata: Metadata = { title: "Edit post" };

export default async function BlogPostEditPage({
  params,
}: {
  readonly params: Promise<{ readonly postId: string }>;
}): Promise<ReactElement> {
  const { postId } = await params;
  const { tenant } = await requireCustomerAccess();
  const posts = await withTenantScope(getAppDb(), tenant, (tx) => listBlogPosts(tx));
  const post = posts.find((candidate) => candidate.id === postId);
  if (post === undefined) notFound();

  return (
    <>
      <h1 className="heading-display text-[clamp(2.4rem,5vw,3.4rem)]">
        {post.title}
        <em>.</em>
      </h1>
      <BlogPostEditForm
        post={post}
        save={updateBlogPostAction}
        publish={publishBlogPostAction}
        unpublish={unpublishBlogPostAction}
        remove={deleteBlogPostAction}
      />
    </>
  );
}
```

There is no dedicated `getBlogPost(tx, postId)` query — this reads the full list and finds the one post, which is fine for the small number of posts a local business blog will have. If you would rather add a single-post query to `packages/db/src/queries/blog.ts` for a cleaner read, that is a reasonable, small addition; just make sure it is genuinely simpler than this, not just different, and keep the same tenant-scoping/soft-delete-filtering behavior `listBlogPosts` already has.

- [ ] **Step 6: The edit form (client component)**

```tsx
"use client";

import { useActionState, useState, type ReactElement } from "react";
import type { BlogPost } from "@fynix/db";
import type { BlogFormResult } from "@/app/app-host/(protected)/content/blog/actions";

interface BlogPostEditFormProps {
  readonly post: BlogPost;
  readonly save: (postId: string, title: string, excerpt: string) => Promise<BlogFormResult>;
  readonly publish: (postId: string) => Promise<void>;
  readonly unpublish: (postId: string) => Promise<void>;
  readonly remove: (postId: string) => Promise<void>;
}

const initialState: BlogFormResult = { ok: true };

export function BlogPostEditForm({ post, save, publish, unpublish, remove }: BlogPostEditFormProps): ReactElement {
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [state, formAction, isPending] = useActionState(
    (_previous: BlogFormResult, formData: FormData) =>
      save(post.id, String(formData.get("title") ?? ""), String(formData.get("excerpt") ?? "")),
    initialState,
  );

  return (
    <div className="mt-8 max-w-xl">
      <form action={formAction} className="rounded-3xl border border-line bg-card p-6 sm:p-8">
        <label htmlFor="title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          defaultValue={post.title}
          required
          className="mt-1.5 block w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent"
        />
        <label htmlFor="excerpt" className="mt-4 block text-sm font-medium">
          Short summary (optional)
        </label>
        <textarea
          id="excerpt"
          name="excerpt"
          value={excerpt}
          onChange={(event) => setExcerpt(event.target.value)}
          rows={3}
          className="mt-1.5 block w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent"
        />
        {state.ok ? null : (
          <p role="alert" className="mt-2 text-sm text-accent-deep">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="mt-4 rounded-full bg-ink px-5 py-2.5 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-3">
        {post.status === "published" ? (
          <form action={() => unpublish(post.id)}>
            <button type="submit" className="rounded-full border border-line px-4 py-2 text-sm hover:bg-paper-deep">
              Unpublish
            </button>
          </form>
        ) : (
          <form action={() => publish(post.id)}>
            <button type="submit" className="rounded-full bg-ink px-4 py-2 text-sm text-paper hover:bg-accent-deep">
              Publish
            </button>
          </form>
        )}
        <form action={() => remove(post.id)}>
          <button type="submit" className="rounded-full px-4 py-2 text-sm text-accent-deep hover:bg-accent-pale">
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

---

### Task 6: Final verification

- [ ] **Step 1: Full checkpoint**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration
```

- [ ] **Step 2: Manual walk-through, described so the next verifier can follow it in the browser**

Since this plan adds real, clickable UI (unlike the previous data-only plan), don't stop at the checkpoint — describe (in your report) or actually perform, if you have browser access, this sequence: sign in to the admin console, open a client with a project, click "Create & launch website," then sign in as that customer and confirm the sidebar shows Content and Monitoring, Content shows six pages each with one editable text box that saves, the Gallery panel shows already-uploaded photos as addable, and Monitoring shows "online" (assuming the business has paid) or the correct offline/not-launched copy otherwise. Note in your report whether you were able to verify this live or only by reading the code.

---

## What comes next

**A visual/UI polish pass on the customer dashboard** (the user asked for this explicitly, 2026-09-17: "we have to work with the customer dashboard... the ui part one"). Scope not yet defined — revisit once this plan's tasks (including any pending fix rounds) are fully done and marked complete. Likely candidates based on what exists today: the customer sidebar currently uses the original light/cream `DashboardFrame` variant (the admin console got a branded dark-burgundy sidebar earlier this session — see `apps/platform/components/panel/dashboard-frame.tsx`'s `variant` prop); the new Content/Monitoring/Blog pages built in this plan were built for function first, not polish, so a pass over their layout, spacing and visual hierarchy is likely part of this too. Confirm actual scope with the user before starting rather than assuming either of these.
