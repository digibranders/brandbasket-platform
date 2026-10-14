import "server-only";

import { getMediaStorage } from "@fynix/shared/server/media-storage";
import { deleteProductPhotoFiles, removeProductPhoto } from "./product-photos";
import {
  addBusinessFaq,
  addBusinessListing,
  addBusinessProduct,
  addBusinessService,
  deleteBusinessFaq,
  deleteBusinessProduct,
  deleteBusinessService,
  findClaimForBusiness,
  findDirectoryProfile,
  findPincode,
  getBusinessHours,
  listBusinessFaqs,
  listBusinessProducts,
  listExtraCategories,
  listBusinessServices,
  listDirectoryPictures,
  marketOfListing,
  publishAddedBusiness,
  replaceExtraCategories,
  replaceOpeningHours,
  saveBusinessDetails,
  setClaimWebsite,
  setContactOptions,
  setPageTabs,
  turnOnPageTab,
  setFeaturedVideo,
  setTrustInformation,
  updateAddedBusinessListing,
  updateBusinessFaq,
  updateBusinessProduct,
  updateBusinessService,
  withTenantScope,
  type BusinessFaq,
  type BusinessProduct,
  type BusinessService,
  type CatalogWriteOutcome,
  type DirectoryClaim,
  type DirectoryPictureSlot,
  type DirectoryProfile,
  type NewBusinessListing,
  type PublishRefusal,
} from "@fynix/db";
import { elsewhereCitySlug, isOpenedDistrict } from "@fynix/shared/lib/directory/opened-districts";
import { DIRECTORY_STATE, slugifyBusinessName } from "@fynix/shared/lib/directory/places";
import { fromStoredHours, toStoredHours, type OpeningHours } from "@fynix/shared/lib/onboarding/hours";
import type { BusinessDetailsInput } from "@/lib/business-details-form";
import type { BusinessListingInput, ListingRefusalReason } from "@/lib/business-listing-form";
import type { FaqInput, ProductInput, ServiceInput } from "@/lib/catalog-form";
import type { PageTabsInput, TrustInput } from "@/lib/contact-trust-form";
import { chosenPageTabLabels, type OptionalPageTab } from "@fynix/shared/lib/directory/page-tabs";
import type { ContactOption } from "@/lib/business-profile-fields";
import type { ProfileState } from "@/lib/business-profile";
import { normalisePincode, publicPinLookup, type PinLookup } from "@/lib/listing-location";
import { shownPicture, slotPictures, type SlotPictures } from "@/lib/photos-view";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";

/*
 * The Business profile for a free listing account (docs/superpowers/specs/2026-10-01-business-profile-design.md).
 * Reads go through the customer's own tenant scope. Writes run on the staff connection, because the customer role
 * writes nothing to the directory's tables: the business id comes only from the session, and every value has been
 * parsed by the tab's form parser first. Opening hours are the business's own rows, written through its tenant scope
 * as the paying clients' "Your details" page writes them.
 */

type Customer = Pick<GrantedCustomer, "tenant">;

export interface BusinessProfilePage {
  /** The business's name: the one its Details saved, or the one it signed up with. */
  readonly businessName: string;
  readonly claim: DirectoryClaim | null;
  readonly profile: DirectoryProfile | null;
  readonly hours: readonly OpeningHours[];
  readonly slots: Readonly<Record<DirectoryPictureSlot, SlotPictures>>;
  readonly services: readonly BusinessService[];
  readonly products: readonly BusinessProduct[];
  readonly faqs: readonly BusinessFaq[];
  readonly state: ProfileState;
}

function stateOf(
  claim: DirectoryClaim | null,
  profile: DirectoryProfile | null,
  slots: BusinessProfilePage["slots"],
  counts: { readonly services: number; readonly products: number; readonly faqs: number },
): ProfileState {
  return {
    hasDetails: profile !== null,
    hasPhoto: shownPicture(slots.listing) !== null,
    hasVideo: profile?.youtubeVideoId != null,
    serviceCount: counts.services,
    productCount: counts.products,
    faqCount: counts.faqs,
    hasTrust: profile !== null && (profile.paymentMethods.length > 0 || profile.licences.length > 0),
    pageTabLabels: chosenPageTabLabels({ services: profile?.servicesLabel, products: profile?.productsLabel }) ?? {},
    listing: claim === null ? "none" : claim.origin,
    status: claim?.status ?? null,
  };
}

/** Everything the Business profile shows the signed-in listing account, read in one tenant-scoped transaction. */
export async function getBusinessProfilePage(customer: Customer): Promise<BusinessProfilePage> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const claim = await findClaimForBusiness(tx, tenant.businessId);
    const profile = await findDirectoryProfile(tx, tenant.businessId);
    const hoursRows = await getBusinessHours(tx);
    const slots = slotPictures(await listDirectoryPictures(tx, tenant.businessId));
    const services = await listBusinessServices(tx, tenant.businessId);
    const products = await listBusinessProducts(tx, tenant.businessId);
    const faqs = await listBusinessFaqs(tx, tenant.businessId);
    return {
      businessName: tenant.businessName,
      claim,
      profile,
      hours: hoursRows.map(fromStoredHours).filter((day): day is OpeningHours => day !== null),
      slots,
      services,
      products,
      faqs,
      state: stateOf(claim, profile, slots, { services: services.length, products: products.length, faqs: faqs.length }),
    };
  });
}

/**
 * The business's place id, its Business ID, for the account menu on every page; null before it has one (no listing
 * claimed or added yet). Read through the customer's own tenant scope, like the profile.
 */
export async function getOwnPlaceId(customer: Customer): Promise<string | null> {
  const { tenant } = customer;
  const claim = await withTenantScope(getAppDb(), tenant, (tx) => findClaimForBusiness(tx, tenant.businessId));
  return claim?.placeId ?? null;
}

export type SaveDetailsOutcome = { readonly kind: "saved" } | { readonly kind: "refused"; readonly message: string };

const TAKEN_DOWN_MESSAGE = "This business was taken off the local directory, so it can't be changed here. Email us and we'll sort it out.";
const NO_PROFILE_MESSAGE = "This account has no business profile to change. Email us and we'll sort it out.";
const LOCKED_MESSAGE = "This business's name can't be changed here any more. Email us and we'll sort it out.";

/**
 * Saves the Details tab: the profile (and the claim's copies) on the staff connection, then the opening hours through
 * the tenant scope. A business staff took down changes nothing.
 */
export async function saveOwnDetails(customer: Customer, input: BusinessDetailsInput): Promise<SaveDetailsOutcome> {
  const { tenant } = customer;
  const saved = await saveBusinessDetails(getStaffDb(), {
    businessId: tenant.businessId,
    details: {
      businessName: input.businessName,
      slug: input.slug,
      streetAddress: input.streetAddress,
      phone: input.phone,
      whatsapp: input.whatsapp,
      mapsUrl: input.mapsUrl,
      pin: input.pin,
      websiteUrl: input.websiteUrl,
      about: input.about,
      establishedYear: input.establishedYear,
      serviceArea: input.serviceArea,
      email: input.email,
      gstNumber: input.gstNumber,
      directionsNote: input.directionsNote,
      instagramUrl: input.instagramUrl,
      facebookUrl: input.facebookUrl,
      linkedinUrl: input.linkedinUrl,
      holidayHours: input.holidayHours,
      open24x7: input.open24x7,
    },
    now: new Date(),
  });
  if (saved.kind === "refused") {
    const messages = { locked: LOCKED_MESSAGE, "taken-down": TAKEN_DOWN_MESSAGE, "not-listing-account": NO_PROFILE_MESSAGE } as const;
    return { kind: "refused", message: messages[saved.reason] };
  }
  await withTenantScope(getAppDb(), tenant, (tx) => replaceOpeningHours(tx, input.hours.map(toStoredHours)));
  return { kind: "saved" };
}

export type SaveListingOutcome =
  | { readonly kind: "saved"; readonly added: boolean }
  | { readonly kind: "refused"; readonly reason: ListingRefusalReason; readonly message: string };

const NO_DETAILS_MESSAGE = "Fill in your Details first: your listing needs the business's name, address and phone.";
const LISTING_LOCKED_MESSAGE = "Your listing is live, so where it's listed can't be changed here. Ask us for the change.";
const PIN_UNKNOWN_MESSAGE = "We couldn't find that PIN code. Check it, or email us and we'll add your business.";
const PIN_MISMATCH_MESSAGE = "That area isn't in this PIN code. Pick it again.";

type ListingPlace = Pick<NewBusinessListing, "stateCode" | "citySlug" | "areaSlug" | "postal">;

type ResolvedListingPlace =
  | { readonly ok: true; readonly where: ListingPlace }
  | { readonly ok: false; readonly reason: "pin" | "place"; readonly message: string };

/**
 * The picks checked against India Post's directory: an area given with a PIN needs the PIN in its opened district, a
 * locality one of its own PIN's post offices. An area given without a PIN (no opened-district claim stores one) is
 * taken as it is: the parser has checked it is one of the directory's areas, all in Thane, Maharashtra, and the claim
 * writes check the rest. What it returns is exactly what the claim writes check again (assertListingLocation), so a
 * refusal there is a bug, not the owner's mistake, and is left to throw. The PIN directory is public reference data the
 * customer role may read (0085), so it is read on the customer's connection.
 *
 * With one opened district per state, a PIN in an opened district puts any of the directory's areas in that district.
 * Once a second district in the same state opens, the area's district must also be checked against the PIN's, here
 * and in assertListingLocation.
 */
async function resolveListingPlace(picks: BusinessListingInput): Promise<ResolvedListingPlace> {
  if (picks.place.kind === "area" && picks.pincode === null) {
    const { citySlug, areaSlug } = picks.place;
    return { ok: true, where: { stateCode: DIRECTORY_STATE.code, citySlug, areaSlug, postal: null } };
  }
  if (picks.pincode === null) return { ok: false, reason: "pin", message: PIN_UNKNOWN_MESSAGE };
  const record = await findPincode(getAppDb(), picks.pincode);
  if (record === null) return { ok: false, reason: "pin", message: PIN_UNKNOWN_MESSAGE };
  const opened = isOpenedDistrict(record.stateCode, record.districtSlug);
  if (picks.place.kind === "area") {
    if (!opened) return { ok: false, reason: "place", message: PIN_MISMATCH_MESSAGE };
    return { ok: true, where: { stateCode: record.stateCode, citySlug: picks.place.citySlug, areaSlug: picks.place.areaSlug, postal: null } };
  }
  if (opened) return { ok: false, reason: "place", message: PIN_MISMATCH_MESSAGE };
  const { localitySlug } = picks.place;
  const locality = record.localities.find((item) => item.slug === localitySlug);
  if (locality === undefined) return { ok: false, reason: "place", message: PIN_MISMATCH_MESSAGE };
  return {
    ok: true,
    where: {
      stateCode: record.stateCode,
      citySlug: elsewhereCitySlug(record.stateCode, record.districtSlug),
      areaSlug: locality.slug,
      postal: { pincode: record.pincode, localityName: locality.name },
    },
  };
}

/** The longest text taken as a typed PIN: six digits with room for spaces. Anything longer is not looked up. */
const PIN_INPUT_MAX_LENGTH = 12;

/**
 * The Listing tab's PIN step: which district the PIN is in and what to ask next. Its argument comes straight from the
 * browser, so anything but a short string is not a PIN. Read on the customer's connection, like resolveListingPlace.
 */
export async function lookupPincode(pincode: unknown): Promise<PinLookup> {
  if (typeof pincode !== "string" || pincode.length > PIN_INPUT_MAX_LENGTH) return { kind: "not-found" };
  const pin = normalisePincode(pincode);
  if (pin === null) return { kind: "not-found" };
  return publicPinLookup(await findPincode(getAppDb(), pin));
}

/**
 * Saves the Listing tab, once its PIN and pick check out against India Post's directory (resolveListingPlace). The
 * first save adds the business to the directory, which gives it its Business ID (a new place, from addBusinessListing)
 * and copies its name, address, phone and website from the profile. A later save moves it, live or not (its web address
 * does not move); a claimed listing is fixed here.
 */
export async function saveOwnListing(customer: Customer, picks: BusinessListingInput): Promise<SaveListingOutcome> {
  const { tenant } = customer;
  const staffDb = getStaffDb();
  const [claim, profile] = await withTenantScope(getAppDb(), tenant, async (tx) => [
    await findClaimForBusiness(tx, tenant.businessId),
    await findDirectoryProfile(tx, tenant.businessId),
  ]);
  if (profile === null) return { kind: "refused", reason: "no-details", message: NO_DETAILS_MESSAGE };
  // An added business keeps its district, area and category open after it is live; a claimed listing is the directory's
  // own record and changes through us.
  if (claim !== null && (claim.origin !== "added" || claim.status === "rejected")) {
    return { kind: "refused", reason: "locked", message: LISTING_LOCKED_MESSAGE };
  }
  const resolved = await resolveListingPlace(picks);
  if (!resolved.ok) return { kind: "refused", reason: resolved.reason, message: resolved.message };
  const now = new Date();

  if (claim === null) {
    const added = await addBusinessListing(
      staffDb,
      {
        businessId: tenant.businessId,
        ...resolved.where,
        categorySlug: picks.categorySlug,
        slug: slugifyBusinessName(tenant.businessName),
        businessName: tenant.businessName,
        streetAddress: profile.streetAddress,
        phone: profile.phone,
      },
      now,
    );
    if (added.kind === "refused") {
      return { kind: "refused", reason: "refused", message: "This account can't add a business. Email us and we'll sort it out." };
    }
    if (profile.websiteUrl !== null) await setClaimWebsite(staffDb, tenant.businessId, profile.websiteUrl);
    return { kind: "saved", added: true };
  }

  const updated = await updateAddedBusinessListing(
    staffDb,
    {
      businessId: tenant.businessId,
      ...resolved.where,
      categorySlug: picks.categorySlug,
      slug: slugifyBusinessName(claim.businessName),
      businessName: claim.businessName,
      streetAddress: profile.streetAddress,
      phone: profile.phone,
    },
    now,
  );
  return updated.kind === "updated"
    ? { kind: "saved", added: false }
    : { kind: "refused", reason: "locked", message: LISTING_LOCKED_MESSAGE };
}

export type SaveExtraCategoriesOutcome = { readonly kind: "saved" } | { readonly kind: "refused"; readonly message: string };

const NO_LISTING_MESSAGE = "Save your listing first, then add the other categories you list in.";
const MAIN_CATEGORY_MESSAGE = "That is already your main category. Pick other categories to also list in.";

/** The categories the business also lists in, read through the customer's own tenant scope. */
export async function getOwnExtraCategories(customer: Customer): Promise<readonly string[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => listExtraCategories(tx, tenant.businessId));
}

/**
 * Saves the categories the business also lists in. They can change at any time, live or not, because they do not move
 * its address (that stays its main category's). A business with no listing yet, or one staff rejected, has none to
 * add them to; the slugs are checked by the form parser, and none may be the main category.
 */
export async function saveOwnExtraCategories(customer: Customer, slugs: readonly string[]): Promise<SaveExtraCategoriesOutcome> {
  const { tenant } = customer;
  const claim = await withTenantScope(getAppDb(), tenant, (tx) => findClaimForBusiness(tx, tenant.businessId));
  if (claim === null || claim.status === "rejected") return { kind: "refused", message: NO_LISTING_MESSAGE };
  const main = marketOfListing(claim.listingKey).categorySlug;
  if (slugs.includes(main)) return { kind: "refused", message: MAIN_CATEGORY_MESSAGE };
  await replaceExtraCategories(getStaffDb(), { businessId: tenant.businessId, slugs });
  return { kind: "saved" };
}

/** Sets or removes the featured video; false when the business has not saved its Details yet. */
export async function setOwnVideo(customer: Customer, videoId: string | null): Promise<boolean> {
  return setFeaturedVideo(getStaffDb(), { businessId: customer.tenant.businessId, videoId, now: new Date() });
}

/** Why a publish was refused: one of the database's reasons, or the feature photo is still missing (a page needs one to go live). */
export type OwnPublishRefusal = PublishRefusal | "no-photo";

export type PublishOutcome = { readonly kind: "published" } | { readonly kind: "refused"; readonly reason: OwnPublishRefusal };

/** Publishes the signed-in owner's added business: its page goes live as Claimed, with no call from us. */
export async function publishOwnBusiness(customer: Customer): Promise<PublishOutcome> {
  const { tenant } = customer;
  const hasPhoto = await withTenantScope(getAppDb(), tenant, async (tx) => shownPicture(slotPictures(await listDirectoryPictures(tx, tenant.businessId)).listing) !== null);
  if (!hasPhoto) return { kind: "refused", reason: "no-photo" };
  const outcome = await publishAddedBusiness(getStaffDb(), { businessId: tenant.businessId, userId: tenant.userId, now: new Date() });
  return outcome.kind === "published" ? { kind: "published" } : outcome;
}

export type CatalogOutcome =
  /** `tabOn` is set when this save was the owner's first of its kind and so switched that tab on, on their page. */
  | { readonly kind: "saved"; readonly tabOn?: OptionalPageTab }
  | { readonly kind: "refused"; readonly message: string };

const FULL_MESSAGE = "You've reached the limit of items you can list. Remove one to add another.";
const NOT_FOUND_MESSAGE = "That item was already removed. Reload the page.";

/** Whether staff took this business down: nothing about it changes from here then (taken-down businesses read, never write). */
async function isTakenDownBusiness(customer: Customer): Promise<boolean> {
  const { tenant } = customer;
  const claim = await withTenantScope(getAppDb(), tenant, (tx) => findClaimForBusiness(tx, tenant.businessId));
  return claim?.status === "rejected";
}

function catalogOutcome(written: CatalogWriteOutcome): CatalogOutcome {
  if (written.kind === "saved") return { kind: "saved" };
  return { kind: "refused", message: written.kind === "full" ? FULL_MESSAGE : NOT_FOUND_MESSAGE };
}

/** Adds a service, or changes the one `id` names. */
export async function saveOwnService(customer: Customer, id: string | null, service: ServiceInput): Promise<CatalogOutcome> {
  if (await isTakenDownBusiness(customer)) return { kind: "refused", message: TAKEN_DOWN_MESSAGE };
  const businessId = customer.tenant.businessId;
  const outcome = catalogOutcome(
    id === null ? await addBusinessService(getStaffDb(), { businessId, service }) : await updateBusinessService(getStaffDb(), { businessId, id, service }),
  );
  // The first service an owner adds puts the Services tab on their page; after that the tab is theirs to turn off.
  if (outcome.kind !== "saved" || id !== null || (await listBusinessServices(getStaffDb(), businessId)).length !== 1) return outcome;
  return (await turnOnPageTab(getStaffDb(), { businessId, tab: "services", now: new Date() })) ? { kind: "saved", tabOn: "services" } : outcome;
}

export async function removeOwnService(customer: Customer, id: string): Promise<void> {
  if (await isTakenDownBusiness(customer)) return;
  await deleteBusinessService(getStaffDb(), { businessId: customer.tenant.businessId, id });
}

/** Adds a product, or changes the one `id` names. */
export async function saveOwnProduct(customer: Customer, id: string | null, product: ProductInput): Promise<CatalogOutcome> {
  if (await isTakenDownBusiness(customer)) return { kind: "refused", message: TAKEN_DOWN_MESSAGE };
  const businessId = customer.tenant.businessId;
  const outcome = catalogOutcome(
    id === null ? await addBusinessProduct(getStaffDb(), { businessId, product }) : await updateBusinessProduct(getStaffDb(), { businessId, id, product }),
  );
  // As with services: the first product puts the Products tab on the page.
  if (outcome.kind !== "saved" || id !== null || (await listBusinessProducts(getStaffDb(), businessId)).length !== 1) return outcome;
  return (await turnOnPageTab(getStaffDb(), { businessId, tab: "products", now: new Date() })) ? { kind: "saved", tabOn: "products" } : outcome;
}

export async function removeOwnProduct(customer: Customer, id: string): Promise<void> {
  if (await isTakenDownBusiness(customer)) return;
  const removed = await deleteBusinessProduct(getStaffDb(), { businessId: customer.tenant.businessId, id });
  // The photo went with the product; its file goes too.
  if (removed.photoId !== null) await deleteProductPhotoFiles(getMediaStorage(), customer.tenant.businessId, removed.photoId);
}

/** Takes the photo off a product and deletes its files. */
export async function removeOwnProductPhoto(customer: Customer, productId: string): Promise<void> {
  if (await isTakenDownBusiness(customer)) return;
  await removeProductPhoto({ staffDb: getStaffDb(), storage: getMediaStorage() }, customer.tenant, productId);
}

/** Adds a question and its answer, or changes the one `id` names. */
export async function saveOwnFaq(customer: Customer, id: string | null, faq: FaqInput): Promise<CatalogOutcome> {
  if (await isTakenDownBusiness(customer)) return { kind: "refused", message: TAKEN_DOWN_MESSAGE };
  const businessId = customer.tenant.businessId;
  const outcome = catalogOutcome(
    id === null ? await addBusinessFaq(getStaffDb(), { businessId, faq }) : await updateBusinessFaq(getStaffDb(), { businessId, id, faq }),
  );
  // As with services: the first question puts the FAQ tab on the page.
  if (outcome.kind !== "saved" || id !== null || (await listBusinessFaqs(getStaffDb(), businessId)).length !== 1) return outcome;
  return (await turnOnPageTab(getStaffDb(), { businessId, tab: "faq", now: new Date() })) ? { kind: "saved", tabOn: "faq" } : outcome;
}

export async function removeOwnFaq(customer: Customer, id: string): Promise<void> {
  if (await isTakenDownBusiness(customer)) return;
  await deleteBusinessFaq(getStaffDb(), { businessId: customer.tenant.businessId, id });
}

const NEEDS_IDENTITY_MESSAGE = "Fill in your Identity first, then come back here.";

/** Saves which buttons visitors get; refused until the Identity is saved (the options live on its row). */
export async function saveOwnContactOptions(customer: Customer, options: readonly ContactOption[]): Promise<CatalogOutcome> {
  if (await isTakenDownBusiness(customer)) return { kind: "refused", message: TAKEN_DOWN_MESSAGE };
  const saved = await setContactOptions(getStaffDb(), { businessId: customer.tenant.businessId, options, now: new Date() });
  return saved ? { kind: "saved" } : { kind: "refused", message: NEEDS_IDENTITY_MESSAGE };
}

/** Saves which optional tabs the business's page shows and what it calls Services and Products; refused until the Identity is saved (the choice lives on its row). */
export async function saveOwnPageTabs(customer: Customer, input: PageTabsInput): Promise<CatalogOutcome> {
  if (await isTakenDownBusiness(customer)) return { kind: "refused", message: TAKEN_DOWN_MESSAGE };
  const saved = await setPageTabs(getStaffDb(), {
    businessId: customer.tenant.businessId,
    tabs: input.tabs,
    servicesLabel: input.labels.services,
    productsLabel: input.labels.products,
    now: new Date(),
  });
  return saved ? { kind: "saved" } : { kind: "refused", message: NEEDS_IDENTITY_MESSAGE };
}

/** Saves how the business takes payment and its licences; refused until the Identity is saved. */
export async function saveOwnTrust(customer: Customer, trust: TrustInput): Promise<CatalogOutcome> {
  if (await isTakenDownBusiness(customer)) return { kind: "refused", message: TAKEN_DOWN_MESSAGE };
  // The first time the owner gives any trust detail, Good to know goes on their page.
  const before = await findDirectoryProfile(getStaffDb(), customer.tenant.businessId);
  const hadTrust = before !== null && (before.paymentMethods.length > 0 || before.licences.length > 0);
  const saved = await setTrustInformation(getStaffDb(), {
    businessId: customer.tenant.businessId,
    paymentMethods: trust.paymentMethods,
    licences: trust.licences,
    now: new Date(),
  });
  if (!saved) return { kind: "refused", message: NEEDS_IDENTITY_MESSAGE };
  const hasTrust = trust.paymentMethods.length > 0 || trust.licences.length > 0;
  if (hadTrust || !hasTrust) return { kind: "saved" };
  return (await turnOnPageTab(getStaffDb(), { businessId: customer.tenant.businessId, tab: "trust", now: new Date() })) ? { kind: "saved", tabOn: "trust" } : { kind: "saved" };
}
