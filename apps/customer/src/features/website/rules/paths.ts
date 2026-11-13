import type { TabLink } from "@/ui";

export const WEBSITE_PATH = "/website";
export const WEBSITE_PAGES_PATH = "/website/pages";
export const WEBSITE_BLOG_PATH = "/website/blog";
export const WEBSITE_DOMAIN_PATH = "/website/domain";
/** The picture of the preview, served by the route beside the Website page. `?v=` is only a cache buster. */
export const WEBSITE_PREVIEW_IMAGE_PATH = "/website/preview-image";
/** The New request dialog (owned by Requests) with Website chosen. */
export const ASK_FOR_CHANGE_HREF = "/requests?new=1&about=website";
/** Plan & billing with the Managed Website ready to add. */
export const ADD_WEBSITE_HREF = "/billing?add=website";

/** The Website section's tabs, shown once the site is live. Pages only when the sitemap sync found some (plan 61: never a Pages tab with no pages). */
export function websiteTabs(hasPages: boolean): readonly TabLink[] {
  return [
    { href: WEBSITE_PATH, label: "Overview" },
    ...(hasPages ? [{ href: WEBSITE_PAGES_PATH, label: "Pages" }] : []),
    { href: WEBSITE_BLOG_PATH, label: "Blog" },
    { href: WEBSITE_DOMAIN_PATH, label: "Domain" },
  ];
}
