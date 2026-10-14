import type {
  BusinessFaq,
  BusinessProduct,
  BusinessService,
  ConfirmedAddedBusiness,
  DirectoryListingRow,
  DirectoryProfile,
  SiteFacts,
} from "@fynix/db";
import { safeExternalHref, safeWebsiteHref } from "../safe-link";
import type {
  DirectoryFeedAddedListing,
  DirectoryFeedAddedProfile,
  DirectoryFeedButtons,
  DirectoryFeedHoliday,
  DirectoryFeedHours,
  DirectoryFeedListing,
  DirectoryFeedPlace,
} from "./feed-contract";
import { stateName } from "./india-states";
import { chosenPageTabLabels, normalisePageTabs } from "./page-tabs";

/** A business's record in the place registry (directory_places), with every old address registered for it. */
export interface FeedPlace {
  readonly id: string;
  readonly citySlug: string;
  readonly urlSlug: string;
  readonly legacyKeys: readonly string[];
}

/** The id, locked URL label and old addresses to send, or nothing when the business has no place yet. */
function placeFields(place: FeedPlace | null): DirectoryFeedPlace {
  if (place === null) return {};
  return {
    id: place.id,
    url: { city: place.citySlug, slug: place.urlSlug },
    legacyKeys: place.legacyKeys,
  };
}

export interface FeedListingInput {
  readonly row: DirectoryListingRow;
  readonly facts: SiteFacts;
  /** The subscription gives access right now. */
  readonly paid: boolean;
  /** The Appointments module is on, so Book may show. */
  readonly bookingEnabled: boolean;
  /** Today in the business's own time zone, YYYY-MM-DD. */
  readonly today: string;
  /** The listing's place in the registry; null until the registry has been imported. */
  readonly place: FeedPlace | null;
  /** The extra categories the business also lists in; absent or empty when none. */
  readonly alsoCategories?: readonly string[];
}

/** The feed's `alsoCategories` field for a business: present only when it lists in extra categories. */
function alsoCategoriesField(slugs: readonly string[] | undefined): { readonly alsoCategories?: readonly string[] } {
  return slugs === undefined || slugs.length === 0 ? {} : { alsoCategories: slugs };
}

/** The holidays still ahead of `today`, soonest first, in the feed's shape: a field the owner left blank is left out. */
function holidaysOf(facts: SiteFacts, today: string): DirectoryFeedHoliday[] {
  return facts.closures
    .filter((closure) => closure.endsOn >= today)
    .map((closure) => ({
      startsOn: closure.startsOn,
      endsOn: closure.endsOn,
      ...(closure.note === null ? {} : { reason: closure.note }),
      ...(typeof closure.opensAt === "string" && typeof closure.closesAt === "string" ? { opens: closure.opensAt, closes: closure.closesAt } : {}),
    }));
}

const SOCIAL_HOSTS = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  linkedin: ["linkedin.com"],
} as const;

/** The owner's social pages the directory may link to: https, on the network's own domain, nothing else. */
export function socialsOf(profile: {
  readonly instagramUrl?: string | null;
  readonly facebookUrl?: string | null;
  readonly linkedinUrl?: string | null;
} | null): NonNullable<DirectoryFeedAddedProfile["socials"]> {
  const given = { instagram: profile?.instagramUrl, facebook: profile?.facebookUrl, linkedin: profile?.linkedinUrl };
  const socials: { instagram?: string; facebook?: string; linkedin?: string } = {};
  for (const network of ["instagram", "facebook", "linkedin"] as const) {
    const value = given[network]?.trim();
    const href = value ? safeExternalHref(value) : null;
    if (href === null) continue;
    const host = new URL(href).hostname.toLowerCase();
    if (SOCIAL_HOSTS[network].some((domain) => host === domain || host.endsWith(`.${domain}`))) socials[network] = href;
  }
  return socials;
}

function hoursOf(facts: SiteFacts): DirectoryFeedHours[] {
  const hours: DirectoryFeedHours[] = [];
  for (const row of facts.hours) {
    if (row.closed) continue;
    if (row.openAllDay) {
      hours.push({ day: row.dayOfWeek, opens: "00:00", closes: "24:00" });
      continue;
    }
    if (row.opensAt === null || row.closesAt === null) continue;
    hours.push({ day: row.dayOfWeek, opens: row.opensAt.slice(0, 5), closes: row.closesAt.slice(0, 5) });
  }
  return hours;
}

/** A stored phone can be an empty string as well as null; either way there is no number to link to. */
function hasText(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

function buttonsOf(row: DirectoryListingRow, bookingEnabled: boolean): DirectoryFeedButtons {
  const { buttons } = row.content;
  const { placement } = row;
  const whatsappNumber = hasText(placement.whatsappPhone) ? placement.whatsappPhone : row.phone;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${placement.lat},${placement.lon}`;
  return {
    ...(buttons.call && hasText(row.phone) ? { call: `tel:${row.phone.replace(/[^\d+]/g, "")}` } : {}),
    ...(buttons.whatsapp && hasText(whatsappNumber)
      ? { whatsapp: `https://wa.me/${whatsappNumber.replace(/\D/g, "")}` }
      : {}),
    ...(buttons.book && bookingEnabled && placement.bookingUrl !== null ? { book: placement.bookingUrl } : {}),
    ...(buttons.directions ? { directions } : {}),
    ...(buttons.website && row.websiteUrl !== null ? { website: row.websiteUrl } : {}),
  };
}

/**
 * One listing as the directory receives it, or null when the client has hidden it. A lapsed payment keeps the
 * listing at its address as "basic" (spec: never 404, restored on payment); only featured listings carry the
 * client's text, hours and buttons.
 */
export function buildFeedListing({
  row,
  facts,
  paid,
  bookingEnabled,
  today,
  place,
  alsoCategories,
}: FeedListingInput): DirectoryFeedListing | null {
  if (!row.content.visible) return null;
  const { placement } = row;
  const base: DirectoryFeedListing = {
    address: {
      category: placement.categorySlug,
      state: placement.stateCode,
      city: placement.citySlug,
      area: placement.areaSlug,
      slug: placement.slug,
    },
    previousAddresses: placement.previousPaths,
    replacesSourcePath: placement.replacesSourcePath,
    ...placeFields(place),
    ...alsoCategoriesField(alsoCategories),
    tier: paid ? "featured" : "basic",
    name: row.name,
    streetAddress: row.streetAddress,
    lat: placement.lat,
    lon: placement.lon,
  };
  if (!paid) return base;

  // Typed by the client during onboarding, so only a well-formed https address is passed on.
  const googleProfileUrl =
    row.googleProfileUrl === null || row.googleProfileUrl.trim() === ""
      ? null
      : safeExternalHref(row.googleProfileUrl.trim());
  const announcement =
    facts.announcement !== null && facts.announcement.startsOn <= today && today <= facts.announcement.endsOn
      ? { message: facts.announcement.message, endsOn: facts.announcement.endsOn }
      : null;

  return {
    ...base,
    ...(row.content.about === null ? {} : { about: row.content.about }),
    ...(row.content.tagline === null ? {} : { tagline: { text: row.content.tagline, colour: row.content.taglineColour } }),
    tags: row.content.tags,
    ...(facts.timeZone === null ? {} : { timeZone: facts.timeZone }),
    hours: hoursOf(facts),
    closures: holidaysOf(facts, today),
    announcement,
    buttons: buttonsOf(row, bookingEnabled),
    ...(googleProfileUrl === null ? {} : { googleProfileUrl }),
  };
}

export interface AddedProfileInput {
  /** The Details, Photos and Trust tabs' row; null when the owner never saved one. */
  readonly profile: DirectoryProfile | null;
  readonly facts: SiteFacts;
  readonly services: readonly BusinessService[];
  readonly products: readonly BusinessProduct[];
  readonly faqs?: readonly BusinessFaq[];
  /** The ids of the owner's approved gallery photos, in slot order. */
  readonly gallery?: readonly string[];
  /** The business's date today, `YYYY-MM-DD`; holidays that ended before it are left out. */
  readonly today: string;
}

/**
 * The owner's Business profile as the directory receives it: everything the owner typed that a visitor can read, with
 * blank fields left out. Always returns a block (empty lists for a profile with nothing filled in), so the website can
 * tell "an older platform" (no block) from "the owner left it empty".
 */
export function buildAddedProfile({ profile, facts, services, products, faqs = [], gallery = [], today }: AddedProfileInput): DirectoryFeedAddedProfile {
  const about = profile?.about?.trim();
  const holidayHours = profile?.holidayHours?.trim();
  const serviceArea = profile?.serviceArea?.trim();
  const gstNumber = profile?.gstNumber?.trim();
  const pageTabLabels = chosenPageTabLabels({ services: profile?.servicesLabel, products: profile?.productsLabel });
  return {
    ...(about ? { about } : {}),
    ...(profile?.email?.trim() ? { email: profile.email.trim() } : {}),
    ...(gstNumber ? { gstNumber } : {}),
    hours: hoursOf(facts),
    ...(profile?.open24x7 ? { open24x7: true } : {}),
    ...(holidayHours ? { holidayHours } : {}),
    ...(holidaysOf(facts, today).length === 0 ? {} : { closures: holidaysOf(facts, today) }),
    ...(facts.timeZone === null ? {} : { timeZone: facts.timeZone }),
    services: services.map((service) => ({
      category: service.category,
      name: service.name,
      ...(service.summary === null ? {} : { summary: service.summary }),
      ...(service.description === null ? {} : { description: service.description }),
      ...(service.priceInr === null ? {} : { priceInr: service.priceInr }),
      ...(service.durationMinutes === null ? {} : { durationMinutes: service.durationMinutes }),
      ...(service.serviceArea === null ? {} : { serviceArea: service.serviceArea }),
    })),
    products: products.map((product) => ({
      name: product.name,
      ...(product.description === null ? {} : { description: product.description }),
      ...(product.priceInr === null ? {} : { priceInr: product.priceInr }),
      ...(product.category === null ? {} : { category: product.category }),
      availability: product.availability,
      // The photo's id, which the website asks for at /api/directory/product-pictures/<id>.
      ...(product.photoId === null ? {} : { photo: product.photoId }),
    })),
    faqs: faqs.map((faq) => ({ question: faq.question, answer: faq.answer })),
    ...(profile?.youtubeVideoId ? { youtubeVideoId: profile.youtubeVideoId } : {}),
    ...(Object.keys(socialsOf(profile)).length === 0 ? {} : { socials: socialsOf(profile) }),
    ...(profile?.establishedYear ? { establishedYear: profile.establishedYear } : {}),
    ...(serviceArea ? { serviceArea } : {}),
    paymentMethods: profile?.paymentMethods ?? [],
    licences: profile?.licences ?? [],
    pageTabs: normalisePageTabs(profile?.pageTabs ?? []),
    ...(pageTabLabels === undefined ? {} : { pageTabLabels }),
    ...(gallery.length > 0 ? { gallery } : {}),
  };
}

/**
 * The longest locality, district or state name the website reads in a `postal` block (its feed schema refuses longer,
 * and with it the whole entry). India Post's names are far shorter; this only keeps one odd row from costing a
 * business its page.
 */
export const FEED_POSTAL_NAME_MAX = 120;

function postalName(name: string): string {
  return name.length <= FEED_POSTAL_NAME_MAX ? name : name.slice(0, FEED_POSTAL_NAME_MAX).trimEnd();
}

/**
 * An owner-added, staff-confirmed business as the directory receives it, with its approved listing photo if it has
 * one and its place in the registry if it has one, or null when its key is not a full
 * `<category>/<city>/<area>/<slug>` address (the database checks the shape, so this guards only against a change there).
 */
export function buildAddedFeedListing(
  business: ConfirmedAddedBusiness,
  photo: string | null,
  place: FeedPlace | null,
  alsoCategories?: readonly string[],
  profile?: DirectoryFeedAddedProfile,
): DirectoryFeedAddedListing | null {
  const [category, city, area, slug, ...rest] = business.listingKey.split("/");
  if (!category || !city || !area || !slug || rest.length > 0) return null;
  const website = business.websiteUrl === null ? null : safeWebsiteHref(business.websiteUrl);
  const { postal, pin } = business;
  return {
    address: { category, state: business.stateCode, city, area, slug },
    ...placeFields(place),
    ...alsoCategoriesField(alsoCategories),
    ...(profile === undefined ? {} : { profile }),
    name: business.businessName,
    streetAddress: business.streetAddress ?? "",
    phone: business.phone,
    confirmedAt: business.confirmedAt.toISOString(),
    verified: business.verified,
    photo,
    ...(website === null ? {} : { website }),
    ...(pin === null ? {} : { pin: { lat: pin.lat, lon: pin.lon } }),
    ...(postal === null
      ? {}
      : {
          postal: {
            pincode: postal.pincode,
            locality: postalName(postal.localityName),
            district: postalName(postal.districtName),
            state: postalName(stateName(business.stateCode) ?? business.stateCode.toUpperCase()),
          },
        }),
  };
}
