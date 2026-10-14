import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, directoryBusinessProfiles, directoryClaims, type BusinessContactOption, type BusinessPageTab, type BusinessPaymentMethod } from "../schema";
import type { ScopedTransaction } from "../scope";
import { changeAddedBusiness, marketOfListing } from "./directory-ads";
import { findPlaces, holdPlaceRegistryShared, PRE_PLACES_STATE_CODE } from "./directory-places";

/*
 * The Business profile's own row (docs/superpowers/specs/2026-10-01-business-profile-design.md): what a free listing
 * account's owner types on the Details tab, and the featured video from the Photos tab. Reads work through row-level
 * security (the customer reads its own row) and on staff; every write is on the staff connection, after the platform
 * has checked the customer.
 */

type Runner = Database | ScopedTransaction;

/** A map pin, in degrees. */
export interface MapPin {
  readonly latitude: number;
  readonly longitude: number;
}

export interface DirectoryProfile {
  readonly businessId: string;
  readonly streetAddress: string;
  /** E.164. */
  readonly phone: string;
  /** E.164, or null when the business has no WhatsApp. */
  readonly whatsapp: string | null;
  readonly mapsUrl: string | null;
  readonly pin: MapPin | null;
  readonly websiteUrl: string | null;
  readonly about: string | null;
  readonly youtubeVideoId: string | null;
  readonly establishedYear: number | null;
  readonly serviceArea: string | null;
  readonly email: string | null;
  readonly gstNumber: string | null;
  readonly directionsNote: string | null;
  readonly instagramUrl: string | null;
  readonly facebookUrl: string | null;
  readonly linkedinUrl: string | null;
  readonly holidayHours: string | null;
  readonly open24x7: boolean;
  readonly contactOptions: readonly BusinessContactOption[];
  /** The optional tabs on its public page the owner has turned on. */
  readonly pageTabs: readonly BusinessPageTab[];
  /** The owner's own words for the Services and Products tabs; null where they kept the usual one. */
  readonly servicesLabel: string | null;
  readonly productsLabel: string | null;
  readonly paymentMethods: readonly BusinessPaymentMethod[];
  readonly licences: readonly string[];
  readonly updatedAt: Date;
}

export async function findDirectoryProfile(db: Runner, businessId: string): Promise<DirectoryProfile | null> {
  const rows = await db.select().from(directoryBusinessProfiles).where(eq(directoryBusinessProfiles.businessId, businessId)).limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    businessId: row.businessId,
    // A claimed business's profile has none: its address is the directory's.
    streetAddress: row.streetAddress ?? "",
    phone: row.phone,
    whatsapp: row.whatsapp,
    mapsUrl: row.mapsUrl,
    pin: row.latitude === null || row.longitude === null ? null : { latitude: row.latitude, longitude: row.longitude },
    websiteUrl: row.websiteUrl,
    about: row.about,
    youtubeVideoId: row.youtubeVideoId,
    establishedYear: row.establishedYear,
    serviceArea: row.serviceArea,
    email: row.email,
    gstNumber: row.gstNumber,
    directionsNote: row.directionsNote,
    instagramUrl: row.instagramUrl,
    facebookUrl: row.facebookUrl,
    linkedinUrl: row.linkedinUrl,
    holidayHours: row.holidayHours,
    open24x7: row.open24x7,
    // The columns' CHECKs allow only the listed values (0084), so the narrowing is safe.
    contactOptions: row.contactOptions as BusinessContactOption[],
    pageTabs: row.pageTabs as BusinessPageTab[],
    servicesLabel: row.servicesLabel,
    productsLabel: row.productsLabel,
    paymentMethods: row.paymentMethods as BusinessPaymentMethod[],
    licences: row.licences,
    updatedAt: row.updatedAt,
  };
}

/** What the Details tab saves, already checked and normalised by the platform. */
export interface BusinessDetails {
  readonly businessName: string;
  /** The name as the last part of a web address: the claim's listing key is made from it while it is not live yet. */
  readonly slug: string;
  readonly streetAddress: string;
  /** E.164. */
  readonly phone: string;
  /** E.164, or null. */
  readonly whatsapp: string | null;
  readonly mapsUrl: string | null;
  readonly pin: MapPin | null;
  /** An http(s) address, or null. */
  readonly websiteUrl: string | null;
  readonly about: string | null;
  readonly establishedYear: number | null;
  readonly serviceArea: string | null;
  readonly email: string | null;
  /** A valid GSTIN, upper case, or null. */
  readonly gstNumber: string | null;
  readonly directionsNote: string | null;
  readonly instagramUrl: string | null;
  readonly facebookUrl: string | null;
  readonly linkedinUrl: string | null;
  readonly holidayHours: string | null;
  readonly open24x7: boolean;
}

/**
 * `not-listing-account`: the business is a website client's with no claim (a Premium member that brought its claim keeps its Business profile). `taken-down`: staff turned the business down or took its
 * page off, so nothing about it changes from here. `locked`: its page went live some other way (a client took the
 * business over), so its name is no longer the owner's to change.
 */
export type SaveBusinessDetailsOutcome =
  | { readonly kind: "saved" }
  | { readonly kind: "refused"; readonly reason: "not-listing-account" | "taken-down" | "locked" };

/**
 * Saves the Details tab for a free listing account's business. The profile row is written (made on the first save);
 * the business takes the name. When the business has a claim, the claim's copies change in the same transaction,
 * because the directory reads the claim:
 *
 * - an added business not published yet changes as its add form would (changeAddedBusiness): name, address and number,
 *   and so maybe its web address, which nobody has seen yet;
 * - a published added business changes its name, address and number; its web address stays locked as it went live;
 * - a claim to a listing the directory already had keeps the directory's name, and its number stays the one staff
 *   call;
 * - every claim takes the website.
 *
 * The business and claim rows are locked, so two saves, or a save and a publish, cannot interleave.
 */
export async function saveBusinessDetails(
  db: Database,
  input: { readonly businessId: string; readonly details: BusinessDetails; readonly now: Date },
): Promise<SaveBusinessDetailsOutcome> {
  const { businessId, details, now } = input;
  return db.transaction(async (tx) => {
    // A change to a business not live yet may move its place's URL label: before any row (holdPlaceRegistryShared).
    await holdPlaceRegistryShared(tx);
    const owner = await tx.select({ kind: businesses.kind }).from(businesses).where(eq(businesses.id, businessId)).limit(1).for("update");
    const kind = owner[0]?.kind;
    if (kind === undefined) return { kind: "refused", reason: "not-listing-account" };

    const claims = await tx
      .select({
        id: directoryClaims.id,
        origin: directoryClaims.origin,
        status: directoryClaims.status,
        phone: directoryClaims.phone,
        listingKey: directoryClaims.listingKey,
        placeId: directoryClaims.placeId,
        pincode: directoryClaims.pincode,
        localityName: directoryClaims.localityName,
      })
      .from(directoryClaims)
      .where(eq(directoryClaims.businessId, businessId))
      .limit(1)
      .for("update");
    const claim = claims[0];
    // A free listing account, or a Premium member that brought its claim from its free listing (opensClaimPages in the
    // platform): both keep the Business profile. A website client with no claim has none to save.
    if (kind !== "listing" && claim === undefined) return { kind: "refused", reason: "not-listing-account" };
    if (claim?.status === "rejected") return { kind: "refused", reason: "taken-down" };

    // A claim on a business the directory already had keeps the directory's name, address and number (staff checked them at
    // the claim); only the rest of the profile is the owner's. Nothing typed for those three is taken.
    const claimed = claim !== undefined && claim.origin === "claimed";
    const claimedPhone = claim?.phone ?? null;

    if (claim !== undefined && claim.origin === "added" && claim.status === "pending") {
      // The Details tab does not move the business: it keeps its place's state, and its PIN and locality if it has them.
      const place = claim.placeId === null ? undefined : (await findPlaces(tx, [claim.placeId])).get(claim.placeId);
      const changed = await changeAddedBusiness(
        tx,
        {
          ...marketOfListing(claim.listingKey),
          businessId,
          stateCode: place?.stateCode ?? PRE_PLACES_STATE_CODE,
          postal: claim.pincode !== null && claim.localityName !== null ? { pincode: claim.pincode, localityName: claim.localityName } : null,
          slug: details.slug,
          businessName: details.businessName,
          streetAddress: details.streetAddress,
          phone: details.phone,
        },
        now,
      );
      if (changed.kind === "refused") return { kind: "refused", reason: "locked" };
    } else if (claim !== undefined && claim.origin === "added") {
      await tx
        .update(directoryClaims)
        .set({ businessName: details.businessName, streetAddress: details.streetAddress, phone: details.phone })
        .where(eq(directoryClaims.id, claim.id));
    }
    if (claim !== undefined) {
      await tx.update(directoryClaims).set({ websiteUrl: details.websiteUrl }).where(eq(directoryClaims.id, claim.id));
    }
    if (!claimed) await tx.update(businesses).set({ name: details.businessName }).where(eq(businesses.id, businessId));

    const profile = {
      streetAddress: claimed || details.streetAddress === "" ? null : details.streetAddress,
      phone: claimed && claimedPhone !== null ? claimedPhone : details.phone,
      whatsapp: details.whatsapp,
      mapsUrl: details.mapsUrl,
      latitude: details.pin?.latitude ?? null,
      longitude: details.pin?.longitude ?? null,
      websiteUrl: details.websiteUrl,
      about: details.about,
      establishedYear: details.establishedYear,
      serviceArea: details.serviceArea,
      email: details.email,
      gstNumber: details.gstNumber,
      directionsNote: details.directionsNote,
      instagramUrl: details.instagramUrl,
      facebookUrl: details.facebookUrl,
      linkedinUrl: details.linkedinUrl,
      holidayHours: details.holidayHours,
      open24x7: details.open24x7,
      updatedAt: now,
    };
    await tx
      .insert(directoryBusinessProfiles)
      .values({ businessId, ...profile, createdAt: now })
      .onConflictDoUpdate({ target: directoryBusinessProfiles.businessId, set: profile });
    return { kind: "saved" };
  });
}

/**
 * Sets (or, with null, removes) the business's featured video. False when the business has no profile yet: the video
 * goes on the profile its Details made. `videoId` must already be a YouTube video id (youtubeVideoId in the platform).
 */
export async function setFeaturedVideo(
  db: Database,
  input: { readonly businessId: string; readonly videoId: string | null; readonly now: Date },
): Promise<boolean> {
  const rows = await db
    .update(directoryBusinessProfiles)
    .set({ youtubeVideoId: input.videoId, updatedAt: input.now })
    .where(eq(directoryBusinessProfiles.businessId, input.businessId))
    .returning({ businessId: directoryBusinessProfiles.businessId });
  return rows.length > 0;
}

/** What the Contact options tab saves: the buttons a visitor sees. Already checked against BUSINESS_CONTACT_OPTIONS. */
export async function setContactOptions(
  db: Database,
  input: { readonly businessId: string; readonly options: readonly BusinessContactOption[]; readonly now: Date },
): Promise<boolean> {
  const rows = await db
    .update(directoryBusinessProfiles)
    .set({ contactOptions: [...input.options], updatedAt: input.now })
    .where(eq(directoryBusinessProfiles.businessId, input.businessId))
    .returning({ businessId: directoryBusinessProfiles.businessId });
  return rows.length > 0;
}

/**
 * What the Page tabs tab saves: which optional tabs the business's page shows, and the owner's own words for Services and
 * Products (null keeps the usual one; already checked by the platform). False when there is no profile row yet.
 */
export async function setPageTabs(
  db: Database,
  input: {
    readonly businessId: string;
    readonly tabs: readonly BusinessPageTab[];
    readonly servicesLabel: string | null;
    readonly productsLabel: string | null;
    readonly now: Date;
  },
): Promise<boolean> {
  const rows = await db
    .update(directoryBusinessProfiles)
    .set({ pageTabs: [...input.tabs], servicesLabel: input.servicesLabel, productsLabel: input.productsLabel, updatedAt: input.now })
    .where(eq(directoryBusinessProfiles.businessId, input.businessId))
    .returning({ businessId: directoryBusinessProfiles.businessId });
  return rows.length > 0;
}

/**
 * Turns one optional tab on for the page, once: the tab is added to the owner's choice unless it is already there, in one
 * statement, so two saves together cannot add it twice. True when it was added; false when it was already on or there is
 * no profile row yet.
 */
export async function turnOnPageTab(db: Database, input: { readonly businessId: string; readonly tab: BusinessPageTab; readonly now: Date }): Promise<boolean> {
  const rows = await db
    .update(directoryBusinessProfiles)
    .set({ pageTabs: sql`array_append(${directoryBusinessProfiles.pageTabs}, ${input.tab})`, updatedAt: input.now })
    .where(and(eq(directoryBusinessProfiles.businessId, input.businessId), sql`not (${input.tab} = any(${directoryBusinessProfiles.pageTabs}))`))
    .returning({ businessId: directoryBusinessProfiles.businessId });
  return rows.length > 0;
}

/** What the Trust tab saves: how the business takes payment and its licences, already checked and trimmed. */
export async function setTrustInformation(
  db: Database,
  input: {
    readonly businessId: string;
    readonly paymentMethods: readonly BusinessPaymentMethod[];
    readonly licences: readonly string[];
    readonly now: Date;
  },
): Promise<boolean> {
  const rows = await db
    .update(directoryBusinessProfiles)
    .set({ paymentMethods: [...input.paymentMethods], licences: [...input.licences], updatedAt: input.now })
    .where(eq(directoryBusinessProfiles.businessId, input.businessId))
    .returning({ businessId: directoryBusinessProfiles.businessId });
  return rows.length > 0;
}
