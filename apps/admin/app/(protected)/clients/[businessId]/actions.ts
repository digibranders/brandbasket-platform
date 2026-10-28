"use server";

import {
  DomainNotReadyForDnsError,
  DomainSwitchNotReadyError,
  findClientDetail,
  findListingPlacement,
  InvalidWebsiteUrlError,
  ListingAddressTakenError,
  ListingPlaceFixedError,
  ListingPlaceTakenError,
  ModuleNeedsTimeZoneError,
  PlaceRegistryNotImportedError,
  ProjectNotApprovedError,
  ProjectNotReadyForPreviewError,
  saveListingPlacement,
  saveWebsiteHosting,
  setBusinessModule,
  setBusinessTimeZone,
  setBusinessWebsiteUrl,
  setDirectoryTrusted,
  TimeZoneInUseError,
  trustDirectoryBusiness,
  UnknownPlaceError,
  upsertDirectoryVerification,
} from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addOnById, MONTHLY_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";
import { parseChargeForm } from "@brandbasket/shared/lib/billing/charge-form";
import { staffChargeNoticeHref } from "@brandbasket/shared/lib/billing/charge-notices";
import { parseManualPaymentForm } from "@brandbasket/shared/lib/billing/manual-payment-form";
import { manualPaymentNoticeHref } from "@brandbasket/shared/lib/billing/manual-payment-notices";
import { businessModuleNoticeHref } from "@brandbasket/shared/lib/business-module-notices";
import { isBusinessModule } from "@brandbasket/shared/lib/business-modules";
import { canonicalTimeZone } from "@brandbasket/shared/lib/calendar/local-date";
import { parsePlacementForm } from "@brandbasket/shared/lib/directory/placement-form";
import { domainConnectNoticeHref } from "@brandbasket/shared/lib/domain-connect-notices";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { projectLaunchNoticeHref } from "@brandbasket/shared/lib/project-launch-notices";
import { projectPreviewNoticeHref } from "@brandbasket/shared/lib/project-preview-notices";
import { parseHostingForm } from "@/lib/hosting-form";
import { chatbotNoticeHref, parseChatbotForm, parseOperatorKeyForm, readChatbotStatus } from "@/lib/chatbot-form";
import { addClientChatbot, removeClientChatbot, setClientChatbotOperatorKey, setClientChatbotStatus } from "@/lib/server/chatbots-admin";
import { addOnNoticeHref, noticeForEndOutcome, noticeForRemoval, noticeForStart, type AddOnNotice } from "@/lib/add-on-notices";
import { clientListingKey, clientTagsHref } from "@/lib/client-tags";
import {
  addClientAddOn,
  endClientAddOn,
  markClientAddOnContacted,
  markClientBundledAddOnContacted,
  removeClientAddOn,
  retryClientAddOnProvider,
  setClientPressReleaseStatus,
} from "@/lib/server/add-ons-admin";
import { recordManualFirstPayment, resolveFlaggedPayment } from "@/lib/server/billing-admin";
import { addClientCharge, markClientChargePaid, waiveClientCharge } from "@/lib/server/charges-admin";
import { getStaffDb } from "@/lib/server/db";
import { DomainReadyRecipientMissingError, markDomainReady, type DomainReadyOutcome } from "@/lib/server/domain-ready";
import { DomainSwitchRecipientMissingError, switchDomain } from "@/lib/server/domain-switch";
import { ProjectLaunchDomainMissingError, ProjectLaunchRecipientMissingError, launchProject } from "@/lib/server/project-launch";
import { ProjectPreviewRecipientMissingError, sendProjectPreview, type OwnerNotification } from "@/lib/server/project-preview";
import { rotateSiteApiToken } from "@/lib/server/site-token";
import { recordStaffAction } from "@/lib/server/activity";
import { placeIdForAddress } from "@/lib/server/page-address";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { requireStaffCan } from "@/lib/server/staff-role";
import { changeWebAddress } from "@/lib/server/web-address";
import type { WebAddressFormState } from "@/lib/web-address-form";

const idSchema = z.uuid();
const endKindSchema = z.enum(["cancel", "pause"], { error: "Ending an add-on needs cancel or pause." });
const pressReleaseStepSchema = z.enum(["in_progress", "published"], { error: "A press release can be set to in progress or published." });
const previewUrlSchema = z.url({ protocol: /^https?$/, error: "The preview link must be a valid http or https URL." });

function readId(value: FormDataEntryValue | null, what: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${what} must be a valid id.`);
  return parsed.data;
}

function revalidateClient(businessId: string): void {
  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${businessId}`);
  // Every tab under the client's address shows parts of what an action changes.
  revalidatePath(`/clients/${businessId}`, "layout");
}

/**
 * Records a first payment the team received outside the payment provider. The superadmin must tick that the money has arrived and give the reference and the date it arrived; the
 * amount is always the business's plan price, and who recorded it is the signed-in superadmin.
 */
export async function recordManualPaymentAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "Record a manual payment's business");
  const now = new Date();

  const form = parseManualPaymentForm(formData, now);
  if (!form.ok) redirect(manualPaymentNoticeHref(businessId, form.problem));

  const outcome = await recordManualFirstPayment({ businessId, staffUserId: user.id, ...form.details }, now);
  await recordStaffAction(staff, { businessId, kind: "payment.manual_recorded", summary: "Recorded a manual payment", data: { result: outcome.kind } });
  revalidateClient(businessId);
  redirect(manualPaymentNoticeHref(businessId, outcome.kind));
}

/**
 * Adds a charge for the client: what it is for and how many, priced from their plan. Only a custom charge carries a
 * price typed here. The customer sees it under To pay on their Billing page straight away.
 */
export async function addChargeAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The charge's business");
  const form = parseChargeForm(formData);
  if (!form.ok) redirect(staffChargeNoticeHref(businessId, form.problem));

  const outcome = await addClientCharge({ businessId, staffUserId: user.id, request: form.request });
  await recordStaffAction(staff, { businessId, kind: "charge.added", summary: "Added a charge", data: { result: outcome.kind } });
  revalidateClient(businessId);
  redirect(staffChargeNoticeHref(businessId, outcome.kind === "added" ? "added" : "no-plan"));
}

/** Records a bank transfer that pays one of the client's open charges, for the charge's own amount. */
export async function markChargePaidAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The charge's business");
  const chargeId = readId(formData.get("chargeId"), "The charge");
  const now = new Date();
  const form = parseManualPaymentForm(formData, now);
  if (!form.ok) redirect(staffChargeNoticeHref(businessId, form.problem));

  const outcome = await markClientChargePaid({ businessId, chargeId, staffUserId: user.id, details: form.details }, now);
  await recordStaffAction(staff, { businessId, kind: "charge.marked_paid", summary: "Marked a charge paid", data: { chargeId, result: outcome } });
  revalidateClient(businessId);
  switch (outcome) {
    case "paid":
      redirect(staffChargeNoticeHref(businessId, "paid"));
    case "not-open":
    case "not-found":
      redirect(staffChargeNoticeHref(businessId, "not-open"));
    case "amount-mismatch":
    case "upgrade-not-applied":
    case "add-on-not-applied":
      redirect(staffChargeNoticeHref(businessId, "payment-kept"));
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled charge payment outcome: ${String(unhandled)}`);
    }
  }
}

/** Waives one of the client's open charges: it leaves their To pay list and is never charged. */
export async function waiveChargeAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The charge's business");
  const chargeId = readId(formData.get("chargeId"), "The charge");
  const waived = await waiveClientCharge({ businessId, chargeId, staffUserId: user.id }, new Date());
  await recordStaffAction(staff, { businessId, kind: "charge.waived", summary: "Waived a charge", data: { chargeId, result: waived ? "waived" : "not-open" } });
  revalidateClient(businessId);
  redirect(staffChargeNoticeHref(businessId, waived ? "waived" : "not-open"));
}

/** Marks a flagged payment as dealt with. */
export async function resolvePaymentAttentionAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The flagged payment's business");
  const paymentId = readId(formData.get("paymentId"), "The flagged payment");

  const resolved = await resolveFlaggedPayment({ paymentId, businessId, staffUserId: user.id }, new Date());
  await recordStaffAction(staff, { businessId, kind: "payment.attention_resolved", summary: "Marked a flagged payment sorted", data: { paymentId, result: resolved ? "resolved" : "unchanged" } });
  revalidateClient(businessId);
  redirect(manualPaymentNoticeHref(businessId, resolved ? "attention-resolved" : "attention-unchanged"));
}

/** Sends a client the link to their preview build, by email and on their own dashboard. */
export async function sendPreviewAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "Send a preview's business");

  const parsedUrl = previewUrlSchema.safeParse(formData.get("previewUrl"));
  if (!parsedUrl.success) redirect(projectPreviewNoticeHref(businessId, "invalid-url"));

  let notified: OwnerNotification;
  try {
    notified = await sendProjectPreview(getStaffDb(), { businessId, previewUrl: parsedUrl.data, staffId: user.id }, new Date());
  } catch (error) {
    if (error instanceof ProjectNotReadyForPreviewError) redirect(projectPreviewNoticeHref(businessId, "not-ready"));
    if (error instanceof ProjectPreviewRecipientMissingError) redirect(projectPreviewNoticeHref(businessId, "no-owner"));
    throw error;
  }

  await recordStaffAction(staff, { businessId, kind: "project.preview_sent", summary: "Sent the preview", data: { previewUrl: parsedUrl.data, notified } });
  revalidateClient(businessId);
  redirect(projectPreviewNoticeHref(businessId, notified === "emailed" ? "sent" : "sent-no-email"));
}

/** Marks a business live once its build is approved and actually deployed to its real address. */
export async function markLiveAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "Mark live's business");

  let notified: OwnerNotification;
  try {
    notified = await launchProject(getStaffDb(), { businessId }, new Date());
  } catch (error) {
    if (error instanceof ProjectNotApprovedError) redirect(projectLaunchNoticeHref(businessId, "not-approved"));
    if (error instanceof ProjectLaunchRecipientMissingError) redirect(projectLaunchNoticeHref(businessId, "no-owner"));
    if (error instanceof ProjectLaunchDomainMissingError) redirect(projectLaunchNoticeHref(businessId, "no-domain"));
    throw error;
  }

  await recordStaffAction(staff, { businessId, kind: "project.marked_live", summary: "Marked the website live", data: { notified } });
  revalidateClient(businessId);
  redirect(projectLaunchNoticeHref(businessId, notified === "emailed" ? "launched" : "launched-no-email"));
}

/**
 * Issues this business's website a fresh blog API token, replacing any existing one.
 *
 * Deliberately has no "show me the current token" counterpart that hides it: the token grants read access to
 * already-public posts only, so staff can see it on the page and paste it into the client's site project.
 */
export async function rotateSiteApiTokenAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "Rotate a site token's business");

  await rotateSiteApiToken(businessId);
  await recordStaffAction(staff, { businessId, kind: "website.token_rotated", summary: "Replaced the site API token" });
  revalidateClient(businessId);
}

/** Sets or clears where the client's own website lives, which turns their "Preview on my website" button on or off. */
export async function setWebsiteUrlAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The website address's business");
  const raw = formData.get("websiteUrl");

  try {
    await setBusinessWebsiteUrl(getStaffDb(), businessId, typeof raw === "string" ? raw : null);
  } catch (error) {
    if (error instanceof InvalidWebsiteUrlError) redirect(`/clients/${businessId}?website=invalid`);
    throw error;
  }

  await recordStaffAction(staff, { businessId, kind: "website.url_saved", summary: "Saved the website address", data: { websiteUrl: typeof raw === "string" && raw !== "" ? raw : null } });
  revalidateClient(businessId);
  redirect(`/clients/${businessId}?website=saved`);
}

/** Saves which Vercel project the client's website runs on, so the hourly sync can pause it if their plan lapses. */
export async function saveWebsiteHostingAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The hosting's business");
  const hosting = parseHostingForm(formData.get("vercelProjectId"), formData.get("vercelTeamId"));
  if (!hosting.success) redirect(`/clients/${businessId}?hosting=invalid`);

  await saveWebsiteHosting(getStaffDb(), { businessId, vercelProjectId: hosting.vercelProjectId, vercelTeamId: hosting.vercelTeamId });
  await recordStaffAction(staff, {
    businessId,
    kind: "website.hosting_saved",
    summary: "Saved the hosting project",
    data: { vercelProjectId: hosting.vercelProjectId, vercelTeamId: hosting.vercelTeamId },
  });
  revalidateClient(businessId);
  redirect(`/clients/${businessId}?hosting=saved`);
}

/**
 * Sets or clears a business's IANA time zone. Empty clears it, but only when no module is on: appointments (and
 * every module after it) depends on the zone being set, so clearing it out from under an enabled module would
 * leave the business's dashboard and booking form reading dates in an undefined zone. `setBusinessTimeZone`
 * enforces that itself now -- locking the business row before checking, inside the same transaction that clears
 * it -- so there's no separate check-then-clear here for a concurrent module toggle to race. Anything else must
 * resolve through `canonicalTimeZone` first, since switching a module on and dates such as closures all depend on
 * it being unambiguous.
 */
export async function setTimeZoneAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The time zone's business");
  const raw = formData.get("timeZone");
  const value = typeof raw === "string" ? raw.trim() : "";
  const db = getStaffDb();

  if (value === "") {
    try {
      await setBusinessTimeZone(db, businessId, null);
    } catch (error) {
      if (error instanceof TimeZoneInUseError) redirect(businessModuleNoticeHref(businessId, "zone-in-use"));
      throw error;
    }
    await recordStaffAction(staff, { businessId, kind: "features.time_zone_cleared", summary: "Cleared the time zone" });
    revalidateClient(businessId);
    redirect(businessModuleNoticeHref(businessId, "zone-cleared"));
  }

  const canonical = canonicalTimeZone(value);
  if (canonical === null) redirect(businessModuleNoticeHref(businessId, "bad-zone"));

  await setBusinessTimeZone(db, businessId, canonical);
  await recordStaffAction(staff, { businessId, kind: "features.time_zone_saved", summary: `Set the time zone to ${canonical}` });
  revalidateClient(businessId);
  redirect(businessModuleNoticeHref(businessId, "zone-saved"));
}

/**
 * Switches one business module on or off. Turning it off requires the confirmation checkbox, since it stops the
 * business's booking form taking requests. Turning it on needs a time zone set first; `setBusinessModule` enforces
 * that and this maps its error to a notice rather than crashing the page.
 */
export async function setModuleAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The module's business");

  const moduleRaw = formData.get("module");
  if (typeof moduleRaw !== "string" || !isBusinessModule(moduleRaw)) {
    throw new Error("setModuleAction requires a valid module.");
  }

  const enabledRaw = formData.get("enabled");
  if (enabledRaw !== "on" && enabledRaw !== "off") {
    throw new Error('setModuleAction requires "enabled" to be "on" or "off".');
  }
  const enabled = enabledRaw === "on";

  if (!enabled && formData.get("confirmOff") !== "yes") {
    redirect(businessModuleNoticeHref(businessId, "confirm-off"));
  }

  // Appointments and patient records are out of scope for Brandbasket for now (owner, 2026-10-19): nothing switches them on.
  if (enabled) redirect(businessModuleNoticeHref(businessId, "module-not-offered"));

  try {
    await setBusinessModule(getStaffDb(), { businessId, module: moduleRaw, enabled, staffUserId: user.id, now: new Date() });
  } catch (error) {
    if (error instanceof ModuleNeedsTimeZoneError) redirect(businessModuleNoticeHref(businessId, "needs-zone"));
    throw error;
  }

  await recordStaffAction(staff, { businessId, kind: "features.module_changed", summary: `Switched ${moduleRaw} ${enabled ? "on" : "off"}` });
  revalidateClient(businessId);
  redirect(businessModuleNoticeHref(businessId, enabled ? "module-on" : "module-off"));
}

/**
 * Creates or changes where the client's listing sits on the local directory. The first save also creates the client's
 * empty content row, which is what shows them the Listing tab, and makes the listing a directory business: the one
 * staff named for it to take over, or a new one. Its web address is fixed from then on; moving the listing keeps it,
 * and keeps the old listing address as a redirect.
 */
export async function saveListingPlacementAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The listing's business");

  // A business to take over may be named by its page as it is now, /in/mh/business/<name>/<code>: read as its id.
  const takeOver = formData.get("takeOverPlaceId");
  if (typeof takeOver === "string") formData.set("takeOverPlaceId", await placeIdForAddress(takeOver));
  const parsed = parsePlacementForm(formData);
  if (!parsed.success) {
    const field = encodeURIComponent(parsed.field ?? "form");
    redirect(`/clients/${businessId}?listing=invalid&listingField=${field}#listing`);
  }

  try {
    await saveListingPlacement(getStaffDb(), businessId, parsed.data, new Date());
  } catch (error) {
    if (error instanceof ListingAddressTakenError) redirect(`/clients/${businessId}?listing=taken#listing`);
    if (error instanceof ListingPlaceTakenError) {
      redirect(`/clients/${businessId}?listing=${error.reason === "added" ? "place-added" : "place-taken"}#listing`);
    }
    if (error instanceof ListingPlaceFixedError) redirect(`/clients/${businessId}?listing=place-fixed#listing`);
    if (error instanceof PlaceRegistryNotImportedError) redirect(`/clients/${businessId}?listing=no-places#listing`);
    if (error instanceof UnknownPlaceError) redirect(`/clients/${businessId}?listing=invalid&listingField=takeOverPlaceId#listing`);
    throw error;
  }

  await recordStaffAction(staff, { businessId, kind: "listing.placement_saved", summary: "Saved the listing placement" });
  revalidateClient(businessId);
  redirect(`/clients/${businessId}?listing=saved#listing`);
}

/**
 * The client's listing key and the name its tags are made under, or a redirect back with "no listing" when it has no
 * listing yet. Read on the server from the business id, never taken from the form.
 */
async function clientTagTarget(businessId: string): Promise<{ readonly listingKey: string; readonly businessName: string }> {
  const db = getStaffDb();
  const [placement, client] = await Promise.all([findListingPlacement(db, businessId), findClientDetail(db, businessId)]);
  if (placement === null || client === null) redirect(clientTagsHref(businessId, "no_listing"));
  return { listingKey: clientListingKey(placement), businessName: client.profile?.displayName ?? client.businessName };
}

/**
 * Gives the client's listing the Verified tag directly, for a client that is not shown as verified on its own (an unpaid
 * one). It shows no number of its own: the website uses the client's own.
 */
export async function giveClientVerifiedAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The tags' business");
  const target = await clientTagTarget(businessId);
  const { replaced } = await upsertDirectoryVerification(getStaffDb(), {
    ...target,
    phone: null,
    staffUserId: user.id,
    now: new Date(),
  });
  await recordStaffAction(staff, { businessId, kind: "listing.verified", summary: "Gave the listing the Verified tag", data: { result: replaced ? "unchanged" : "verified" } });
  revalidateClient(businessId);
  revalidatePath("/directory");
  redirect(clientTagsHref(businessId, replaced ? "unchanged" : "verified"));
}

/** Gives the client's listing the Trusted tag directly, verifying it first when it is not verified yet. */
export async function giveClientTrustedAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The tags' business");
  const target = await clientTagTarget(businessId);
  const changed = await trustDirectoryBusiness(getStaffDb(), { ...target, phone: null, staffUserId: user.id, now: new Date() });
  await recordStaffAction(staff, { businessId, kind: "listing.trusted", summary: "Gave the listing the Trusted tag", data: { result: changed ? "trusted" : "unchanged" } });
  revalidateClient(businessId);
  revalidatePath("/directory");
  redirect(clientTagsHref(businessId, changed ? "trusted" : "unchanged"));
}

/** Takes the Trusted tag away from the client's listing. It stays verified. */
export async function removeClientTrustedAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The tags' business");
  const { listingKey } = await clientTagTarget(businessId);
  const changed = await setDirectoryTrusted(getStaffDb(), listingKey, false, new Date());
  await recordStaffAction(staff, { businessId, kind: "listing.untrusted", summary: "Took the Trusted tag away", data: { result: changed ? "untrusted" : "unchanged" } });
  revalidateClient(businessId);
  revalidatePath("/directory");
  redirect(clientTagsHref(businessId, changed ? "untrusted" : "unchanged"));
}

/**
 * Changes a live business's web address (/in/mh/<city>/business/<name>/<id>): its name part and city, with the reason
 * kept in the audit trail. Its id stays, so its reviews and counts stay, and the old address redirects to the new one.
 * Posted from the client page's Listing section and from a claim on the Ads page, both of which name the business the
 * page is about (`businessId`) and the place (`placeId`).
 */
export async function changeWebAddressAction(_previous: WebAddressFormState, formData: FormData): Promise<WebAddressFormState> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The web address's business");
  const outcome = await changeWebAddress({ formData, staffUserId: user.id, now: new Date() });
  if (outcome.status === "changed") {
    await recordStaffAction(staff, { businessId, kind: "listing.web_address_changed", summary: "Changed the listing's web address" });
    revalidateClient(businessId);
    revalidatePath("/ads");
  }
  return outcome;
}

/**
 * Pauses or cancels an add-on for the customer. The staff member must tick that they have told the customer, and who did it
 * is recorded on the row. It takes effect at the next billing date, exactly as the customer's own button does (one shared
 * function does both), so nothing here works out a date.
 */
export async function endAddOnAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The add-on's business");
  const addOnSubscriptionId = readId(formData.get("addOnSubscriptionId"), "The add-on");
  const kind = endKindSchema.parse(formData.get("kind"));
  if (formData.get("confirm") !== "yes") redirect(addOnNoticeHref(businessId, "unconfirmed"));

  const outcome = await endClientAddOn({ businessId, addOnSubscriptionId, kind, staffUserId: user.id }, new Date());
  const notice = noticeForEndOutcome(outcome);
  await recordStaffAction(staff, { businessId, kind: "add_on.ended", summary: `Asked to ${kind} an add-on`, data: { addOnSubscriptionId, result: notice } });
  revalidateClient(businessId);
  redirect(addOnNoticeHref(businessId, notice));
}

const monthlyAddOnSchema = z.enum(MONTHLY_ADD_ON_IDS);

/**
 * Adds an add-on for the client (a charge for the rest of the month, which they pay from Billing) or keeps one that is
 * ending, after staff confirm they have told the customer. The price is worked out on the server, as for the customer.
 */
export async function addClientAddOnAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The add-on's business");
  const addOn = monthlyAddOnSchema.parse(formData.get("addOn"));
  if (formData.get("confirm") !== "yes") redirect(addOnNoticeHref(businessId, "unconfirmed"));

  const started = await addClientAddOn({ businessId, addOn, staffUserId: user.id }, new Date());
  const notice = noticeForStart(started);
  await recordStaffAction(staff, { businessId, kind: "add_on.added", summary: `Added ${addOnById(addOn).title}`, data: { addOn, result: notice } });
  revalidateClient(businessId);
  redirect(addOnNoticeHref(businessId, notice));
}

/** Takes an add-on out of the client's plan payment from the next billing date, after staff confirm they told the customer. */
export async function removeClientAddOnAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const businessId = readId(formData.get("businessId"), "The add-on's business");
  const addOn = monthlyAddOnSchema.parse(formData.get("addOn"));
  if (formData.get("confirm") !== "yes") redirect(addOnNoticeHref(businessId, "unconfirmed"));

  const removal = await removeClientAddOn({ businessId, addOn }, new Date());
  const notice = noticeForRemoval(removal);
  await recordStaffAction(staff, { businessId, kind: "add_on.removed", summary: `Removed ${addOnById(addOn).title} from the plan`, data: { addOn, result: notice } });
  revalidateClient(businessId);
  redirect(addOnNoticeHref(businessId, notice));
}

/** Tells the payment provider again to bill an added add-on from the next renewal. Safe to repeat. */
export async function retryAddOnProviderAction(formData: FormData): Promise<void> {
  const staff = await requireStaffCan("money");
  const businessId = readId(formData.get("businessId"), "The add-on's business");
  const bundledAddOnId = readId(formData.get("bundledAddOnId"), "The add-on");

  const move = await retryClientAddOnProvider({ businessId, bundledAddOnId }, new Date());
  await recordStaffAction(staff, { businessId, kind: "add_on.provider_retried", summary: "Asked the payment provider again to bill an add-on", data: { bundledAddOnId, result: move.kind } });
  revalidateClient(businessId);
  redirect(addOnNoticeHref(businessId, move.kind === "scheduled" ? "provider-told" : move.kind === "failed" ? "provider-still-refusing" : "not-found"));
}

/** Records that the team has been in touch about a new purchase, which takes it off the Journey. Safe to repeat. */
export async function markAddOnContactedAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The purchase's business");
  const addOnSubscriptionId = readId(formData.get("addOnSubscriptionId"), "The purchase");

  const outcome = await markClientAddOnContacted({ businessId, addOnSubscriptionId, staffUserId: user.id }, new Date());
  await recordStaffAction(staff, { businessId, kind: "add_on.contacted", summary: "Marked an add-on purchase as contacted", data: { addOnSubscriptionId, result: outcome } });
  revalidateClient(businessId);
  const notice: AddOnNotice = outcome === "marked" ? "contacted" : outcome === "already" ? "already-contacted" : "not-found";
  redirect(addOnNoticeHref(businessId, notice));
}

/** Records that the team has been in touch about an add-on taken with the plan. Safe to repeat. */
export async function markBundledAddOnContactedAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The purchase's business");
  const bundledAddOnId = readId(formData.get("bundledAddOnId"), "The purchase");

  const outcome = await markClientBundledAddOnContacted({ businessId, bundledAddOnId, staffUserId: user.id }, new Date());
  await recordStaffAction(staff, { businessId, kind: "add_on.contacted", summary: "Marked an add-on as contacted", data: { bundledAddOnId, result: outcome } });
  revalidateClient(businessId);
  const notice: AddOnNotice = outcome === "marked" ? "contacted" : outcome === "already" ? "already-contacted" : "not-found";
  redirect(addOnNoticeHref(businessId, notice));
}

/** Moves a press release to in progress or published. It never moves one backward, so a stale form changes nothing. */
export async function setPressReleaseStatusAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const { user } = staff;
  const businessId = readId(formData.get("businessId"), "The press release's business");
  const pressReleaseId = readId(formData.get("pressReleaseId"), "The press release");
  const status = pressReleaseStepSchema.parse(formData.get("status"));

  const outcome = await setClientPressReleaseStatus({ businessId, pressReleaseId, status, staffUserId: user.id }, new Date());
  await recordStaffAction(staff, { businessId, kind: "press_release.status_set", summary: `Moved a press release to ${status === "published" ? "published" : "in progress"}`, data: { pressReleaseId, result: outcome } });
  revalidateClient(businessId);
  const notice: AddOnNotice =
    outcome === "changed" ? (status === "published" ? "release-published" : "release-in-progress") : outcome === "unchanged" ? "release-unchanged" : "not-found";
  redirect(addOnNoticeHref(businessId, notice));
}

/**
 * Staff have added the customer's own domain to the website's host: asks the customer to connect it. A free address has no
 * DNS for them to change, so it is refused here; the database checks the project is approved and there is a domain.
 */
export async function markDomainReadyAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "Ready for DNS's business");
  const db = getStaffDb();

  // A free address has no DNS to change. A live customer moving off one does: their requested domain is what gets connected.
  const client = await findClientDetail(db, businessId);
  if (client?.movingTo == null && client?.domain != null && isTemporarySubdomain(client.domain.hostname)) {
    redirect(domainConnectNoticeHref(businessId, "free-address"));
  }

  let outcome: DomainReadyOutcome;
  try {
    outcome = await markDomainReady(db, { businessId });
  } catch (error) {
    if (error instanceof DomainNotReadyForDnsError) redirect(domainConnectNoticeHref(businessId, "not-ready"));
    if (error instanceof DomainReadyRecipientMissingError) redirect(domainConnectNoticeHref(businessId, "no-owner"));
    throw error;
  }

  await recordStaffAction(staff, { businessId, kind: "domain.ready_for_dns", summary: "Asked the customer to connect their domain", data: { result: outcome } });
  revalidateClient(businessId);
  redirect(domainConnectNoticeHref(businessId, outcome === "emailed" ? "ready" : outcome === "no-email" ? "ready-no-email" : "already"));
}

/** Staff move a live customer's website to the domain they connected: their own domain becomes the main address and they are emailed. */
export async function switchDomainAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "Switch domain's business");

  let notified: OwnerNotification;
  try {
    notified = await switchDomain(getStaffDb(), { businessId });
  } catch (error) {
    if (error instanceof DomainSwitchNotReadyError) redirect(domainConnectNoticeHref(businessId, "switch-not-ready"));
    if (error instanceof DomainSwitchRecipientMissingError) redirect(domainConnectNoticeHref(businessId, "no-owner"));
    throw error;
  }

  await recordStaffAction(staff, { businessId, kind: "domain.switched", summary: "Switched the website to the customer's domain", data: { notified } });
  revalidateClient(businessId);
  redirect(domainConnectNoticeHref(businessId, notified === "emailed" ? "switched" : "switched-no-email"));
}

/**
 * Registers a chatbot OyeChats runs for the client, with the webhook secret OyeChats made for it. The business comes from
 * the form's hidden id, checked as a UUID; the secret is stored for the webhook to check signatures against and is never shown again.
 */
export async function addChatbotAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The chatbot's business");
  const parsed = parseChatbotForm(formData);
  if (!parsed.ok) redirect(chatbotNoticeHref(businessId, parsed.notice));

  const outcome = await addClientChatbot(businessId, parsed.bot);
  await recordStaffAction(staff, { businessId, kind: "chatbot.added", summary: "Added a chatbot", data: { result: outcome } });
  revalidateClient(businessId);
  redirect(chatbotNoticeHref(businessId, outcome));
}

/** Sets where a chatbot stands, which the customer reads on their Chatbot page. */
export async function setChatbotStatusAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The chatbot's business");
  const chatbotId = readId(formData.get("chatbotId"), "The chatbot");
  const status = readChatbotStatus(formData.get("status"));
  if (status === null) redirect(chatbotNoticeHref(businessId, "invalid-status"));

  const changed = await setClientChatbotStatus(businessId, chatbotId, status);
  await recordStaffAction(staff, { businessId, kind: "chatbot.status_set", summary: `Set a chatbot to ${status}`, data: { chatbotId, result: changed ? "status-saved" : "not-found" } });
  revalidateClient(businessId);
  redirect(chatbotNoticeHref(businessId, changed ? "status-saved" : "not-found"));
}

/**
 * Saves, replaces or removes the key of the OyeChats operator bound to a chatbot, which the dashboard uses to show the
 * customer a lead's conversation. Like the webhook secret it is stored and never shown again.
 */
export async function setChatbotOperatorKeyAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The chatbot's business");
  const chatbotId = readId(formData.get("chatbotId"), "The chatbot");
  const change = parseOperatorKeyForm(formData);
  if (!change.ok) redirect(chatbotNoticeHref(businessId, change.notice));

  const saved = await setClientChatbotOperatorKey(businessId, chatbotId, change.operatorKey);
  await recordStaffAction(staff, {
    businessId,
    kind: "chatbot.operator_key_set",
    summary: change.operatorKey === null ? "Removed a chatbot's operator key" : "Saved a chatbot's operator key",
    data: { chatbotId, result: saved ? "saved" : "not-found" },
  });
  revalidateClient(businessId);
  redirect(chatbotNoticeHref(businessId, saved ? (change.operatorKey === null ? "key-cleared" : "key-saved") : "not-found"));
}

/** Removes a chatbot with its leads and its secret, after the staff member ticks that they mean it. */
export async function removeChatbotAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAccess();
  const businessId = readId(formData.get("businessId"), "The chatbot's business");
  const chatbotId = readId(formData.get("chatbotId"), "The chatbot");
  if (formData.get("confirm") !== "yes") redirect(chatbotNoticeHref(businessId, "unconfirmed"));

  const removed = await removeClientChatbot(businessId, chatbotId);
  await recordStaffAction(staff, { businessId, kind: "chatbot.removed", summary: "Removed a chatbot", data: { chatbotId, result: removed ? "removed" : "not-found" } });
  revalidateClient(businessId);
  redirect(chatbotNoticeHref(businessId, removed ? "removed" : "not-found"));
}
