import Link from "next/link";
import { PanelData } from "@/components";
import { formatDate, formatNumber, formatQuantity } from "@/lib/format";
import type { Loaded } from "@/lib/loaded";
import { LinkButton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import { authorPath, BLOG_AUTHORS_NEW_PATH, BLOG_AUTHORS_PATH, BLOG_CATEGORIES_NEW_PATH, BLOG_CATEGORIES_PATH, categoryPath } from "../rules/paths";
import type { BlogAuthor, BlogCategory } from "../server/store";
import { BlogFrame } from "./blog-frame";

interface ListProps<T> {
  readonly rows: Loaded<readonly T[]>;
  readonly canWrite: boolean;
  readonly hasPages: boolean;
  readonly now: Date;
}

/** The people who write the business's posts, and how much each has written. */
export function AuthorsScreen({ rows, canWrite, hasPages, now }: ListProps<BlogAuthor>) {
  const action = canWrite ? (
    <LinkButton href={BLOG_AUTHORS_NEW_PATH} variant="primary" icon="Plus">
      New author
    </LinkButton>
  ) : undefined;
  return (
    <BlogFrame current={BLOG_AUTHORS_PATH} hasPages={hasPages} actions={action}>
      <PanelData
        title="Authors"
        data={rows}
        what="your authors"
        flush
        meta={(authors) => (authors.length === 0 ? undefined : formatQuantity(authors.length, "author"))}
        isEmpty={(authors) => authors.length === 0}
        empty={{ icon: "UserCircle", title: "No authors yet", description: "Add the people who write your posts, so readers know who is behind them." }}
      >
        {(authors) => (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader hideOnPhone>Role</TableHeader>
                <TableHeader align="end">Published</TableHeader>
                <TableHeader hideOnPhone align="end">
                  Drafts
                </TableHeader>
                <TableHeader hideOnPhone>Last published</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {authors.map((author) => (
                <TableRow key={author.id}>
                  <TableCell className="font-medium text-ink">
                    <Link href={authorPath(author.id)}>{author.name}</Link>
                  </TableCell>
                  <TableCell hideOnPhone>{author.role ?? ""}</TableCell>
                  <TableCell align="end">{formatNumber(author.publishedCount)}</TableCell>
                  <TableCell hideOnPhone align="end">
                    {formatNumber(author.draftCount)}
                  </TableCell>
                  <TableCell hideOnPhone>{author.lastPublishedAt === null ? "Nothing published yet" : formatDate(new Date(author.lastPublishedAt), now)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelData>
    </BlogFrame>
  );
}

/** What posts are filed under. Each category has its own page on the website, at /blog/category/<address>. */
export function CategoriesScreen({ rows, canWrite, hasPages }: ListProps<BlogCategory>) {
  const action = canWrite ? (
    <LinkButton href={BLOG_CATEGORIES_NEW_PATH} variant="primary" icon="Plus">
      New category
    </LinkButton>
  ) : undefined;
  return (
    <BlogFrame current={BLOG_CATEGORIES_PATH} hasPages={hasPages} actions={action}>
      <PanelData
        title="Categories"
        data={rows}
        what="your categories"
        flush
        meta={(categories) => (categories.length === 0 ? undefined : formatQuantity(categories.length, "category", "categories"))}
        isEmpty={(categories) => categories.length === 0}
        empty={{ icon: "List", title: "No categories yet", description: "Categories group your posts by topic. Each one gets its own page on your website." }}
      >
        {(categories) => (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader hideOnPhone>Address</TableHeader>
                <TableHeader align="end">Published</TableHeader>
                <TableHeader hideOnPhone align="end">
                  Drafts
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium text-ink">
                    <Link href={categoryPath(category.id)}>{category.name}</Link>
                  </TableCell>
                  <TableCell hideOnPhone className="type-mono">{`/blog/category/${category.slug}`}</TableCell>
                  <TableCell align="end">{formatNumber(category.publishedCount)}</TableCell>
                  <TableCell hideOnPhone align="end">
                    {formatNumber(category.draftCount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelData>
    </BlogFrame>
  );
}
