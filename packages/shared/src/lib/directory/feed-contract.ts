/**
 * GET /api/directory/listings: what the platform tells the /in directory about Featured listings.
 *
 * This file is copied verbatim into the website repo (like lib/leads-api.ts). The contract is additive-only: never
 * rename or remove a field; add optional ones and bump nothing. `version` changes only for a breaking change, which
 * this rule exists to avoid.
 */
export const DIRECTORY_FEED_VERSION = 1;

export interface DirectoryFeedAddress {
  readonly category: string;
  readonly state: string;
  readonly city: string;
  readonly area: string;
  readonly slug: string;
}

export interface DirectoryFeedHours {
  /** 0 = Monday ... 6 = Sunday, as business_hours stores it. */
  readonly day: number;
  /**
   * "HH:MM", 24-hour, in the business's own time. An all-day opening is "00:00" to "24:00". A closes earlier than
   * opens means it closes after midnight, on the next day. A day with no entry is closed or was not given.
   */
  readonly opens: string;
  readonly closes: string;
}

/**
 * Days a business keeps different hours from its usual week: a holiday. "YYYY-MM-DD", both days included, read in the
 * business's own time zone. Without `opens`/`closes` the business is shut all day; with them (both, never one) those
 * hours apply on every day in the range, and a closes earlier than opens runs past midnight, as in DirectoryFeedHours.
 */
export interface DirectoryFeedHoliday {
  readonly startsOn: string;
  readonly endsOn: string;
  /** What the day is, e.g. "Diwali". Absent when the owner gave none. */
  readonly reason?: string;
  readonly opens?: string;
  readonly closes?: string;
}

export interface DirectoryFeedButtons {
  readonly call?: string;
  readonly whatsapp?: string;
  readonly book?: string;
  readonly directions?: string;
  readonly website?: string;
}

/**
 * The place registry's record of a business, which both kinds of feed entry carry. The three fields are optional
 * only for the switch to ids: an entry whose business is not in the registry yet (the dataset's places are not
 * imported, or the backfill has not reached it) comes without them, exactly as it did before ids, and the website
 * keeps building its page from `address`. Phase 6 of docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md
 * (Task 13) makes them required, drops the entries that lack them, and removes `address`, `previousAddresses` and
 * `replacesSourcePath`.
 */
export interface DirectoryFeedPlace {
  /** Permanent id: the last part of the business's URL. */
  readonly id?: string;
  /**
   * The URL's locked label: /in/mh/<city>/business/<slug>/<id>. Both parts are the place's own city_slug and
   * url_slug, which only a staff action changes, so they are not `address.city` and `address.slug`.
   */
  readonly url?: { readonly city: string; readonly slug: string };
  /** Pre-id addresses (<service>/<city>/<area>/<slug>) that 301 here, sorted. Empty for a business that never had one. */
  readonly legacyKeys?: readonly string[];
}

export interface DirectoryFeedListing extends DirectoryFeedPlace {
  readonly address: DirectoryFeedAddress;
  /** Full /in paths this listing used to have; redirect each to the current address. */
  readonly previousAddresses: readonly string[];
  /** The unconfirmed /in path this listing replaces; hide that row everywhere. */
  readonly replacesSourcePath: string | null;
  /** "basic" while payment has lapsed: show name, category, area and address only. */
  readonly tier: "featured" | "basic";
  readonly name: string;
  readonly streetAddress: string;
  readonly lat: number;
  readonly lon: number;
  /** Featured only from here on. */
  readonly about?: string;
  /** The tagline card on the business's page: its line and colour (a LISTING_TAGLINE_COLOURS name). Absent when none is set (added 2026-10-09). */
  readonly tagline?: { readonly text: string; readonly colour: string };
  readonly tags?: readonly string[];
  readonly timeZone?: string;
  readonly hours?: readonly DirectoryFeedHours[];
  /** Holidays that have not ended yet, soonest first (hours added 2026-10-10). */
  readonly closures?: readonly DirectoryFeedHoliday[];
  readonly announcement?: { readonly message: string; readonly endsOn: string } | null;
  readonly buttons?: DirectoryFeedButtons;
  /** The business's Google Business Profile, an https URL. Absent when none is given. */
  readonly googleProfileUrl?: string;
  /**
   * Slugs of the extra categories the business also lists in (never its main one; at most three; added 2026-10-07).
   * The directory shows it on those categories' list pages in its area as well. Absent when it has none.
   */
  readonly alsoCategories?: readonly string[];
}

/** Where India Post puts an added business outside the opened districts (added 2026-10-06). */
export interface DirectoryFeedPostal {
  /** Six digits, "700091". */
  readonly pincode: string;
  /** The post-office locality its owner picked, "Salt Lake Sector V". */
  readonly locality: string;
  readonly district: string;
  /** The state's name, "West Bengal". */
  readonly state: string;
}

/** One service from the Services tab of an owner-added business's profile (added 2026-10-07). */
export interface DirectoryFeedService {
  /** The group it sits under on the page: "Cleaning", "Root canal". */
  readonly category: string;
  readonly name: string;
  /** The one line under the name in the list (added 2026-10-10). */
  readonly summary?: string;
  /** The long explanation the popup shows; up to 2000 characters since 2026-10-10 (300 before). */
  readonly description?: string;
  /** Whole rupees; absent when the price is on request. */
  readonly priceInr?: number;
  readonly durationMinutes?: number;
  /** Where it is offered, when that differs from the business's own area. */
  readonly serviceArea?: string;
}

/** One product from the Products tab of an owner-added business's profile (added 2026-10-07). */
export interface DirectoryFeedProduct {
  readonly name: string;
  readonly description?: string;
  /** Whole rupees; absent when the price is on request. */
  readonly priceInr?: number;
  readonly category?: string;
  readonly availability: "in_stock" | "out_of_stock" | "made_to_order";
  /** The product's photo, as an id to ask GET /api/directory/product-pictures/<id> for; absent when it has none (added 2026-10-12). */
  readonly photo?: string;
}

/** One question and its answer from the FAQ tab of an owner-added business's profile (added 2026-10-10). */
export interface DirectoryFeedFaq {
  readonly question: string;
  readonly answer: string;
}

/**
 * What the owner of an added business filled in on the Business profile tabs, for its page (added 2026-10-07). Every
 * field is absent or empty when the owner left it blank; the whole block is absent from an older platform.
 */
export interface DirectoryFeedAddedProfile {
  readonly about?: string;
  /** The owner's public email, as typed on the Business profile; absent when none was given (added 2026-10-11). */
  readonly email?: string;
  /** The owner's GST number (15 characters), shown on the page's Overview; absent when none was given (added 2026-10-12). */
  readonly gstNumber?: string;
  /** Opening hours in the same shape as a listing's; empty when none were given. */
  readonly hours: readonly DirectoryFeedHours[];
  readonly open24x7?: boolean;
  readonly holidayHours?: string;
  /** Holidays that have not ended yet, soonest first; absent when there are none or from an older platform. */
  readonly closures?: readonly DirectoryFeedHoliday[];
  readonly timeZone?: string;
  readonly services: readonly DirectoryFeedService[];
  readonly products: readonly DirectoryFeedProduct[];
  /** The owner's answers to the questions customers ask, in the order they put them; absent from a platform older than 2026-10-10. */
  readonly faqs?: readonly DirectoryFeedFaq[];
  /** A YouTube video id (11 characters). */
  readonly youtubeVideoId?: string;
  /** The owner's own pages, https addresses on instagram.com, facebook.com and linkedin.com only; each left out when not given or not such an address (added 2026-10-10). */
  readonly socials?: { readonly instagram?: string; readonly facebook?: string; readonly linkedin?: string };
  readonly establishedYear?: number;
  readonly serviceArea?: string;
  /** Payment method codes: cash, upi, card, net_banking, cheque, emi. */
  readonly paymentMethods: readonly string[];
  /** Licences and certifications, as the owner wrote them. */
  readonly licences: readonly string[];
  /**
   * The optional tabs the owner turned on for the page (page-tabs.ts: offers, services, products, trust, faq); the page has
   * Overview, Location, Reviews and Gallery besides. Absent from a platform older than 2026-10-09, which the website
   * reads as "show every tab that has something in it".
   */
  readonly pageTabs?: readonly string[];
  /**
   * The owner's own words for the Services and Products tabs (a restaurant's "Menu"), when they chose any: each is at most
   * 24 characters (page-tabs.ts). Absent when they kept the usual words, and from a platform older than 2026-10-13.
   */
  readonly pageTabLabels?: { readonly services?: string; readonly products?: string };
  /** The ids of the owner's approved gallery photos, in slot order; absent when there are none. */
  readonly gallery?: readonly string[];
}

/**
 * A business its owner added free (it was not in the directory's open data) and Fynix then confirmed on a call.
 * Its map position is the pin from its owner's Google Maps link when there is one (`pin`); without one the directory
 * places it at its area. Its number is the one the call confirmed.
 */
export interface DirectoryFeedAddedListing extends DirectoryFeedPlace {
  readonly address: DirectoryFeedAddress;
  readonly name: string;
  /** As the owner typed it; may be empty. */
  readonly streetAddress: string;
  /** E.164, the number Fynix called. */
  readonly phone: string;
  /** ISO 8601: when Fynix confirmed the business on the call. */
  readonly confirmedAt: string;
  /** The owner's approved square photo, as a picture id (GET /api/directory/pictures/<id>), or null. */
  readonly photo: string | null;
  /** The business's own website as its owner gave it, an http(s) URL. Absent when none is given. */
  readonly website?: string;
  /**
   * Whether Fynix verified it (a staff call, or the owner's code check). False for a business its owner only
   * published: the directory calls it Claimed, not Verified. Absent from an older platform, which the directory reads
   * as verified.
   */
  readonly verified?: boolean;
  /**
   * Present only for a business outside the districts the directory has opened: it has a page of its own and nothing
   * else, and `address.city`/`address.area` are then `<state>-<district>` and the locality's slug, not directory places.
   */
  readonly postal?: DirectoryFeedPostal;
  /**
   * Where the business is, from the Google Maps link its owner gave (added 2026-10-06). Absent when they gave none
   * with a pin, and from an older platform: the directory then places the business at its area.
   */
  readonly pin?: { readonly lat: number; readonly lon: number };
  /**
   * Slugs of the extra categories the business also lists in (never its main one; at most three; added 2026-10-07).
   * The directory shows it on those categories' list pages in its area as well. Absent when it has none.
   */
  readonly alsoCategories?: readonly string[];
  /** The owner's Business profile (about, hours, services, products, trust). Absent from an older platform. */
  readonly profile?: DirectoryFeedAddedProfile;
}

/**
 * What the owner of a business the directory already had (a claim, not an added business) filled in on the Business
 * profile, to lay over that business's open-data row, found by its permanent id (added 2026-10-12). Only what the owner
 * adds: the name, address and phone stay the directory's, which staff checked when they approved the claim.
 */
export interface DirectoryFeedClaimedProfile {
  /** The business's permanent place id. */
  readonly id: string;
  readonly profile: DirectoryFeedAddedProfile;
}

export interface DirectoryFeed {
  readonly version: typeof DIRECTORY_FEED_VERSION;
  readonly generatedAt: string;
  readonly listings: readonly DirectoryFeedListing[];
  /** Owner-added businesses Fynix has confirmed (added 2026-09-30). Absent from an older platform. */
  readonly added?: readonly DirectoryFeedAddedListing[];
  /** Owner profiles of approved claims on businesses the directory already had (added 2026-10-12). Absent from an older platform. */
  readonly claimed?: readonly DirectoryFeedClaimedProfile[];
}
