"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import { SearchIcon } from "@brandbasket/shared/ui/icons";
import { cn } from "@brandbasket/shared/lib/cn";
import type { BlogAuthorWithStats } from "@/lib/server/blog-taxonomy";
import { AuthorAvatar } from "./author-avatar";
import { BlogEmptyState } from "./blog-empty-state";
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

/** Content → Authors as a table: who they are, how much they have written, and the last edit, with a search box. */
export function AuthorsTable({ authors }: { readonly authors: readonly BlogAuthorWithStats[] }): ReactElement {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = authors.filter(
    (author) =>
      needle === "" ||
      author.name.toLowerCase().includes(needle) ||
      (author.role ?? "").toLowerCase().includes(needle),
  );

  return (
    <div>
      <label className="relative ml-auto block w-full sm:w-64">
        <span className="sr-only">Search authors</span>
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search authors"
          className="block w-full rounded-full border border-line bg-card py-2 pl-10 pr-4 text-sm text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none"
        />
      </label>

      <div className="mt-6 overflow-x-auto">
        <table className={cn(TABLE_CLASS, "min-w-[42rem]")}>
          <colgroup>
            <col className={COL_SERIAL} />
            <col />
            <col className={COL_POSTS} />
            <col className="w-36" />
            <col className={COL_DATE} />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className={TH_CLASS}>No.</th>
              <th scope="col" className={TH_CLASS}>Name</th>
              <th scope="col" className={TH_CLASS}>Posts</th>
              <th scope="col" className={TH_CLASS}>Last published</th>
              <th scope="col" className={TH_CLASS}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((author, index) => (
              <tr key={author.id} className={TABLE_ROW_CLASS}>
                <SerialCell index={index} />
                <td className={TD_CLASS}>
                  <div className="flex items-center gap-3">
                    <AuthorAvatar name={author.name} photoUrl={author.photo?.url ?? null} />
                    <div className="min-w-0">
                      <Link
                        href={`/content/authors/${author.id}`}
                        className="block truncate font-medium text-ink after:absolute after:inset-0 after:content-['']"
                      >
                        {author.name}
                      </Link>
                      {author.role === null ? null : (
                        <p className="truncate text-xs text-ink-soft">{author.role}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className={cn(TD_CLASS, "truncate tabular-nums text-ink-soft")}>
                  <span className="text-ink">{author.publishedCount}</span> published
                  {author.draftCount > 0 ? ` · ${author.draftCount} draft${author.draftCount === 1 ? "" : "s"}` : null}
                </td>
                <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-ink-soft")}>
                  {author.lastPublishedAt === null ? "—" : <PostDate time={author.lastPublishedAt} />}
                </td>
                <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-ink-soft")}>
                  {author.updatedAt === 0 ? "—" : <PostDate time={author.updatedAt} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <div className="py-10">
            <BlogEmptyState art="name" title="Nothing found" body={`No authors match “${query.trim()}”.`} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
