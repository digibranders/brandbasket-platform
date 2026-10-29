/** A tab under a page title (Website, Plan & billing). */
export interface SectionTab {
  readonly href: string;
  readonly label: string;
  /** Other paths (and the pages under them) that belong to this tab, so it stays marked there. */
  readonly alsoOwns?: readonly string[];
  /** Marked on its own path only, not on the pages under it (an Overview tab whose siblings live below it). */
  readonly exact?: boolean;
}

const under = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

/** The tab a path belongs to, or null on a page the tabs do not cover. */
export function currentSectionTab(tabs: readonly SectionTab[], pathname: string): SectionTab | null {
  return tabs.find((tab) => (tab.exact === true ? pathname === tab.href : [tab.href, ...(tab.alsoOwns ?? [])].some((base) => under(pathname, base)))) ?? null;
}

/** Every path the tabs cover, for the sidebar link that holds them to stay marked on any of their pages. */
export function sectionTabPaths(tabs: readonly SectionTab[]): readonly string[] {
  return tabs.flatMap((tab) => [tab.href, ...(tab.alsoOwns ?? [])]);
}
