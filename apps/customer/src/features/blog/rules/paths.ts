import type { TabLink } from "@/ui";
import { WEBSITE_BLOG_PATH } from "@/features/website/rules/paths";

/** The blog's addresses, under the Website section (plan 61 route map). */
export const BLOG_PATH = WEBSITE_BLOG_PATH;
export const BLOG_NEW_PATH = `${BLOG_PATH}/new`;
export const BLOG_AUTHORS_PATH = `${BLOG_PATH}/authors`;
export const BLOG_AUTHORS_NEW_PATH = `${BLOG_AUTHORS_PATH}/new`;
export const BLOG_CATEGORIES_PATH = `${BLOG_PATH}/categories`;
export const BLOG_CATEGORIES_NEW_PATH = `${BLOG_CATEGORIES_PATH}/new`;
/** Upload route for a cover image (`?post=<id>`) or an author photo (`?author=<id>`). */
export const BLOG_MEDIA_PATH = `${BLOG_PATH}/media`;

export const postPath = (id: string): string => `${BLOG_PATH}/${id}`;
export const postPreviewPath = (id: string): string => `${BLOG_PATH}/${id}/preview`;
export const authorPath = (id: string): string => `${BLOG_AUTHORS_PATH}/${id}`;
export const categoryPath = (id: string): string => `${BLOG_CATEGORIES_PATH}/${id}`;
/** A stored image, served by the tenant-checked media route. */
export const mediaPath = (id: string): string => `${BLOG_MEDIA_PATH}/${id}`;

/** The blog's three lists, as in the old app: the posts, who writes them, how they are grouped. */
export const BLOG_TABS: readonly TabLink[] = [
  { href: BLOG_PATH, label: "Posts" },
  { href: BLOG_AUTHORS_PATH, label: "Authors" },
  { href: BLOG_CATEGORIES_PATH, label: "Categories" },
];

/** Payload's ids are serial integers. Anything else is not a post, author, category or image of anyone's. */
const DOC_ID = /^[1-9]\d{0,14}$/;

export function isDocId(value: string): boolean {
  return DOC_ID.test(value);
}

/** The id in Payload's own form: a number for a serial id (Payload's relationship check refuses a numeric string). */
export function relationId(id: string): number {
  return Number(id);
}
