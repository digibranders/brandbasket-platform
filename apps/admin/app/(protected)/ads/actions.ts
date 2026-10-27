"use server";

import { randomUUID } from "node:crypto";
import {
  adPictureShape,
  approveClaimTagline,
  decideDirectoryClaim,
  decideDirectoryPicture,
  findStaffAdsByIds,
  type NewStaffAdPicture,
  type StaffAdPictureChange,
  placeStaffAds,
  removeDirectoryAdPrice,
  removeDirectoryAdSpotPrice,
  removeStaffAds,
  setDirectoryAdPrice,
  setDirectoryAdSpotPrice,
  takeDownDirectoryPicture,
  updateStaffAds,
} from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAdCategory } from "@brandbasket/shared/lib/directory/places";
import { formatAdWeek, parseAdRupees } from "@brandbasket/shared/lib/directory/ads";
import { PICTURE_SHAPES } from "@brandbasket/shared/lib/directory/pictures";
import { staffAdPictureKey } from "@brandbasket/shared/server/media-keys";
import { deleteMediaFiles, getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { HOME_PRICE_SCOPE } from "@/lib/ad-prices";
import { adsHref, parseAdsView, type AdsNotice, type AdsView } from "@/lib/ads-view";
import { parseStaffAdEdit, parseStaffAdForm, staffAdEditValuesFrom, staffAdValuesFrom, type StaffAdEditFormState, type StaffAdFormState } from "@/lib/staff-ad-form";
import { resolveListingAddress } from "@/lib/server/page-address";
import { getStaffDb } from "@/lib/server/db";
import { processStaffAdPicture, StaffAdPictureError } from "@/lib/server/staff-ad-picture";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { requireStaffCan } from "@/lib/server/staff-role";

/*
 * The Ads page's actions. Row forms post the row's id and the view they were shown in, so the redirect lands back on
 * the same list with a one-line notice.
 */

const idSchema = z.uuid();
const seenClaimSchema = z.object({ listingKey: z.string().min(1), phone: z.string().min(1), businessName: z.string().min(1) });

function readId(formData: FormData): string {
  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) throw new Error("The form must name a valid id.");
  return parsed.data;
}

function postedView(formData: FormData): AdsView {
  return parseAdsView((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
}

function back(view: AdsView, notice: AdsNotice): never {
  revalidatePath("/ads");
  redirect(adsHref(view, notice));
}

/** Approves a claim after calling the owner: verifies the listing and lets the account bid. */
export async function approveClaimAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  // What the row showed when Approve was pressed. An owner may still change an added business until it is decided, so
  // the approval only goes through for the details staff actually confirmed on the call.
  const seen = seenClaimSchema.safeParse({
    listingKey: formData.get("seenListingKey"),
    phone: formData.get("seenPhone"),
    businessName: formData.get("seenBusinessName"),
  });
  if (!seen.success) throw new Error("The approve form must name the details it showed.");
  const outcome = await decideDirectoryClaim(getStaffDb(), {
    claimId: readId(formData),
    approve: true,
    staffId: user.id,
    now: new Date(),
    seen: seen.data,
  });
  const notices: Readonly<Record<typeof outcome, AdsNotice>> = {
    decided: "approved",
    "listing-taken": "listing_taken",
    changed: "claim_changed",
    "email-unconfirmed": "email_unconfirmed",
    "not-found": "unchanged",
  };
  back(postedView(formData), notices[outcome]);
}

/** Approves the claim's ad line as it stands. */
export async function approveTaglineAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const done = await approveClaimTagline(getStaffDb(), readId(formData));
  back(postedView(formData), done ? "tagline_approved" : "unchanged");
}

/** Sets a category's weekly prices; both are required. */
export async function savePriceAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("money");
  const category = formData.get("category");
  const top = parseAdRupees(formData.get("top"));
  const side = parseAdRupees(formData.get("side"));
  if (typeof category !== "string" || !isAdCategory(category) || top === null || side === null) {
    back({ section: "prices" }, "price_invalid");
  }
  await setDirectoryAdPrice(getStaffDb(), { categorySlug: category, topWeekPaise: top, sideWeekPaise: side, staffId: user.id });
  back({ section: "prices" }, "price_saved");
}

/** Closes a category to new bids. */
export async function removePriceAction(formData: FormData): Promise<void> {
  await requireStaffCan("money");
  const category = formData.get("category");
  if (typeof category !== "string") back({ section: "prices" }, "unchanged");
  const done = await removeDirectoryAdPrice(getStaffDb(), category);
  back({ section: "prices" }, done ? "price_removed" : "unchanged");
}

/** Which placement a posted spot-price form is about: the home page's one price, or a category's business pages. */
function readSpotPlacement(value: FormDataEntryValue | null): "home" | "profile" | null {
  return value === "home" || value === "profile" ? value : null;
}

/** The scope a spot price is kept under: "all" for the home page, a real category for business pages. */
function spotScope(placement: "home" | "profile", category: FormDataEntryValue | null): string | null {
  if (placement === "home") return HOME_PRICE_SCOPE;
  return typeof category === "string" && isAdCategory(category) ? category : null;
}

/** Sets the weekly price of the home page, or of one category's business pages. */
export async function saveSpotPriceAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("money");
  const placement = readSpotPlacement(formData.get("placement"));
  const weekPaise = parseAdRupees(formData.get("price"));
  const scopeSlug = placement === null ? null : spotScope(placement, formData.get("category"));
  if (placement === null || scopeSlug === null || weekPaise === null) back({ section: "prices" }, "spot_price_invalid");
  await setDirectoryAdSpotPrice(getStaffDb(), { scopeSlug, placement, weekPaise, staffId: user.id });
  back({ section: "prices" }, "spot_price_saved");
}

/** Closes the home page, or one category's business pages, to new bids. */
export async function removeSpotPriceAction(formData: FormData): Promise<void> {
  await requireStaffCan("money");
  const placement = readSpotPlacement(formData.get("placement"));
  const scopeSlug = placement === null ? null : spotScope(placement, formData.get("category"));
  if (placement === null || scopeSlug === null) back({ section: "prices" }, "unchanged");
  const done = await removeDirectoryAdSpotPrice(getStaffDb(), scopeSlug, placement);
  back({ section: "prices" }, done ? "spot_price_removed" : "unchanged");
}

/**
 * Places an ad by hand for a business that asked for one: on the spot, in the category and area, and for the weeks
 * staff chose. Returns only on a refusal, which points at its field and keeps what was typed; on success it redirects
 * to the list of placed ads.
 */
export async function placeStaffAdAction(_previous: StaffAdFormState, formData: FormData): Promise<StaffAdFormState> {
  const { user } = await requireStaffAccess();
  const values = staffAdValuesFrom((name) => formData.get(name));
  // A business's page as it is now, /in/mh/business/<name>/<code>, is read as its listing key first. A link ad has no business page.
  const { listing, keyless } = values.kind === "link" ? { listing: "", keyless: false } : await resolveListingAddress(values.listing);
  if (keyless) {
    return {
      status: "error",
      message: "That business was added recently and has no address a staff ad can use yet, so an ad can't be placed for it here.",
      field: "listing",
      values,
    };
  }
  const parsed = parseStaffAdForm({ ...values, listing });
  if (!parsed.success) return { status: "error", message: parsed.message, field: parsed.field, values };

  // The picture, if staff chose one: cut to the spot's exact shape and stored first, recorded only if the ad is placed.
  let picture: NewStaffAdPicture | null = null;
  const file = formData.get("picture");
  if (file instanceof File && file.size > 0) {
    const size = PICTURE_SHAPES[adPictureShape(parsed.data.placement, parsed.data.spot) === "tall" ? "ad_tall" : "ad_wide"];
    try {
      const processed = await processStaffAdPicture(new Uint8Array(await file.arrayBuffer()), size);
      const id = randomUUID();
      const storageKey = staffAdPictureKey(id);
      await getMediaStorage().put(storageKey, processed.bytes, processed.mimeType);
      picture = { id, storageKey, mimeType: processed.mimeType, bytes: processed.bytes.byteLength, width: processed.width, height: processed.height, sha256: processed.sha256 };
    } catch (error) {
      if (error instanceof StaffAdPictureError) return { status: "error", message: error.message, field: "picture", values };
      console.error("A staff member's ad picture could not be stored.", error);
      return { status: "error", message: "The picture didn't save. Try again, and tell an admin if it keeps happening.", field: "picture", values };
    }
  }
  /** The picture's file is not wanted when its ad was not placed. */
  const dropPicture = async (): Promise<void> => {
    if (picture !== null) await deleteMediaFiles(getMediaStorage(), [picture.storageKey]);
  };

  let outcome: Awaited<ReturnType<typeof placeStaffAds>>;
  try {
    outcome = await placeStaffAds(getStaffDb(), { ...parsed.data, picture, staffId: user.id, now: new Date() });
  } catch (error) {
    await dropPicture();
    console.error("A staff member could not place a directory ad.", { listingKey: parsed.data.listingKey, error });
    return { status: "error", message: "That didn't save. Try again, and tell an admin if it keeps happening.", field: null, values };
  }
  if (outcome.kind !== "placed") await dropPicture();
  if (outcome.kind === "week-past") {
    return { status: "error", message: "That week is already over. Choose this week or a later one.", field: "fromWeek", values };
  }
  if (outcome.kind === "spot-taken") {
    const holder = outcome.by === "staff" ? "another ad placed by staff" : "an auction winner";
    return {
      status: "error",
      message: `That spot is already held for ${formatAdWeek(outcome.weekStart)} by ${holder}. Nothing was placed.`,
      field: "spot",
      values,
    };
  }
  back({ section: "placed" }, "placed");
}

/**
 * Saves changes to a booking staff placed: what it says, where a link ad leads, its picture, and the team's own price
 * and note, in every week of it still up at once. Where and when it shows is not here: that is a new booking. Returns
 * only on a refusal, which points at its field and keeps what was typed; on success it redirects to the list.
 */
export async function editStaffAdAction(_previous: StaffAdEditFormState, formData: FormData): Promise<StaffAdEditFormState> {
  const { user } = await requireStaffAccess();
  const ids = z.array(idSchema).min(1).max(104).safeParse(formData.getAll("id"));
  if (!ids.success) throw new Error("The form must name the ads to change.");
  const values = staffAdEditValuesFrom((name) => formData.get(name));
  const [first] = await findStaffAdsByIds(getStaffDb(), ids.data);
  // Taken down since the page was opened: there is nothing left to change.
  if (first === undefined) back({ section: "placed" }, "unchanged");

  // Whether it leads to a link is the booking's own, never the form's.
  const parsed = parseStaffAdEdit(values, { isLink: first.linkUrl !== null });
  if (!parsed.success) return { status: "error", message: parsed.message, field: parsed.field, values };

  // The new picture, if staff chose one: cut to the spot's exact shape and stored first, recorded only if the edit is.
  let stored: NewStaffAdPicture | null = null;
  let picture: StaffAdPictureChange = { kind: "keep" };
  const pictureChange = formData.get("pictureChange");
  if (pictureChange === "replace") {
    const file = formData.get("picture");
    if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose the picture again.", field: "picture", values };
    const size = PICTURE_SHAPES[adPictureShape(first.placement, first.spot) === "tall" ? "ad_tall" : "ad_wide"];
    try {
      const processed = await processStaffAdPicture(new Uint8Array(await file.arrayBuffer()), size);
      const id = randomUUID();
      const storageKey = staffAdPictureKey(id);
      await getMediaStorage().put(storageKey, processed.bytes, processed.mimeType);
      stored = { id, storageKey, mimeType: processed.mimeType, bytes: processed.bytes.byteLength, width: processed.width, height: processed.height, sha256: processed.sha256 };
      picture = { kind: "replace", picture: stored, staffId: user.id };
    } catch (error) {
      if (error instanceof StaffAdPictureError) return { status: "error", message: error.message, field: "picture", values };
      console.error("A staff member's ad picture could not be stored.", error);
      return { status: "error", message: "The picture didn't save. Try again, and tell an admin if it keeps happening.", field: "picture", values };
    }
  } else if (pictureChange === "remove") {
    picture = { kind: "remove" };
  }
  /** The new picture's file is not wanted when the edit was not saved. */
  const dropStored = async (): Promise<void> => {
    if (stored !== null) await deleteMediaFiles(getMediaStorage(), [stored.storageKey]);
  };

  let outcome: Awaited<ReturnType<typeof updateStaffAds>>;
  try {
    outcome = await updateStaffAds(getStaffDb(), { ids: ids.data, ...parsed.data, picture, now: new Date() });
  } catch (error) {
    await dropStored();
    console.error("A staff member could not edit a directory ad.", { ids: ids.data, error });
    return { status: "error", message: "That didn't save. Try again, and tell an admin if it keeps happening.", field: null, values };
  }
  if (outcome.kind !== "updated") {
    await dropStored();
    back({ section: "placed" }, "unchanged");
  }
  // A picture no ad still up uses has lost its last ad: its file goes now that this has committed.
  if (outcome.droppedStorageKeys.length > 0) await deleteMediaFiles(getMediaStorage(), [...outcome.droppedStorageKeys]);
  back({ section: "placed" }, "ad_edited");
}

/** Takes a staff-placed booking down (every week of it still to run): the website stops showing it and its spots are free again at once. */
export async function removeStaffAdsAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const ids = z.array(idSchema).min(1).max(104).safeParse(formData.getAll("id"));
  if (!ids.success) throw new Error("The form must name the ads to take down.");
  const { removed, droppedStorageKeys } = await removeStaffAds(getStaffDb(), { ids: ids.data, staffId: user.id, now: new Date() });
  // A picture none of the ads still up uses has lost its last ad: its file goes now that this has committed.
  if (droppedStorageKeys.length > 0) await deleteMediaFiles(getMediaStorage(), droppedStorageKeys);
  back({ section: "placed" }, removed > 0 ? "ad_removed" : "unchanged");
}

/** Approves or refuses a listing owner's waiting picture; the file of the picture it replaces is deleted once that has committed. */
async function decidePicture(formData: FormData, approve: boolean): Promise<void> {
  const { user } = await requireStaffAccess();
  const outcome = await decideDirectoryPicture(getStaffDb(), { pictureId: readId(formData), approve, staffId: user.id, now: new Date() });
  if (outcome.kind === "decided") await deleteMediaFiles(getMediaStorage(), outcome.replacedStorageKeys);
  back(postedView(formData), outcome.kind !== "decided" ? "unchanged" : approve ? "picture_approved" : "picture_rejected");
}

/** Approves a waiting picture: it goes up on the website in place of the one that was there. */
export async function approvePictureAction(formData: FormData): Promise<void> {
  await decidePicture(formData, true);
}

/** Refuses a waiting picture: the owner sees it as not accepted, and the website keeps what it showed. */
export async function rejectPictureAction(formData: FormData): Promise<void> {
  await decidePicture(formData, false);
}

/** Takes a picture down, for one that should not have been approved: the website goes back to its own picture. */
export async function takeDownPictureAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const storageKey = await takeDownDirectoryPicture(getStaffDb(), readId(formData), new Date());
  if (storageKey !== null) await deleteMediaFiles(getMediaStorage(), [storageKey]);
  back(postedView(formData), storageKey === null ? "unchanged" : "picture_removed");
}
