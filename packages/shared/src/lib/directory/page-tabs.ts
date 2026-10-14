/*
 * The tabs along the top of a business's public page (the row under its photos that jumps to a card): which are always
 * there and which its owner chooses (docs/superpowers/specs/2026-10-09-page-tabs-design.md). Browser-safe and pure; the
 * platform's dashboard, the feed and the website's own copy of these ids all follow this list.
 */

/** The tabs every page has, in the order they sit. The owner cannot remove these. */
export const FIXED_PAGE_TABS = ["overview", "location", "reviews", "gallery"] as const;
export type FixedPageTab = (typeof FIXED_PAGE_TABS)[number];

/** The tabs the owner turns on: each shows only once it is on and has something to show. */
export const OPTIONAL_PAGE_TABS = ["offers", "services", "products", "trust", "faq", "appointment"] as const;
export type OptionalPageTab = (typeof OPTIONAL_PAGE_TABS)[number];

/** What a new profile shows beyond the fixed tabs: nothing, until its owner turns a tab on. */
export const DEFAULT_PAGE_TABS: readonly OptionalPageTab[] = [];

/** The word on each tab, as visitors read it. */
export const PAGE_TAB_LABELS: Readonly<Record<FixedPageTab | OptionalPageTab, string>> = {
  overview: "Overview",
  location: "Location",
  reviews: "Reviews",
  gallery: "Gallery",
  offers: "Offers",
  services: "Services",
  products: "Products",
  trust: "Good to know",
  faq: "FAQ",
  appointment: "Appointment",
};

export function isOptionalPageTab(value: unknown): value is OptionalPageTab {
  return typeof value === "string" && (OPTIONAL_PAGE_TABS as readonly string[]).includes(value);
}

/** The ids in `values` that are optional tabs, each once, in the order of OPTIONAL_PAGE_TABS; anything else is dropped. */
export function normalisePageTabs(values: readonly unknown[]): readonly OptionalPageTab[] {
  return OPTIONAL_PAGE_TABS.filter((tab) => values.includes(tab));
}

/** The tabs whose word the owner may change: a restaurant's Services become its "Menu", a clinic's Products its "Medicines". */
export const RENAMABLE_PAGE_TABS = ["services", "products"] as const;
export type RenamablePageTab = (typeof RENAMABLE_PAGE_TABS)[number];

/** The longest name the owner can give a tab: it sits in the row of tabs and heads a card, so it stays short. */
export const PAGE_TAB_LABEL_MAX_LENGTH = 24;

/** The names the owner chose; a tab left out keeps its own word (PAGE_TAB_LABELS). */
export type PageTabLabels = Readonly<Partial<Record<RenamablePageTab, string>>>;

/** Letters of any script (Hindi and Marathi names are welcome), digits, marks and a few punctuation marks: no symbols, emoji or tags. */
const PAGE_TAB_LABEL_PATTERN = /^[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M} &'\u2019.,/()+-]*$/u;

export type PageTabLabelCheck =
  | { readonly ok: true; readonly label: string | null }
  | { readonly ok: false; readonly message: string };

/**
 * Checks what the owner typed as a tab's name. Blank means "use the usual word" (label null); anything else is trimmed, runs of
 * spaces become one, and it must be at most PAGE_TAB_LABEL_MAX_LENGTH characters of letters, digits and common punctuation.
 */
export function checkPageTabLabel(raw: string): PageTabLabelCheck {
  const label = raw.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
  if (label === "") return { ok: true, label: null };
  if ([...label].length > PAGE_TAB_LABEL_MAX_LENGTH) {
    return { ok: false, message: `Keep a tab name to ${String(PAGE_TAB_LABEL_MAX_LENGTH)} characters or fewer.` };
  }
  if (!PAGE_TAB_LABEL_PATTERN.test(label)) {
    return { ok: false, message: "Use letters, numbers and simple punctuation in a tab name." };
  }
  return { ok: true, label };
}

/** The word on a tab as visitors read it: the owner's name for it when there is one, else the usual word. */
export function pageTabLabel(tab: FixedPageTab | OptionalPageTab, labels: PageTabLabels | undefined): string {
  if (tab === "services" || tab === "products") {
    const own = labels?.[tab];
    if (own !== undefined && own !== "") return own;
  }
  return PAGE_TAB_LABELS[tab];
}

/** The names that were chosen, with a blank or missing one left out: undefined when the owner changed none. */
export function chosenPageTabLabels(names: Readonly<Record<RenamablePageTab, string | null | undefined>>): PageTabLabels | undefined {
  const chosen: Partial<Record<RenamablePageTab, string>> = {};
  for (const tab of RENAMABLE_PAGE_TABS) {
    const name = names[tab];
    if (typeof name === "string" && name !== "") chosen[tab] = name;
  }
  return Object.keys(chosen).length === 0 ? undefined : chosen;
}
