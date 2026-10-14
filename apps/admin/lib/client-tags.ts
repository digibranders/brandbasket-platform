/**
 * The Verified and Trusted tags on a client's Listing section: which listing key the tags belong to, and the one-line
 * notice the page shows after a button. Pure, so the actions and the page agree and the notices are tested.
 */

/** What the notice query parameter (`tags`) can say. Fixed messages only: the parameter picks one, nothing more. */
export const CLIENT_TAG_NOTICE_KEYS = ["verified", "trusted", "untrusted", "unchanged", "no_listing"] as const;
export type ClientTagNotice = (typeof CLIENT_TAG_NOTICE_KEYS)[number];

export const CLIENT_TAG_NOTICES: Readonly<Record<ClientTagNotice, { readonly text: string; readonly ok: boolean }>> = {
  verified: { text: "Verified tag given. The website shows it within a minute.", ok: true },
  trusted: { text: "Trusted tag given. The website shows it within a minute.", ok: true },
  untrusted: {
    text: "Trusted tag taken away. The website stops showing it within a minute, unless the business lists a licence on its profile.",
    ok: true,
  },
  unchanged: { text: "Nothing changed: someone got there first.", ok: false },
  no_listing: { text: "This client has no listing yet. Save the listing first.", ok: false },
};

export function readClientTagNotice(raw: string | readonly string[] | undefined): ClientTagNotice | null {
  const value = typeof raw === "string" ? raw : raw?.[0];
  return CLIENT_TAG_NOTICE_KEYS.find((key) => key === value) ?? null;
}

/** The listing key a client's tags are kept under: its category, city, area and the name part of its address. */
export function clientListingKey(placement: {
  readonly categorySlug: string;
  readonly citySlug: string;
  readonly areaSlug: string;
  readonly slug: string;
}): string {
  return `${placement.categorySlug}/${placement.citySlug}/${placement.areaSlug}/${placement.slug}`;
}

export function clientTagsHref(businessId: string, notice: ClientTagNotice): string {
  return `/clients/${businessId}?tags=${notice}#listing`;
}
