"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import type { BlogCategoryWithStats } from "@/lib/server/blog-taxonomy";
import { EmptyState } from "@/components/v2/page";
import { cn } from "@brandbasket/shared/lib/cn";
import { PostDate } from "./parts";
import {
  COL_DATE,
  COL_POSTS,
  COL_SERIAL,
  SerialCell,
  TABLE_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
  TD_CLASS,
  TH_CLASS,
} from "./table";

/** Content → Categories as a table: name and its address, how many posts are filed under it, and the last edit. */
export function CategoriesTable({ categories }: { readonly categories: readonly BlogCategoryWithStats[] }): ReactElement {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = categories.filter(
    (category) =>
      needle === "" ||
      category.name.toLowerCase().includes(needle) ||
      (category.description ?? "").toLowerCase().includes(needle),
  );

  return (
    <div>
      <label className="relative ml-auto block w-full sm:w-64">
        <span className="sr-only">Search categories</span>
        <MagnifyingGlass size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search categories"
          className="block w-full rounded-lg border border-ink-2/65 bg-surface py-2 pl-10 pr-4 text-sm text-ink placeholder:text-ink-2 focus:border-ink focus:outline-none"
        />
      </label>

      <div className="mt-6 overflow-x-auto">
        <table className={cn(TABLE_CLASS, "min-w-[36rem]")}>
          <colgroup>
            <col className={COL_SERIAL} />
            <col />
            <col className={COL_POSTS} />
            <col className={COL_DATE} />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className={TH_CLASS}>No.</th>
              <th scope="col" className={TH_CLASS}>Name</th>
              <th scope="col" className={TH_CLASS}>Posts</th>
              <th scope="col" className={TH_CLASS}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((category, index) => (
              <tr key={category.id} className={TABLE_ROW_CLASS}>
                <SerialCell index={index} />
                <td className={TD_CLASS}>
                  <Link
                    href={`/content/categories/${category.id}`}
                    className="block truncate font-medium text-ink after:absolute after:inset-0 after:content-['']"
                  >
                    {category.name}
                  </Link>
                  <p className="truncate text-xs text-ink-soft">/blog/category/{category.slug}</p>
                </td>
                <td className={cn(TD_CLASS, "truncate tabular-nums text-ink-soft")}>
                  <span className="text-ink">{category.publishedCount}</span> published
                  {category.draftCount > 0
                    ? ` · ${category.draftCount} draft${category.draftCount === 1 ? "" : "s"}`
                    : null}
                </td>
                <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-ink-soft")}>
                  {category.updatedAt === 0 ? "-" : <PostDate time={category.updatedAt} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <div className="py-8">
            <EmptyState compact icon={MagnifyingGlass} title="Nothing found" text={`No categories match “${query.trim()}”.`} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
