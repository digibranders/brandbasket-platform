"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactElement } from "react";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { cn } from "@brandbasket/shared/lib/cn";
import type { CategoryFormResult } from "@/app/app-host/(protected)/content/categories/actions";
import {
  CATEGORY_DESCRIPTION_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  slugFollowsName,
  type BlogCategoryFields,
} from "@/lib/blog-category-fields";
import { truncateAtWord, META_DESCRIPTION_MAX_LENGTH } from "@/lib/blog-seo";
import { slugify } from "@/lib/blog-slug";
import type { BlogCategoryWithStats } from "@/lib/server/blog-taxonomy";
import { AutoToggle, Counter, INPUT_CLASS, SidebarSection } from "./parts";
import { SearchPanel } from "./search-panel";

interface CategoryEditorProps {
  readonly category: BlogCategoryWithStats;
  /** The website's host, e.g. "asterphysio.com"; null when none is connected. */
  readonly siteHost: string | null;
  readonly save: (categoryId: string, fields: BlogCategoryFields) => Promise<CategoryFormResult>;
  readonly remove: (categoryId: string) => Promise<CategoryFormResult>;
}

function fieldsOf(category: BlogCategoryWithStats): BlogCategoryFields {
  return {
    name: category.name,
    description: category.description ?? "",
    slugAuto: slugFollowsName(category.slug, category.name),
    slug: category.slug,
    metaTitle: category.metaTitle ?? "",
    metaDescription: category.metaDescription ?? "",
  };
}

function same(a: BlogCategoryFields, b: BlogCategoryFields): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One category, laid out like the post and author screens: what it is on the left (name, description), and where it
 * lives and how it shows in Google on the right. A category has its own page on the website, which is why its
 * address and search text are here at all; everything else in the reference CMS (icon, parent, schema) is left out.
 */
export function CategoryEditor({ category, siteHost, save, remove }: CategoryEditorProps): ReactElement {
  const [fields, setFields] = useState<BlogCategoryFields>(() => fieldsOf(category));
  const [saved, setSaved] = useState<BlogCategoryFields>(() => fieldsOf(category));
  const [lastSent, setLastSent] = useState<BlogCategoryFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // After a save, take in what was stored (address numbered, text trimmed) unless the customer has typed since.
  const [syncedAt, setSyncedAt] = useState(category.updatedAt);
  if (category.updatedAt !== syncedAt) {
    setSyncedAt(category.updatedAt);
    const fresh = fieldsOf(category);
    if (same(fields, saved) || (lastSent !== null && same(fields, lastSent))) setFields(fresh);
    setSaved(fresh);
  }
  const dirty = !same(fields, saved);
  const update = useCallback((patch: Partial<BlogCategoryFields>) => {
    setFields((current) => ({ ...current, ...patch }));
  }, []);

  const runSave = useCallback(() => {
    setError(null);
    setLastSent(fields);
    const sent = fields;
    startTransition(async () => {
      const result = await save(category.id, sent);
      if (!result.ok) setError(result.message);
    });
  }, [category.id, fields, save]);

  const runSaveRef = useRef(runSave);
  useEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        runSaveRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const shownSlug = fields.slugAuto ? slugify(fields.name) : slugify(fields.slug);
  // The server needs a name, and an address with some letters or numbers in it. A blank typed address falls back to the name's.
  const hasName = fields.name.trim() !== "";
  const hasAddress = slugify(!fields.slugAuto && fields.slug.trim() !== "" ? fields.slug : fields.name) !== "";
  const host = siteHost ?? "yourwebsite.com";
  const description = fields.description.trim();

  return (
    <div className="-mt-4">
      <div className="sticky top-0 z-30 -mx-6 border-b border-line/70 bg-paper/90 px-6 py-4 backdrop-blur-md md:-mx-8 md:px-8 xl:-mx-10 xl:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/content/categories"
              className="shrink-0 text-sm text-ink-soft transition-colors duration-200 ease-calm hover:text-ink"
            >
              ← Categories
            </Link>
            <p className="min-w-0 truncate font-serif text-lg text-ink">{fields.name || "Unnamed category"}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-soft">{isPending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
            <Button type="button" size="sm" disabled={isPending || !dirty || !hasName || !hasAddress} onClick={runSave} className="h-10">
              Save
            </Button>
          </div>
        </div>
        {error === null ? null : (
          <p role="alert" className="mt-3 text-sm text-accent-deep">
            {error}
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-14">
        <div className="min-w-0 max-w-2xl space-y-7">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
              Name
              <RequiredMark />
            </label>
            <input
              id="name"
              required
              value={fields.name}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              onChange={(event) => update({ name: event.target.value })}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="description" className="text-[0.8125rem] font-semibold text-ink">
                Description
              </label>
              <Counter value={fields.description.length} max={CATEGORY_DESCRIPTION_MAX_LENGTH} />
            </div>
            <textarea
              id="description"
              rows={4}
              value={fields.description}
              maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH}
              placeholder="A line or two about what these posts cover. Shown at the top of the category’s page."
              onChange={(event) => update({ description: event.target.value.replace(/\n/g, " ") })}
              className={cn(INPUT_CLASS, "resize-none")}
            />
          </div>

          <div className="border-t border-line/70 pt-6">
            <p className="font-serif text-3xl tabular-nums text-ink">{category.publishedCount}</p>
            <p className="text-sm text-ink-soft">
              published {category.publishedCount === 1 ? "post" : "posts"} in this category
              {category.draftCount > 0 ? ` · ${category.draftCount} in draft` : null}
            </p>
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <SidebarSection title="Web address">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="slug" className="text-[0.8125rem] font-semibold text-ink">
                Address
              </label>
              <AutoToggle
                checked={fields.slugAuto}
                label="The address follows the name"
                onChange={(slugAuto) => update(slugAuto ? { slugAuto } : { slugAuto, slug: shownSlug })}
              />
            </div>
            <input
              id="slug"
              value={fields.slugAuto ? shownSlug : fields.slug}
              readOnly={fields.slugAuto}
              maxLength={100}
              spellCheck={false}
              autoCapitalize="none"
              onChange={(event) => update({ slug: event.target.value })}
              className={cn(INPUT_CLASS, "py-2 text-sm", fields.slugAuto && "cursor-default bg-paper-deep/50 text-ink-soft")}
            />
            <p className="mt-1.5 break-all text-xs text-ink-soft">
              {host}/blog/category/<span className="text-ink">{shownSlug || "…"}</span>
            </p>
          </SidebarSection>

          <SearchPanel
            breadcrumb={[host, "blog", "category", shownSlug || "…"].join(" › ")}
            titleDefault={fields.name}
            descriptionDefault={description === "" ? null : truncateAtWord(description, META_DESCRIPTION_MAX_LENGTH)}
            titleFollows="Search title follows the category name"
            descriptionSource="Taken from the description"
            descriptionEmpty="Add a description and it appears here."
            metaTitleAuto={fields.metaTitle === ""}
            metaTitle={fields.metaTitle}
            metaDescriptionAuto={fields.metaDescription === ""}
            metaDescription={fields.metaDescription}
            onChange={(patch) =>
              update({
                ...(patch.metaTitleAuto === true ? { metaTitle: "" } : {}),
                ...(patch.metaTitle === undefined ? {} : { metaTitle: patch.metaTitle }),
                ...(patch.metaDescriptionAuto === true ? { metaDescription: "" } : {}),
                ...(patch.metaDescription === undefined ? {} : { metaDescription: patch.metaDescription }),
              })
            }
          />

          <SidebarSection title="Remove">
            <p className="text-xs text-ink-soft">Its posts stay on your website, just without a category.</p>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`Delete ${category.name}? Its posts stay, without a category.`)) return;
                startTransition(async () => {
                  const result = await remove(category.id);
                  if (!result.ok) setError(result.message);
                });
              }}
              className="mt-3 rounded-full px-3.5 py-1.5 text-xs font-semibold text-accent-deep ring-1 ring-accent/20 transition-colors duration-200 ease-calm hover:bg-accent-pale disabled:opacity-60"
            >
              Delete category
            </button>
          </SidebarSection>
        </aside>
      </div>
    </div>
  );
}
