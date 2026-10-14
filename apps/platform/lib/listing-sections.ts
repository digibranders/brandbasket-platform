import type { BusinessKind } from "@firstfold/db";

/**
 * Which of the directory sections a business's dashboard has. A free listing account has them all in its own menu
 * (components/panel/listing-account-shell.tsx). A free listing that buys Premium becomes a website client but keeps
 * its claim on the listing, and with it everything it had: its Listing page, leads, photos and ads, now in the
 * client's menu (components/panel/customer-shell.tsx). A client that never had a free listing has only the listing
 * staff placed for it, if any. Reviews, where an owner answers their business's reviews, comes with Leads: every verified
 * owner has it, on any plan (docs/superpowers/specs/2026-10-12-directory-owner-replies-design.md).
 */

/**
 * Whether the free listing's own pages (Listing, Photos, Advertise) open for this business: always for a free listing
 * account, and for a website client only while it owns a listing through a claim, which makes it a Premium member.
 */
export function opensClaimPages(kind: BusinessKind, hasClaim: boolean): boolean {
  return kind === "listing" || hasClaim;
}

/** A website client's ways onto the directory: a listing staff placed for it, and a claim it brought from its free listing. */
export interface ClientListingState {
  readonly ownListing: boolean;
  readonly claim: boolean;
}

/**
 * A client's directory sections, in menu order. `listing` is the tab for the listing staff placed (/listing);
 * `claim-listing` is the free listing's Business profile (/business), shown only when there is no placed listing, so
 * the menu never has two. The Business profile holds the claim's photos; with a placed listing instead, `photos`
 * (which opens the profile's Photos tab) keeps them reachable.
 */
export type ClientListingSection = "listing" | "claim-listing" | "leads" | "reviews" | "photos" | "deals" | "advertise";

export function clientListingSections({ ownListing, claim }: ClientListingState): readonly ClientListingSection[] {
  const listing: readonly ClientListingSection[] = ownListing ? ["listing"] : claim ? ["claim-listing"] : [];
  if (listing.length === 0) return [];
  if (!claim) return [...listing, "leads", "reviews"];
  return ownListing ? [...listing, "leads", "reviews", "photos", "deals", "advertise"] : [...listing, "leads", "reviews", "deals", "advertise"];
}
