"use server";

import { revalidatePath } from "next/cache";
import { reportUnexpectedPanelError } from "@/lib/server/report-panel-error";
import { redirect } from "next/navigation";
import {
  setOwnDirectoryPromotionVisible,
  updateOwnListingContent,
  withTenantScope,
  type ListingContentPatch,
} from "@firstfold/db";
import type { FormParseResult } from "@firstfold/shared/lib/form-result";
import {
  parseAboutForm,
  parseButtonsForm,
  parseTaglineForm,
  parseTagsForm,
  parseVisibleForm,
} from "@firstfold/shared/lib/directory/listing-content";
import { parsePromotionTag } from "@firstfold/shared/lib/directory/promotion";
import { promotionNoticeHref } from "@/lib/listing/promotion-notices";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull } from "@/lib/server/blog-access";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { getAppDb } from "@/lib/server/db";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { startListingPromotionPayment } from "@/lib/server/listing-promotion";
import { paymentRequiredState, unexpectedErrorState } from "@/lib/server/panel-form-errors";
import { listingMissingState } from "./errors";

/**
 * The one shape every Listing form shares: paid plan first (the house rule for every write), then the form's own
 * parser, then one tenant-scoped update of listing_content. Grants keep this to the client's own columns.
 */
async function saveListing<T>(
  formData: FormData,
  parse: (formData: FormData) => FormParseResult<T>,
  toPatch: (data: T) => ListingContentPatch,
): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parse(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    const updated = await withTenantScope(getAppDb(), access.tenant, (tx) =>
      updateOwnListingContent(tx, toPatch(parsed.data), new Date()),
    );
    if (!updated) return listingMissingState(formData);
  } catch (error) {
    console.error("[listing] save failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/listing", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/listing");
  return panelFormSavedState;
}

/** The one line about the business. Empty clears it. */
export async function saveListingAboutAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  return saveListing(formData, parseAboutForm, ({ about }) => ({ about }));
}

/** The tagline card: its one line (empty removes the card) and its colour. */
export async function saveListingTaglineAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  return saveListing(formData, parseTaglineForm, ({ tagline, taglineColour }) => ({ tagline, taglineColour }));
}

/** The services list, replaced whole: every `tag` field the form posts, in order. */
export async function saveListingTagsAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  return saveListing(formData, parseTagsForm, ({ tags }) => ({ tags }));
}

/** All five button switches at once; an unticked (or disabled) box posts nothing and saves as off. */
export async function saveListingButtonsAction(
  _previous: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  return saveListing(formData, parseButtonsForm, (buttons) => ({ buttons }));
}

/** The Show in directory switch. Off hides the listing from Firstfold Local and keeps everything else. */
export async function setListingVisibleAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  return saveListing(formData, parseVisibleForm, ({ visible }) => ({ visible }));
}

/**
 * Pay for a week of a listing tag (the Promotion section's Pay and Renew buttons). A form post, like Billing's Pay, so
 * a payment only ever opens on purpose. The tag comes from the form and the price from the server; the week starts
 * when the payment is confirmed, not here.
 */
export async function payListingPromotionAction(formData: FormData): Promise<void> {
  const customer = await paidCustomerOrNull();
  if (customer === null) redirect(promotionNoticeHref("payment-required"));
  const tag = parsePromotionTag(formData.get("tag"));
  if (tag === null) redirect(promotionNoticeHref("invalid-tag"));

  const started = await startListingPromotionPayment(customer, tag, new Date());
  if (started.kind === "refused") redirect(promotionNoticeHref(started.reason));
  if (started.kind === "no-listing") redirect("/listing");
  redirectForChargePayment(started);
}

/** The tag's on/off switch. Off hides it from the directory for the paid week(s) and gives no time back. */
export async function setListingPromotionVisibleAction(
  _previous: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  const access = await paidCustomerOrNull();
  if (access === null) return paymentRequiredState(formData);

  const parsed = parseVisibleForm(formData);
  if (!parsed.success) return panelFormErrorState(parsed, formData);

  try {
    await withTenantScope(getAppDb(), access.tenant, (tx) =>
      setOwnDirectoryPromotionVisible(tx, parsed.data.visible, new Date()),
    );
  } catch (error) {
    console.error("[listing] promotion switch failed", errorLogInfo(error));
    await reportUnexpectedPanelError(error, "/listing", access.user.id);
    return unexpectedErrorState(error, formData);
  }

  revalidatePath("/listing");
  return panelFormSavedState;
}
