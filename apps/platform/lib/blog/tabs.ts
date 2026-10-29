import { currentSectionTab, type SectionTab } from "@/lib/section-tabs";

export const BLOG_PATH = "/content/blog";
export const BLOG_AUTHORS_PATH = "/content/authors";
export const BLOG_CATEGORIES_PATH = "/content/categories";

/** The blog is one sidebar link and three pages: the posts, who writes them and how they are grouped. */
export const BLOG_TABS: readonly SectionTab[] = [
  { href: BLOG_PATH, label: "Posts" },
  { href: BLOG_AUTHORS_PATH, label: "Authors" },
  { href: BLOG_CATEGORIES_PATH, label: "Categories" },
];

/** The tab a path belongs to: Posts on the list and the editor, Authors and Categories on their own pages and the ones under them. */
export function currentBlogTab(pathname: string): SectionTab | null {
  return currentSectionTab(BLOG_TABS, pathname);
}
