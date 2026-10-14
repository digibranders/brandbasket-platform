import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { AuthorsTable } from "@/components/panel/blog-editor/authors-table";
import { BlogEmptyState } from "@/components/panel/blog-editor/blog-empty-state";
import { getBlogAuthorsWithStats } from "@/lib/server/blog-taxonomy";

export const metadata: Metadata = { title: "Authors" };

/** Content → Authors: the people who write the business's posts, and how much each has written. */
export default async function AuthorsPage(): Promise<ReactElement> {
  const authors = await getBlogAuthorsWithStats();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="panel-title">Authors</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {authors.length === 1 ? "1 author" : `${authors.length} authors`} · shown on the posts they write
          </p>
        </div>
        <ButtonLink href="/content/authors/new" size="sm">
          New author
        </ButtonLink>
      </div>

      <div className="mt-8">
        {authors.length === 0 ? (
          <BlogEmptyState
            art="name"
            title="No authors yet"
            body="Add the people who write your posts, so readers know who’s behind them."
            action={
              <ButtonLink href="/content/authors/new" size="sm">
                Add an author
              </ButtonLink>
            }
          />
        ) : (
          <AuthorsTable authors={authors} />
        )}
      </div>
    </>
  );
}
