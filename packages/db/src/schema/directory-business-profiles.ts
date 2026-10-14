import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/*
 * What a free listing account's owner types on the Details tab of their Business profile
 * (docs/superpowers/specs/2026-10-01-business-profile-design.md): one row per business, written before the business
 * has a listing and kept as the one home of these details afterwards. Once there is a claim, its name, address, phone
 * and website are copied onto it in the same transaction (saveBusinessDetails), because the directory reads the claim.
 *
 * The customer reads its own row through row-level security and writes nothing directly: every write runs on the
 * staff connection after the platform has checked who is asking (see 0081).
 */

/** The longest "About the business" text the Details tab takes, in characters: a ceiling above its 250-word limit. */
export const BUSINESS_ABOUT_MAX_LENGTH = 4000;
/** The longest Google Maps link kept. */
export const BUSINESS_MAPS_URL_MAX_LENGTH = 500;

/**
 * The buttons a visitor can use to reach the business (the sheet's "Customer Conversion"); the owner turns each on or
 * off. The platform's lib/business-profile-fields.ts holds the same list for the form.
 */
export const BUSINESS_CONTACT_OPTIONS = ["call", "whatsapp", "enquiry", "appointment", "booking", "quote", "directions", "website"] as const;
export type BusinessContactOption = (typeof BUSINESS_CONTACT_OPTIONS)[number];
/** What a new profile offers until its owner changes it: the buttons that need nothing set up. */
export const DEFAULT_CONTACT_OPTIONS: readonly BusinessContactOption[] = ["call", "whatsapp", "directions", "website"];

/**
 * The tabs on the business's public page that its owner turns on (the fixed ones, Overview, Location, Reviews and
 * Gallery, are not stored). The shared lib's OPTIONAL_PAGE_TABS holds the same list for the dashboard and the feed.
 */
export const BUSINESS_PAGE_TABS = ["offers", "services", "products", "trust", "faq", "appointment"] as const;
export type BusinessPageTab = (typeof BUSINESS_PAGE_TABS)[number];

/** The longest name an owner can give their Services or Products tab (the shared lib's PAGE_TAB_LABEL_MAX_LENGTH). */
export const BUSINESS_PAGE_TAB_LABEL_MAX_LENGTH = 24;

/** How the business takes payment (the sheet's "Trust & Business Information"). */
export const BUSINESS_PAYMENT_METHODS = ["cash", "upi", "card", "net_banking", "cheque", "emi"] as const;
export type BusinessPaymentMethod = (typeof BUSINESS_PAYMENT_METHODS)[number];

/** At most this many licences or certifications. */
export const BUSINESS_LICENCES_MAX = 10;
/** The longest single licence or certification line. */
export const BUSINESS_LICENCE_MAX_LENGTH = 100;

export const directoryBusinessProfiles = pgTable(
  "directory_business_profiles",
  {
    businessId: uuid("business_id")
      .primaryKey()
      .references(() => businesses.id),
    /** Where the business is, as one line. */
    streetAddress: text("street_address"),
    /** The business's phone, E.164. */
    phone: text("phone").notNull(),
    /** The WhatsApp number visitors message, E.164; null when the business has none. */
    whatsapp: text("whatsapp"),
    /** The Google Maps link visitors open for directions. */
    mapsUrl: text("maps_url"),
    /** The map pin, when the link carried one. Both or neither. */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /** The business's own website, an http(s) address. */
    websiteUrl: text("website_url"),
    /** A short description in the owner's words. */
    about: text("about"),
    /** The featured video: a YouTube video id. Nothing is stored or served by us. */
    youtubeVideoId: text("youtube_video_id"),
    /** The year the business started. */
    establishedYear: smallint("established_year"),
    /** Where the business serves, in words: "Thane, Mumbra, Kalwa", "Home visits within 10 km". */
    serviceArea: text("service_area"),
    /** The business's public email. */
    email: text("email"),
    /** The business's GST number (a 15-character GSTIN, checked by the platform), kept private: nothing public shows it. */
    gstNumber: text("gst_number"),
    /** How to find the place once on the road: a landmark, a floor, the lane. */
    directionsNote: text("directions_note"),
    instagramUrl: text("instagram_url"),
    facebookUrl: text("facebook_url"),
    linkedinUrl: text("linkedin_url"),
    /** Holiday opening in the owner's words: "Closed on Diwali; half day on Holi". */
    holidayHours: text("holiday_hours"),
    /** Whether the business is open round the clock for emergencies. */
    open24x7: boolean("open_24x7").notNull().default(false),
    /** The buttons the business offers visitors (BUSINESS_CONTACT_OPTIONS). */
    contactOptions: text("contact_options").array().notNull().default(sql`ARRAY['call','whatsapp','directions','website']::text[]`),
    /** The optional tabs shown on its page (BUSINESS_PAGE_TABS); none until the owner turns one on. */
    pageTabs: text("page_tabs").array().notNull().default(sql`ARRAY[]::text[]`),
    /** The owner's own word for the Services tab ("Menu", "Treatments"); null shows "Services". */
    servicesLabel: text("services_label"),
    /** The owner's own word for the Products tab ("Medicines", "Shop"); null shows "Products". */
    productsLabel: text("products_label"),
    /** How it takes payment (BUSINESS_PAYMENT_METHODS). */
    paymentMethods: text("payment_methods").array().notNull().default(sql`ARRAY[]::text[]`),
    /** Licences and certifications, one per line, as the owner writes them. */
    licences: text("licences").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "directory_business_profiles_street_address_check",
      sql`char_length(${table.streetAddress}) between 1 and 200 and ${table.streetAddress} = btrim(${table.streetAddress}) and ${table.streetAddress} !~ '[\\r\\n]'`,
    ),
    check("directory_business_profiles_phone_check", sql`${table.phone} ~ '^\\+[0-9]{8,15}$'`),
    check("directory_business_profiles_whatsapp_check", sql`${table.whatsapp} is null or ${table.whatsapp} ~ '^\\+[0-9]{8,15}$'`),
    check(
      "directory_business_profiles_maps_url_check",
      sql`${table.mapsUrl} is null or (char_length(${table.mapsUrl}) <= ${sql.raw(String(BUSINESS_MAPS_URL_MAX_LENGTH))} and ${table.mapsUrl} ~ '^https://[^[:space:]]+$')`,
    ),
    check(
      "directory_business_profiles_pin_check",
      sql`(${table.latitude} is null) = (${table.longitude} is null) and (${table.latitude} is null or (${table.latitude} between -90 and 90 and ${table.longitude} between -180 and 180))`,
    ),
    check(
      "directory_business_profiles_website_url_check",
      sql`${table.websiteUrl} is null or (char_length(${table.websiteUrl}) <= 300 and ${table.websiteUrl} ~ '^https?://[^[:space:]]+$')`,
    ),
    check(
      "directory_business_profiles_about_check",
      sql`${table.about} is null or (char_length(${table.about}) between 1 and ${sql.raw(String(BUSINESS_ABOUT_MAX_LENGTH))} and ${table.about} = btrim(${table.about}))`,
    ),
    check(
      "directory_business_profiles_youtube_video_id_check",
      sql`${table.youtubeVideoId} is null or ${table.youtubeVideoId} ~ '^[A-Za-z0-9_-]{11}$'`,
    ),
    check(
      "directory_business_profiles_established_year_check",
      sql`${table.establishedYear} is null or ${table.establishedYear} between 1800 and 2100`,
    ),
    check(
      "directory_business_profiles_service_area_check",
      sql`${table.serviceArea} is null or (char_length(${table.serviceArea}) between 1 and 200 and ${table.serviceArea} = btrim(${table.serviceArea}) and ${table.serviceArea} !~ '[\\r\\n]')`,
    ),
    check(
      "directory_business_profiles_email_check",
      sql`${table.email} is null or (char_length(${table.email}) <= 120 and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')`,
    ),
    check(
      "directory_business_profiles_gst_number_check",
      sql`${table.gstNumber} is null or ${table.gstNumber} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`,
    ),
    check(
      "directory_business_profiles_directions_note_check",
      sql`${table.directionsNote} is null or (char_length(${table.directionsNote}) between 1 and 200 and ${table.directionsNote} = btrim(${table.directionsNote}) and ${table.directionsNote} !~ '[\\r\\n]')`,
    ),
    check(
      "directory_business_profiles_social_check",
      sql`(${table.instagramUrl} is null or (char_length(${table.instagramUrl}) <= 300 and ${table.instagramUrl} ~ '^https://[^[:space:]]+$')) and (${table.facebookUrl} is null or (char_length(${table.facebookUrl}) <= 300 and ${table.facebookUrl} ~ '^https://[^[:space:]]+$')) and (${table.linkedinUrl} is null or (char_length(${table.linkedinUrl}) <= 300 and ${table.linkedinUrl} ~ '^https://[^[:space:]]+$'))`,
    ),
    check(
      "directory_business_profiles_holiday_hours_check",
      sql`${table.holidayHours} is null or (char_length(${table.holidayHours}) between 1 and 200 and ${table.holidayHours} = btrim(${table.holidayHours}) and ${table.holidayHours} !~ '[\\r\\n]')`,
    ),
    check(
      "directory_business_profiles_contact_options_check",
      sql`${table.contactOptions} <@ ARRAY['call','whatsapp','enquiry','appointment','booking','quote','directions','website']::text[]`,
    ),
    check("directory_business_profiles_page_tabs_check", sql`${table.pageTabs} <@ ARRAY['offers','services','products','trust','faq','appointment']::text[]`),
    check(
      "directory_business_profiles_services_label_check",
      sql`${table.servicesLabel} is null or (char_length(${table.servicesLabel}) between 1 and ${sql.raw(String(BUSINESS_PAGE_TAB_LABEL_MAX_LENGTH))} and ${table.servicesLabel} = btrim(${table.servicesLabel}) and ${table.servicesLabel} !~ '[[:cntrl:]]')`,
    ),
    check(
      "directory_business_profiles_products_label_check",
      sql`${table.productsLabel} is null or (char_length(${table.productsLabel}) between 1 and ${sql.raw(String(BUSINESS_PAGE_TAB_LABEL_MAX_LENGTH))} and ${table.productsLabel} = btrim(${table.productsLabel}) and ${table.productsLabel} !~ '[[:cntrl:]]')`,
    ),
    check(
      "directory_business_profiles_payment_methods_check",
      sql`${table.paymentMethods} <@ ARRAY['cash','upi','card','net_banking','cheque','emi']::text[]`,
    ),
    check(
      "directory_business_profiles_licences_check",
      sql`cardinality(${table.licences}) <= ${sql.raw(String(BUSINESS_LICENCES_MAX))} and char_length(array_to_string(${table.licences}, E'\\n')) <= ${sql.raw(String(BUSINESS_LICENCES_MAX * BUSINESS_LICENCE_MAX_LENGTH + BUSINESS_LICENCES_MAX))}`,
    ),
  ],
);
