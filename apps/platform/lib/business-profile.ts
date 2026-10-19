/*
 * The Business profile's tabs (docs/superpowers/specs/2026-10-01-business-profile-design.md and 2026-10-06-business-
 * profile-sections.md): Identity (the "details" tab), Listing, Services, Products, FAQ, Photos, Contact options, Reviews,
 * Promotions, Trust, Page tabs, then Review & publish. Browser-safe and pure: the page builds its tab row, picks the tab it opens
 * on and decides whether Publish is open from what is saved.
 */

import { pageTabLabel, type PageTabLabels } from "@brandbasket/shared/lib/directory/page-tabs";

export const PROFILE_TAB_IDS = [
  "details",
  "listing",
  "services",
  "products",
  "faq",
  "photos",
  "contact",
  "reviews",
  "promotions",
  "trust",
  "page-tabs",
  "review",
] as const;
export type ProfileTabId = (typeof PROFILE_TAB_IDS)[number];

/** What the page reads before it decides anything. */
export interface ProfileState {
  /** The Identity tab has been saved: the business has a profile row. */
  readonly hasDetails: boolean;
  /** A featured photo, live or waiting: the one photo a business needs before it can be published. */
  readonly hasPhoto: boolean;
  readonly hasVideo: boolean;
  readonly serviceCount: number;
  readonly productCount: number;
  readonly faqCount: number;
  /** At least one payment method or licence is saved. */
  readonly hasTrust: boolean;
  /** What the owner calls the Services and Products tabs on their page; a tab they did not name is left out. */
  readonly pageTabLabels: PageTabLabels;
  /**
   * `none` before the Listing tab is saved; `added` for a business its owner added (published from here); `claimed`
   * for a listing the directory already had, which staff confirm and which has no Publish.
   */
  readonly listing: "none" | "added" | "claimed";
  /** The claim's status, or null with no listing. */
  readonly status: "pending" | "approved" | "rejected" | null;
}

export interface ProfileTabView {
  readonly id: ProfileTabId;
  readonly label: string;
  /** Ticked when what the tab asks for is saved; tabs with nothing to fill in are never ticked. */
  readonly done: boolean;
}

/** An added business whose owner has published it: its page is live. */
export function isPublished(state: ProfileState): boolean {
  return state.listing === "added" && state.status === "approved";
}

export function isTakenDown(state: ProfileState): boolean {
  return state.status === "rejected";
}

/**
 * The tabs this business has, in the order of the owner's spec sheet (Identity, Services, Products, Photos, Customer
 * conversion, Reviews, Promotions, Trust) with Listing after Identity, where the category is chosen, and Review &
 * publish last. A claimed listing is confirmed by staff, so it has no Review & publish.
 */
export function profileTabs(state: ProfileState): readonly ProfileTabView[] {
  const tabs: ProfileTabView[] = [
    { id: "details", label: "Identity", done: state.hasDetails },
    { id: "listing", label: "Listing", done: state.listing !== "none" },
    { id: "services", label: pageTabLabel("services", state.pageTabLabels), done: state.serviceCount > 0 },
    { id: "products", label: pageTabLabel("products", state.pageTabLabels), done: state.productCount > 0 },
    { id: "faq", label: "FAQ", done: state.faqCount > 0 },
    { id: "photos", label: "Photos", done: state.hasPhoto },
    { id: "contact", label: "Contact options", done: state.hasDetails },
    { id: "reviews", label: "Reviews", done: false },
    { id: "promotions", label: "Promotions", done: false },
    { id: "trust", label: "Trust", done: state.hasTrust },
    { id: "page-tabs", label: "Page tabs", done: false },
  ];
  if (state.listing !== "claimed") tabs.push({ id: "review", label: isPublished(state) ? "Live page" : "Review & publish", done: isPublished(state) });
  return tabs;
}

/** The tabs still to fill in before the business can be published: Identity, Listing, then the feature photo on Photos. */
export function missingForPublish(state: ProfileState): readonly ProfileTabId[] {
  const missing: ProfileTabId[] = [];
  if (!state.hasDetails) missing.push("details");
  if (state.listing === "none") missing.push("listing");
  if (!state.hasPhoto) missing.push("photos");
  return missing;
}

/** Publish is open for an added business not live yet, once its Identity, Listing and feature photo are saved. */
export function canPublish(state: ProfileState): boolean {
  return missingForPublish(state).length === 0 && state.listing === "added" && state.status === "pending";
}

function isTabId(value: string): value is ProfileTabId {
  return (PROFILE_TAB_IDS as readonly string[]).includes(value);
}

/**
 * The tab the page opens on: the one asked for (`?tab=`) when the business has it; otherwise, for a business still
 * being set up, the next required thing (Identity, then Listing, then the feature photo on Photos, then Review), and Identity
 * for a business that is live or claimed.
 */
export function openingTab(state: ProfileState, asked: string | undefined): ProfileTabId {
  const available = profileTabs(state).map((tab) => tab.id);
  if (asked !== undefined && isTabId(asked) && available.includes(asked)) return asked;
  if (!state.hasDetails) return "details";
  if (state.listing === "claimed" || isPublished(state) || isTakenDown(state)) return "details";
  if (state.listing === "none") return "listing";
  if (!state.hasPhoto) return "photos";
  return "review";
}

/** The tab after this one, for the "Next" step; null after the last. */
export function nextTab(state: ProfileState, tab: ProfileTabId): ProfileTabId | null {
  const ids = profileTabs(state).map((view) => view.id);
  return ids[ids.indexOf(tab) + 1] ?? null;
}

/** A Business ID as the owner reads it: in capitals, "7K2M9QA". Ids are stored in lower case. */
export function displayBusinessId(placeId: string): string {
  return placeId.toUpperCase();
}
