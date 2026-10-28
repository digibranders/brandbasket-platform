export const WEBSITE_PATH = "/website";
export const WEBSITE_PAGES_PATH = "/website/pages";
export const WEBSITE_PREVIEW_IMAGE_PATH = "/website/preview-image";
/** Paths owned by other pages that the tabs point at. Plain strings. */
export const WEBSITE_BLOG_PATH = "/content/blog";

export interface WebsiteTab {
  readonly href: string;
  readonly label: string;
  /** Other paths (and the pages under them) that belong to this tab, so it stays marked there. */
  readonly alsoOwns?: readonly string[];
}
export const WEBSITE_TABS: readonly WebsiteTab[] = [
  { href: WEBSITE_PATH, label: "Progress" },
  { href: WEBSITE_PAGES_PATH, label: "Pages" },
  // Authors and categories are blog settings.
  { href: WEBSITE_BLOG_PATH, label: "Blog", alsoOwns: ["/content/authors", "/content/categories"] },
];

/** The tab a path belongs to: Progress only on /website itself; the others on their own path, the pages under it and what they also own. */
export function currentTab(pathname: string): WebsiteTab | null {
  const under = (base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);
  return WEBSITE_TABS.find((tab) => (tab.href === WEBSITE_PATH ? pathname === WEBSITE_PATH : [tab.href, ...(tab.alsoOwns ?? [])].some(under))) ?? null;
}

/** The Ask for a change form with Website chosen and a page filled in, for the preview's "Ask for changes" and the Pages tab. */
export function askAboutHref(page: string): string {
  return `/requests/new?kind=website&page=${encodeURIComponent(page)}`;
}
