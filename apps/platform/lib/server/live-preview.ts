import "server-only";
import {
  businessUrlCode,
  findDirectoryProfile,
  findPlaces,
  listBusinessFaqs,
  listBusinessProducts,
  listBusinessServices,
  readDealsOnShow,
  readLiveDirectoryPictures,
  readOwnApprovedDirectoryPictures,
  readSiteFacts,
  type DirectoryClaim,
  type DirectoryProfile,
} from "@brandbasket/db";
import { DEFAULT_BUSINESS_TIME_ZONE, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { DIRECTORY_DEALS_TIME_ZONE } from "@brandbasket/shared/lib/directory/deals-contract";
import { buildAddedFeedListing, buildAddedProfile } from "@brandbasket/shared/lib/directory/feed";
import type { DirectoryFeedAddedListing } from "@brandbasket/shared/lib/directory/feed-contract";
import { GALLERY_SLOTS } from "@brandbasket/shared/lib/directory/pictures";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/lib/leads-api";
import { previewOrigins } from "@/lib/preview-origins";
import { previewLink } from "@/lib/preview-link";
import type { PreviewBase } from "@/lib/preview-draft";
import { getStaffDb } from "./db";

/**
 * Where the live preview is drawn: its address on the website, and the origins the frame may end up on (the website's
 * address, and its www twin when the address redirects to it): the only windows the dashboard exchanges messages with.
 */
export interface LivePreviewSource {
  readonly src: string;
  readonly origins: readonly string[];
}

/**
 * The live preview for a business, or null when there is nothing to show it for: the business has no page yet (no
 * place id), or the secret shared with the website isn't set, so the website could not tell the link is ours.
 */
export function livePreviewSource(placeId: string | null, now: Date): LivePreviewSource | null {
  const secret = process.env.LEADS_API_TOKEN?.trim() ?? "";
  if (placeId === null || secret.length < LEADS_API_TOKEN_MIN_LENGTH) return null;
  const origin = new URL(siteConfig.url).origin;
  return { src: previewLink({ websiteOrigin: origin, code: businessUrlCode(placeId), secret, now }), origins: previewOrigins(origin) };
}

/**
 * What the owner's page can be drawn from when the website has no entry for it (it is not live yet, or was published a
 * moment ago and the website has not read the feed since): the business as the directory's feed would send it. Null
 * when it cannot be drawn that way: one outside the opened districts (its page is a simpler one), or one with no place yet.
 */
async function addedEntry(input: {
  readonly claim: DirectoryClaim;
  readonly profile: DirectoryProfile | null;
  readonly placeId: string;
  readonly photo: string | null;
  readonly now: Date;
}): Promise<DirectoryFeedAddedListing | null> {
  const { claim, profile, placeId, photo, now } = input;
  if (claim.pincode !== null) return null;
  const place = (await findPlaces(getStaffDb(), [placeId])).get(placeId);
  if (place === undefined) return null;
  return buildAddedFeedListing(
    {
      businessId: claim.businessId,
      listingKey: claim.listingKey,
      placeId,
      businessName: claim.businessName,
      streetAddress: profile?.streetAddress ?? claim.streetAddress,
      phone: profile?.phone ?? claim.phone,
      websiteUrl: profile?.websiteUrl ?? claim.websiteUrl,
      confirmedAt: now,
      // How it will look once published: Claimed, not Verified.
      verified: false,
      stateCode: place.stateCode,
      postal: null,
      pin: profile?.pin == null ? null : { lat: profile.pin.latitude, lon: profile.pin.longitude },
    },
    photo,
    { id: place.id, citySlug: place.citySlug, urlSlug: place.urlSlug, legacyKeys: [] },
  );
}

/**
 * An owner's saved Business profile as the directory's feed would carry it, read now from our database: the same builder
 * the feed uses, so the preview draws exactly what the website will, but without waiting up to a minute for the website
 * to hear of a save. With its feature photo (live pictures only: what a visitor can see) and the offers on show today.
 *
 * For a business its owner added (`added`), the base carries the whole entry the website can draw it from, which it does
 * only while it holds none of its own, and its pictures are the owner's own approved ones, whether or not the page is
 * live yet.
 */
export async function livePreviewBase(input: {
  readonly businessId: string;
  readonly placeId: string;
  readonly now: Date;
  readonly added?: { readonly claim: DirectoryClaim; readonly profile: DirectoryProfile | null };
}): Promise<PreviewBase> {
  const { businessId, placeId, now, added } = input;
  const db = getStaffDb();
  const [profile, facts, services, products, faqs, pictures] = await Promise.all([
    findDirectoryProfile(db, businessId),
    readSiteFacts(db, businessId),
    listBusinessServices(db, businessId),
    listBusinessProducts(db, businessId),
    listBusinessFaqs(db, businessId),
    added === undefined
      ? readLiveDirectoryPictures(db, { placeIds: [placeId], unplacedKeys: [] }).then((live) => live.get(placeId))
      : readOwnApprovedDirectoryPictures(db, businessId),
  ]);
  const gallery = GALLERY_SLOTS.flatMap((slot) => pictures?.[slot] ?? []);
  const photo = pictures?.listing ?? null;
  const today = localDateIn(facts.timeZone ?? DEFAULT_BUSINESS_TIME_ZONE, now);
  const deals = await readDealsOnShow(db, localDateIn(DIRECTORY_DEALS_TIME_ZONE, now));
  const offers = deals.filter((deal) => deal.placeId === placeId).map(({ id, badge, title, terms }) => ({ id, badge, title, terms }));
  const entry = added === undefined ? null : await addedEntry({ claim: added.claim, profile: added.profile, placeId, photo, now });
  return {
    owner: buildAddedProfile({ profile, facts, services, products, faqs, gallery, today }),
    photo,
    offers,
    ...(entry === null ? {} : { entry }),
    // The lists above keep the rows' order, so these line up with them.
    ids: { offers: offers.map((offer) => offer.id), services: services.map((row) => row.id), products: products.map((row) => row.id), faqs: faqs.map((row) => row.id) },
  };
}
