import { UserCircle } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { AuthorsTable } from "@/components/panel/blog-editor/authors-table";
import { DARK_BUTTON } from "@/components/v2/classes";
import { ActionRow, EmptyState, PageSection } from "@/components/v2/page";
import { getBlogAuthorsWithStats } from "@/lib/server/blog-taxonomy";
import { requireWebsiteClient } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Authors" };

/** Content → Authors: the people who write the business's posts, and how much each has written. */
export default async function AuthorsPage(): Promise<ReactElement> {
  await requireWebsiteClient();
  const authors = await getBlogAuthorsWithStats();

  if (authors.length === 0) {
    return (
      <EmptyState
        icon={UserCircle}
        title="No authors yet"
        text="Add the people who write your posts, so readers know who’s behind them."
        action={
          <Link href="/content/authors/new" className={DARK_BUTTON}>
            Add an author
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ActionRow
        text={`${authors.length === 1 ? "1 author" : `${authors.length} authors`} · shown on the posts they write`}
        action={
          <Link href="/content/authors/new" className={DARK_BUTTON}>
            New author
          </Link>
        }
      />
      <PageSection id="authors" title="Authors">
        <AuthorsTable authors={authors} />
      </PageSection>
    </>
  );
}
