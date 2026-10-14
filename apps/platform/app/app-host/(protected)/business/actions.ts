"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BusinessDetailsFormState } from "@/lib/business-details-fields";
import { parseBusinessDetailsForm } from "@/lib/business-details-form";
import { listingRefusalField, parseBusinessListingForm, type BusinessListingFormState } from "@/lib/business-listing-form";
import { parseExtraCategoriesForm } from "@/lib/extra-categories-form";
import { isItemDeleteForm, parseFaqForm, parseProductForm, parseServiceForm, readItemId } from "@/lib/catalog-form";
import { parseContactOptionsForm, parsePageTabsForm, parseTrustForm } from "@/lib/contact-trust-form";
import type { ItemFormState } from "@/lib/item-form-state";
import { ensureGeoCatalog } from "@/lib/server/geo-catalog";
import { PICTURE_KINDS, type PictureKind } from "@fynix/shared/lib/directory/pictures";
import { isPublished } from "@/lib/business-profile";
import { profileHref, type ProfileNotice } from "@/lib/business-profile-notices";
import { ownerFormCheck } from "@/lib/owner-form";
import { parseYoutubeLink } from "@/lib/youtube-video";
import { forgetGoogleImport } from "@/lib/server/google-import-cookie";
import { getMediaStorage } from "@fynix/shared/server/media-storage";
import { getStaffDb } from "@/lib/server/db";
import { removeListingPictures } from "@/lib/server/listing-pictures";
import { listingVideoDeps, removeListingVideo, setFeaturedListingVideo } from "@/lib/server/listing-videos";
import { parseVideoSlot } from "@fynix/shared/lib/directory/videos";
import { LISTING_PAGE_PATH, requireCustomerAccess } from "@/lib/server/customer-access";
import {
  getBusinessProfilePage,
  publishOwnBusiness,
  removeOwnProduct,
  removeOwnProductPhoto,
  removeOwnFaq,
  removeOwnService,
  saveOwnContactOptions,
  saveOwnPageTabs,
  saveOwnExtraCategories,
  saveOwnDetails,
  saveOwnListing,
  saveOwnProduct,
  saveOwnFaq,
  saveOwnService,
  saveOwnTrust,
  setOwnVideo,
} from "@/lib/server/business-profile";

/*
 * The Business profile's actions (docs/superpowers/specs/2026-10-01-business-profile-design.md). Each checks the
 * customer, parses its form (which may post only the fields it shows) and saves through lib/server/business-profile.ts,
 * then lands back on the page on the tab that comes next, with a notice code the page reads back.
 */

const isVideoForm = ownerFormCheck(["video"]);
const isEmptyForm = ownerFormCheck([]);

function done(tab: string, notice?: ProfileNotice): never {
  revalidatePath(LISTING_PAGE_PATH);
  redirect(profileHref(tab, notice));
}

/** Saves the Identity tab. A business still being set up goes on to Listing; a live one stays on Identity. */
export async function saveDetailsAction(_previous: BusinessDetailsFormState, formData: FormData): Promise<BusinessDetailsFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  // A claim on a business the directory had keeps the directory's name, address and number, so the form asks for no address.
  const before = await getBusinessProfilePage(customer);
  const parsed = parseBusinessDetailsForm(formData, new Date(), { claimed: before.state.listing === "claimed" });
  if (!parsed.success) return { status: "error", field: parsed.field, message: parsed.message };

  const outcome = await saveOwnDetails(customer, parsed.data);
  if (outcome.kind === "refused") return { status: "error", field: null, message: outcome.message };
  // Whatever was imported from Google has now been looked at and saved.
  await forgetGoogleImport();
  const { state } = await getBusinessProfilePage(customer);
  if (isPublished(state) || state.listing === "claimed") done("details", "details-saved");
  done("listing", "details-saved");
}

/** Saves the Listing tab. The first save gives the business its Business ID, which the tab then shows. */
export async function saveListingAction(_previous: BusinessListingFormState, formData: FormData): Promise<BusinessListingFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  await ensureGeoCatalog();
  const parsed = parseBusinessListingForm(formData);
  if (!parsed.success) return { status: "error", field: parsed.field, message: parsed.message };

  const outcome = await saveOwnListing(customer, parsed.data);
  if (outcome.kind === "refused") return { status: "error", field: listingRefusalField(outcome.reason), message: outcome.message };
  done("listing", outcome.added ? "listing-added" : "listing-saved");
}

/** Saves the categories the business also lists in. A save that works lands back on the Listing tab with a notice. */
export async function saveExtraCategoriesAction(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  await ensureGeoCatalog();
  const parsed = parseExtraCategoriesForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const outcome = await saveOwnExtraCategories(customer, parsed.data);
  if (outcome.kind === "refused") return { status: "error", message: outcome.message };
  done("listing", "categories-saved");
}

export async function saveVideoAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  if (!isVideoForm(formData)) done("photos", "invalid");
  const typed = formData.get("video");
  const parsed = parseYoutubeLink(typeof typed === "string" ? typed : "");
  if (!parsed.ok) done("photos", "video-invalid");
  done("photos", (await setOwnVideo(customer, parsed.videoId)) ? "video-saved" : "needs-details");
}

export async function removeVideoAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  if (!isEmptyForm(formData)) done("photos", "invalid");
  await setOwnVideo(customer, null);
  done("photos", "video-removed");
}

const isClipForm = ownerFormCheck(["slot"]);

/** Removes one of a member's short videos, live or being got ready: the row first, then the video on Vimeo. Allowed whatever the membership. */
export async function removeClipAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  if (!isClipForm(formData)) done("photos", "invalid");
  const slot = parseVideoSlot(formData.get("slot"));
  if (slot === null) done("photos", "invalid");
  await removeListingVideo(listingVideoDeps(getStaffDb()), customer.tenant, slot, new Date());
  done("photos", "clip-removed");
}

const isFeatureClipForm = ownerFormCheck(["video", "featured"]);

/**
 * Puts one of a member's live videos in the mosaic at the top of its page, or takes it out again (`featured` "0"). Only
 * one video is there at a time: choosing another replaces it.
 */
export async function featureClipAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  if (!isFeatureClipForm(formData)) done("photos", "invalid");
  const video = formData.get("video");
  const featured = formData.get("featured");
  if (typeof video !== "string" || (featured !== "1" && featured !== "0")) done("photos", "invalid");
  const outcome = await setFeaturedListingVideo(getStaffDb(), customer.tenant, featured === "1" ? video : null);
  if (outcome.kind !== "set") done("photos", "clip-feature-failed");
  done("photos", featured === "1" ? "clip-featured" : "clip-unfeatured");
}

/** Publishes the business: its page goes live as Claimed, with no call from us. */
export async function publishAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  if (!isEmptyForm(formData)) done("review", "invalid");
  const outcome = await publishOwnBusiness(customer);
  if (outcome.kind === "published") done("review", "published");
  done("review", `publish-${outcome.reason}`);
}

/** Kinds of picture the Photos tab removes: everything but the ad pictures, which live on Advertise. */
const PHOTO_TAB_KINDS: readonly PictureKind[] = PICTURE_KINDS;

/** `moved` is set when the photo was copied somewhere else first (Make main into an empty main place), so the notice says so. */
const isPhotoKindForm = ownerFormCheck(["kind", "moved"]);

function photoKindOf(formData: FormData): PictureKind | null {
  if (!isPhotoKindForm(formData)) return null;
  return PHOTO_TAB_KINDS.find((kind) => kind === formData.get("kind")) ?? null;
}

/** Removes one of the business's pictures (feature image, banner or a gallery photo), live or not: rows first, then the file. */
export async function removePhotoAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const kind = photoKindOf(formData);
  // The ad pictures are removed from Advertise, not here.
  if (kind === null || kind === "ad") done("photos", "invalid");
  await removeListingPictures({ staffDb: getStaffDb(), storage: getMediaStorage() }, customer.tenant, kind, new Date());
  done("photos", formData.get("moved") === "yes" ? "photo-moved" : "photo-removed");
}

/** Saves one service: a new one, or the one the form names. A save that works lands back on Services with a notice. */
export async function saveServiceAction(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const parsed = parseServiceForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const outcome = await saveOwnService(customer, parsed.id, parsed.data);
  if (outcome.kind === "refused") return { status: "error", message: outcome.message };
  done("services", outcome.tabOn === undefined ? "service-saved" : "service-saved-tab");
}

export async function removeServiceAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const id = isItemDeleteForm(formData) ? readItemId(formData) : null;
  if (id === null) done("services", "invalid");
  await removeOwnService(customer, id);
  done("services", "service-removed");
}

/** Saves one product: a new one, or the one the form names. */
export async function saveProductAction(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const parsed = parseProductForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const outcome = await saveOwnProduct(customer, parsed.id, parsed.data);
  if (outcome.kind === "refused") return { status: "error", message: outcome.message };
  done("products", outcome.tabOn === undefined ? "product-saved" : "product-saved-tab");
}

export async function removeProductAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const id = isItemDeleteForm(formData) ? readItemId(formData) : null;
  if (id === null) done("products", "invalid");
  await removeOwnProduct(customer, id);
  done("products", "product-removed");
}

/** Takes the photo off one product. The photo is added from the product's edit sheet, which uploads it on its own. */
export async function removeProductPhotoAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const id = isItemDeleteForm(formData) ? readItemId(formData) : null;
  if (id === null) done("products", "invalid");
  await removeOwnProductPhoto(customer, id);
  done("products", "product-photo-removed");
}

/** Saves one question and its answer: a new one, or the one the form names. */
export async function saveFaqAction(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const parsed = parseFaqForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const outcome = await saveOwnFaq(customer, parsed.id, parsed.data);
  if (outcome.kind === "refused") return { status: "error", message: outcome.message };
  done("faq", outcome.tabOn === undefined ? "faq-saved" : "faq-saved-tab");
}

export async function removeFaqAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const id = isItemDeleteForm(formData) ? readItemId(formData) : null;
  if (id === null) done("faq", "invalid");
  await removeOwnFaq(customer, id);
  done("faq", "faq-removed");
}

/** Saves which buttons visitors get on the business's page. */
export async function saveContactOptionsAction(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const parsed = parseContactOptionsForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const outcome = await saveOwnContactOptions(customer, parsed.data);
  if (outcome.kind === "refused") return { status: "error", message: outcome.message };
  done("contact", "contact-saved");
}

/** Saves which optional tabs the business's public page shows. */
export async function savePageTabsAction(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const parsed = parsePageTabsForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const outcome = await saveOwnPageTabs(customer, parsed.data);
  if (outcome.kind === "refused") return { status: "error", message: outcome.message };
  done("page-tabs", "page-tabs-saved");
}

/** Saves how the business takes payment and its licences. */
export async function saveTrustAction(_previous: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  const parsed = parseTrustForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };
  const outcome = await saveOwnTrust(customer, parsed.data);
  if (outcome.kind === "refused") return { status: "error", message: outcome.message };
  done("trust", outcome.tabOn === undefined ? "trust-saved" : "trust-saved-tab");
}

/** Drops what an import from Google found, without using it. */
export async function discardGoogleImportAction(formData: FormData): Promise<void> {
  await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  if (!isEmptyForm(formData)) done("details", "invalid");
  await forgetGoogleImport();
  done("details");
}
