"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import {
  addClosure,
  clearAnnouncement,
  deleteClosure,
  findBusinessTimeZone,
  replaceOpeningHours,
  saveAnnouncement,
  saveBusinessContact,
  withTenantScope,
} from "@brandbasket/db";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAppDb } from "@/lib/db";
import { parseForm } from "@/lib/form";
import { requirePaid, requireWebsite, type CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { removeBrandImage } from "./brand-media";
import { contactSchema } from "./contact-form";
import {
  announcementSchema,
  CLOSURE_NOT_FOUND_MESSAGE,
  CLOSURE_PAST_MESSAGE,
  closureEnded,
  closureSchema,
  hoursSchema,
  RELOAD_MESSAGE,
  REMOVE_FAILED_MESSAGE,
  SAVE_FAILED_MESSAGE,
  toStoredHours,
  VIEWER_MESSAGE,
} from "./rules";

const BUSINESS_PATH = "/business";
const BRAND_PATH = "/business/brand";

/** The database refuses a viewer's writes; this says so in words before it gets that far. */
function viewerRefused(customer: CustomerContext): ActionResult | null {
  return customer.role === "viewer" ? actionFail(VIEWER_MESSAGE) : null;
}

/** Runs one write on the tenant's scope. Next's own control flow is rethrown; any other failure is reported and answered in words. */
async function write(area: string, failure: string, work: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await work()) ?? actionOk();
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area });
    return actionFail(failure);
  }
}

/**
 * Saves the business's contact details: name, phone, email, address and the areas it serves. They are the customer's own
 * facts, so any paying customer may keep them current, on any plan (the old billing.hasAccess), while a paid period runs.
 * The business comes from the session. Every field is written, so a blank clears it.
 */
export async function saveContactAction(formData: FormData): Promise<ActionResult> {
  const customer = await requirePaid({ write: true });
  const refused = viewerRefused(customer);
  if (refused !== null) return refused;
  const parsed = parseForm(contactSchema, formData);
  if (!parsed.ok) return parsed;
  return write("business.contact.save", SAVE_FAILED_MESSAGE, async () => {
    await withTenantScope(getAppDb(), customer.tenant, (tx) => saveBusinessContact(tx, parsed.data));
    revalidatePath(BUSINESS_PATH);
  });
}

/**
 * Saves the week's opening hours, replacing the stored week (delete then insert under an advisory lock inside
 * replaceOpeningHours). The website reads them through `/api/site/info`.
 */
export async function saveHoursAction(formData: FormData): Promise<ActionResult> {
  const customer = await requireWebsite({ write: true });
  const refused = viewerRefused(customer);
  if (refused !== null) return refused;
  const parsed = parseForm(hoursSchema, formData);
  if (!parsed.ok) return parsed;
  return write("business.hours.save", SAVE_FAILED_MESSAGE, async () => {
    await withTenantScope(getAppDb(), customer.tenant, (tx) => replaceOpeningHours(tx, parsed.data.map(toStoredHours)));
    revalidatePath(BUSINESS_PATH);
  });
}

/** Creates or replaces the business's one announcement banner. */
export async function saveAnnouncementAction(formData: FormData): Promise<ActionResult> {
  const customer = await requireWebsite({ write: true });
  const refused = viewerRefused(customer);
  if (refused !== null) return refused;
  const parsed = parseForm(announcementSchema, formData);
  if (!parsed.ok) return parsed;
  return write("business.announcement.save", SAVE_FAILED_MESSAGE, async () => {
    await withTenantScope(getAppDb(), customer.tenant, (tx) => saveAnnouncement(tx, parsed.data, new Date()));
    revalidatePath(BUSINESS_PATH);
  });
}

/** Takes the announcement down. Reads nothing from the form: there is nothing to validate for a removal. */
export async function clearAnnouncementAction(): Promise<ActionResult> {
  const customer = await requireWebsite({ write: true });
  const refused = viewerRefused(customer);
  if (refused !== null) return refused;
  return write("business.announcement.clear", REMOVE_FAILED_MESSAGE, async () => {
    await withTenantScope(getAppDb(), customer.tenant, (tx) => clearAnnouncement(tx));
    revalidatePath(BUSINESS_PATH);
  });
}

/** Thrown inside the add transaction when the closure's last day has already passed in the business's own time zone. */
class ClosureInPastError extends Error {}

/**
 * Adds one holiday. A closure whose last day has already passed is refused, judged in the business's own time zone and read in
 * the same transaction as the write so the two never disagree about "today". The old clinic-only booking-clash list is not
 * carried over: the Appointments pages it served no longer exist.
 */
export async function addClosureAction(formData: FormData): Promise<ActionResult> {
  const customer = await requireWebsite({ write: true });
  const refused = viewerRefused(customer);
  if (refused !== null) return refused;
  const parsed = parseForm(closureSchema, formData);
  if (!parsed.ok) return parsed;
  try {
    await withTenantScope(getAppDb(), customer.tenant, async (tx) => {
      const timeZone = await findBusinessTimeZone(tx, customer.businessId);
      if (closureEnded(parsed.data, localDateIn(timeZone ?? "UTC", new Date()))) throw new ClosureInPastError();
      await addClosure(tx, parsed.data);
    });
  } catch (error) {
    if (error instanceof ClosureInPastError) return actionFail(CLOSURE_PAST_MESSAGE, { endsOn: CLOSURE_PAST_MESSAGE });
    unstable_rethrow(error);
    reportError(error, { area: "business.closure.add" });
    return actionFail(SAVE_FAILED_MESSAGE);
  }
  revalidatePath(BUSINESS_PATH);
  return actionOk();
}

const closureIdSchema = z.uuid();

/**
 * Removes one holiday. The id is checked as a UUID here and again against the tenant's own rows inside deleteClosure, which
 * returns false rather than touching another business's row. A holiday already gone (another tab removed it first) still
 * revalidates the page so the list catches up; a malformed id never reached the database.
 */
export async function deleteClosureAction(closureId: string): Promise<ActionResult> {
  const customer = await requireWebsite({ write: true });
  const refused = viewerRefused(customer);
  if (refused !== null) return refused;
  const id = closureIdSchema.safeParse(closureId);
  if (!id.success) return actionFail(CLOSURE_NOT_FOUND_MESSAGE);
  return write("business.closure.delete", REMOVE_FAILED_MESSAGE, async () => {
    const removed = await withTenantScope(getAppDb(), customer.tenant, (tx) => deleteClosure(tx, id.data));
    revalidatePath(BUSINESS_PATH);
    if (!removed) return actionFail(CLOSURE_NOT_FOUND_MESSAGE);
  });
}

const mediaIdSchema = z.uuid();

/**
 * Removes one logo or photo. Billing's old rule was none at all (any member could); this asks for a paid period like every
 * write. Uploads go to the old app's /api/brand-assets route, which keeps its own checks.
 */
export async function removeBrandAssetAction(mediaId: string): Promise<ActionResult> {
  const customer = await requirePaid({ write: true });
  const refused = viewerRefused(customer);
  if (refused !== null) return refused;
  const id = mediaIdSchema.safeParse(mediaId);
  if (!id.success) return actionFail(RELOAD_MESSAGE);
  return write("business.brand.remove", REMOVE_FAILED_MESSAGE, async () => {
    const result = await removeBrandImage({ appDb: getAppDb(), storage: getMediaStorage() }, customer.tenant, id.data);
    revalidatePath(BRAND_PATH);
    if (!result.ok) return actionFail(result.message);
  });
}
