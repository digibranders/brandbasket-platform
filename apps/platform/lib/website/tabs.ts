export const WEBSITE_PATH = "/website";
export const WEBSITE_PAGES_PATH = "/website/pages";
export const WEBSITE_PREVIEW_IMAGE_PATH = "/website/preview-image";
/** Paths owned by other pages that the tabs point at. Plain strings; lib/rail.test.ts pins the Chatbot one to the real path. */
export const WEBSITE_BLOG_PATH = "/content/blog";
export const WEBSITE_LEADS_PATH = "/oyechats/leads";

export interface WebsiteTab {
  readonly href: string;
  readonly label: string;
}
export const WEBSITE_TABS: readonly WebsiteTab[] = [
  { href: WEBSITE_PATH, label: "Progress" },
  { href: WEBSITE_PAGES_PATH, label: "Pages" },
  { href: WEBSITE_BLOG_PATH, label: "Blog" },
  { href: WEBSITE_LEADS_PATH, label: "Chatbot leads" },
];

/** The tab a path belongs to: Progress only on /website itself; Blog also for authors and categories pages is NOT assumed, they show no tab. */
export function currentTab(pathname: string): WebsiteTab | null {
  return WEBSITE_TABS.find((tab) => (tab.href === WEBSITE_PATH ? pathname === WEBSITE_PATH : pathname === tab.href || pathname.startsWith(`${tab.href}/`))) ?? null;
}

/** The Ask for a change form with Website chosen and a page filled in, for the preview's "Ask for changes" and the Pages tab. */
export function askAboutHref(page: string): string {
  return `/requests/new?kind=website&page=${encodeURIComponent(page)}`;
}
