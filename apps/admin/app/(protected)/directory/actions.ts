"use server";

import {
  deleteDirectoryVisitor,
  hideDirectoryComment,
  hideDirectoryReview,
  markDirectoryEnquiryHandled,
  removeDirectoryVerification,
  restoreDirectoryComment,
  restoreDirectoryReview,
  setDirectoryTrusted,
  upsertDirectoryVerification,
} from "@fynix/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  directoryHref,
  parseDirectoryView,
  parseListingKey,
  parseVerificationForm,
  verificationValuesFrom,
  type DirectoryNotice,
  type DirectoryView,
  type VerificationFormState,
} from "@/lib/directory-view";
import { getStaffDb } from "@/lib/server/db";
import { listingKeyForAddress } from "@/lib/server/page-address";
import { requireStaffAccess } from "@/lib/server/staff-access";

/**
 * The Directory page's actions. Each row form posts the row's id (or listing key) and the view it was shown in (show,
 * status or search, page), so the redirect lands back on the same list with a one-line notice. The database functions
 * only act on a row still in the state the button was shown for, so a double click or a colleague's earlier click
 * reads as "unchanged" rather than doing it twice.
 */

const idSchema = z.uuid();

const SAVE_PROBLEM_MESSAGE = "That didn't save. Try again, and tell an admin if it keeps happening.";

function readId(formData: FormData, what: string): string {
  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) throw new Error(`${what} must be a valid id.`);
  return parsed.data;
}

function postedView(formData: FormData): DirectoryView {
  return parseDirectoryView((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
}

function redirectWith(view: DirectoryView, notice: DirectoryNotice): never {
  revalidatePath("/directory");
  redirect(directoryHref(view, notice));
}

function backTo(formData: FormData, done: boolean, notice: DirectoryNotice): never {
  redirectWith(postedView(formData), done ? notice : "unchanged");
}

/** Marks a new enquiry handled: someone has passed it on. */
export async function markEnquiryHandledAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const enquiryId = readId(formData, "The enquiry");
  const done = await markDirectoryEnquiryHandled(getStaffDb(), { enquiryId, staffUserId: user.id, now: new Date() });
  backTo(formData, done, "handled");
}

/** Hides a published review: it stops counting towards the business's rating and stops showing on the website. */
export async function hideReviewAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const reviewId = readId(formData, "The review");
  const done = await hideDirectoryReview(getStaffDb(), { reviewId, staffUserId: user.id, now: new Date() });
  backTo(formData, done, "hidden");
}

/** Publishes a hidden review again. */
export async function restoreReviewAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const reviewId = readId(formData, "The review");
  const done = await restoreDirectoryReview(getStaffDb(), { reviewId, now: new Date() });
  backTo(formData, done, "restored");
}

/** Hides a published comment: it stops showing under its review on the website. */
export async function hideCommentAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const commentId = readId(formData, "The comment");
  const done = await hideDirectoryComment(getStaffDb(), { commentId, staffUserId: user.id, now: new Date() });
  backTo(formData, done, "comment_hidden");
}

/** Publishes a hidden comment again. */
export async function restoreCommentAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const commentId = readId(formData, "The comment");
  const done = await restoreDirectoryComment(getStaffDb(), commentId);
  backTo(formData, done, "comment_restored");
}

/**
 * Verifies a business from the Verified tab's form: its page address on the website, its name and the confirmed
 * number (or none), and optionally the Trusted tag too. Verifying one that already is replaces its details. A refusal comes back to the form with what
 * was typed; success lands on the Verified list, newest first, where it now sits at the top.
 */
export async function verifyBusinessAction(_previous: VerificationFormState, formData: FormData): Promise<VerificationFormState> {
  const { user } = await requireStaffAccess();
  const values = verificationValuesFrom((name) => formData.get(name));
  // A business's page as it is now, /in/mh/business/<name>/<code>, is read as its listing key first.
  const parsed = parseVerificationForm({ ...values, listing: await listingKeyForAddress(values.listing) });
  if (!parsed.success) return { status: "error", message: parsed.message, field: parsed.field, values };

  let replaced: boolean;
  try {
    const { trusted, ...details } = parsed.data;
    const result = await upsertDirectoryVerification(getStaffDb(), {
      ...details,
      // Ticked gives the tag; unticked leaves it as the business has it (the row's own button takes it away).
      ...(trusted ? { trusted: true } : {}),
      staffUserId: user.id,
      now: new Date(),
    });
    replaced = result.replaced;
  } catch (error) {
    console.error("A staff member could not verify a directory business.", { listingKey: parsed.data.listingKey, error });
    return { status: "error", message: SAVE_PROBLEM_MESSAGE, field: null, values };
  }

  redirectWith({ section: "verified", search: "", page: 1 }, replaced ? "reverified" : "verified");
}

/** Gives or takes away the Trusted tag on a verified business, from the row's button. */
async function setTrusted(formData: FormData, trusted: boolean): Promise<never> {
  await requireStaffAccess();
  const listingKey = parseListingKey(formData.get("key"));
  if (listingKey === null) throw new Error("The Trusted tag must name a valid listing key.");
  const done = await setDirectoryTrusted(getStaffDb(), listingKey, trusted, new Date());
  return backTo(formData, done, trusted ? "trusted_given" : "trusted_removed");
}

export async function giveTrustedAction(formData: FormData): Promise<void> {
  await setTrusted(formData, true);
}

export async function removeTrustedAction(formData: FormData): Promise<void> {
  await setTrusted(formData, false);
}

/** Removes a business's verification once the row's confirm box is ticked: the website drops its tag and number. */
export async function removeVerificationAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const listingKey = parseListingKey(formData.get("key"));
  if (listingKey === null) throw new Error("The verification must name a valid listing key.");
  if (formData.get("confirm") !== "on") redirectWith(postedView(formData), "confirm_remove");
  const done = await removeDirectoryVerification(getStaffDb(), listingKey);
  backTo(formData, done, "removed");
}

/**
 * Deletes a website visitor's account once the row's confirm box is ticked: the way to answer a request to erase it. The
 * reviews, comments and enquiries they sent are separate records with their own copy of the name and number.
 */
export async function deleteVisitorAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const visitorId = readId(formData, "The visitor");
  if (formData.get("confirm") !== "on") redirectWith(postedView(formData), "confirm_remove");
  const done = await deleteDirectoryVisitor(getStaffDb(), visitorId);
  backTo(formData, done, "visitor_deleted");
}
