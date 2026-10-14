"use client";

import Link from "next/link";
import { useMemo, useState, type ReactElement } from "react";
import { SearchIcon } from "@fynix/shared/ui/icons";
import { cn } from "@fynix/shared/lib/cn";
import type { BlogPublishState } from "@/lib/blog-publish-state";
import type { BlogPostSummary } from "@/lib/server/blog";
import { BlogEmptyState } from "./blog-empty-state";
import { PostDate, StatusPill } from "./parts";
import {
  COL_DATE,
  COL_SERIAL,
  SerialCell,
  TABLE_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
  TD_CLASS,
  TH_CLASS,
} from "./table";

type Tab = "all" | BlogPublishState;

const TABS: readonly { readonly value: Tab; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "scheduled", label: "Scheduled" },
  { value: "draft", label: "Drafts" },
];

/**
 * The blog's posts as a table, the way the reference CMS lists them: title, author, category, status and dates, with
 * a search box and status tabs. Filtering happens here in the browser; the page already has every post (at most 200).
 */
export function BlogPostsTable({ posts }: { readonly posts: readonly BlogPostSummary[] }): ReactElement {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => posts.map((post) => ({ post, state: post.publishState })),
    [posts],
  );
  const counts = useMemo(() => {
    const result: Record<Tab, number> = { all: rows.length, published: 0, scheduled: 0, draft: 0 };
    for (const row of rows) result[row.state] += 1;
    return result;
  }, [rows]);

  const needle = query.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      (tab === "all" || row.state === tab) &&
      (needle === "" ||
        row.post.title.toLowerCase().includes(needle) ||
        (row.post.categoryName ?? "").toLowerCase().includes(needle) ||
        (row.post.authorName ?? "").toLowerCase().includes(needle)),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Filter posts" className="flex gap-6 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                "shrink-0 border-b-2 pb-1.5 text-sm transition-colors duration-200 ease-calm",
                tab === item.value
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              {item.label}
              <span className="ml-1.5 tabular-nums text-ink-soft/70">{counts[item.value]}</span>
            </button>
          ))}
        </div>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Search posts</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts"
            className="block w-full rounded-full border border-line bg-card py-2 pl-10 pr-4 text-sm text-ink placeholder:text-ink-soft/60 focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className={cn(TABLE_CLASS, "min-w-[44rem]")}>
          <colgroup>
            <col className={COL_SERIAL} />
            <col />
            <col className="hidden w-40 lg:table-column" />
            <col className="w-40" />
            <col className="w-32" />
            <col className={COL_DATE} />
            <col className={COL_DATE} />
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className={TH_CLASS}>No.</th>
              <th scope="col" className={TH_CLASS}>Title</th>
              <th scope="col" className={cn(TH_CLASS, "hidden lg:table-cell")}>Author</th>
              <th scope="col" className={TH_CLASS}>Category</th>
              <th scope="col" className={TH_CLASS}>Status</th>
              <th scope="col" className={TH_CLASS}>Published</th>
              <th scope="col" className={TH_CLASS}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ post, state }, index) => (
              <tr key={post.id} className={TABLE_ROW_CLASS}>
                <SerialCell index={index} />
                <td className={TD_CLASS}>
                  {/* The whole row opens the post: this link's hit area is stretched over it. */}
                  <Link
                    href={`/content/blog/${post.id}`}
                    className="block truncate font-medium text-ink after:absolute after:inset-0 after:content-['']"
                  >
                    {post.title}
                  </Link>
                </td>
                <td className={cn(TD_CLASS, "hidden truncate text-ink-soft lg:table-cell")}>{post.authorName ?? "—"}</td>
                <td className={cn(TD_CLASS, "truncate text-ink-soft")}>{post.categoryName ?? "—"}</td>
                <td className={TD_CLASS}>
                  <StatusPill state={state} />
                </td>
                <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-ink-soft")}>
                  {post.publishedAt === null || state === "draft" ? "—" : <PostDate time={post.publishedAt} />}
                </td>
                <td className={cn(TD_CLASS, "whitespace-nowrap tabular-nums text-ink-soft")}>
                  <PostDate time={post.updatedAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <div className="py-10">
            <BlogEmptyState
              title={needle === "" ? `No ${tab === "draft" ? "drafts" : `${tab} posts`}` : "Nothing found"}
              body={needle === "" ? "Posts show up here as soon as there are some." : `No posts match “${query.trim()}”.`}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
