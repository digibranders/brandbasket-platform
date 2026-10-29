import { CHATBOT_PATH } from "@/lib/chatbots-view";
import { currentSectionTab, type SectionTab } from "@/lib/section-tabs";

export const WEBSITE_PATH = "/website";
export const WEBSITE_PAGES_PATH = "/website/pages";
export const WEBSITE_PREVIEW_IMAGE_PATH = "/website/preview-image";
export type WebsiteTab = SectionTab;

export const WEBSITE_TABS: readonly WebsiteTab[] = [
  { href: WEBSITE_PATH, label: "Overview", exact: true },
  { href: WEBSITE_PAGES_PATH, label: "Pages" },
  // The website chat and its leads.
  { href: CHATBOT_PATH, label: "Enquiries" },
];

/** The tab a path belongs to: Overview only on /website itself; the others on their own path, the pages under it and what they also own. */
export function currentTab(pathname: string): WebsiteTab | null {
  return currentSectionTab(WEBSITE_TABS, pathname);
}

/** The Ask for a change form with Website chosen and a page filled in, for the preview's "Ask for changes" and the Pages tab. */
export function askAboutHref(page: string): string {
  return `/requests/new?kind=website&page=${encodeURIComponent(page)}`;
}
