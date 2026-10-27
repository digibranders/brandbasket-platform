"use server";

import { randomUUID } from "node:crypto";
import { appendSupportMessageByStaff, ChangeRequestError, getChangeRequestForStaff, moveChangeAsStaff, sendChangeQuote, startChangeWithoutQuote, type StaffMove } from "@brandbasket/db";
import type { ChangeRequestUpdate } from "@brandbasket/email";
import { monthBoundsIst, quoteLine } from "@brandbasket/shared/lib/change-requests";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseDeclineReason, parseQuoteForm } from "@/lib/request-form";
import type { MailOutcome, RequestActionNotice } from "@/lib/request-notices";
import { getStaffDb } from "@/lib/server/db";
import { notifyRequester } from "@/lib/server/request-notify";
import { requestPricing } from "@/lib/server/request-pricing";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const idSchema = z.uuid();

function readId(formData: FormData, name: "businessId" | "requestId"): string {
  const parsed = idSchema.safeParse(formData.get(name));
  if (!parsed.success) throw new Error(`The request form's ${name === "businessId" ? "business" : "request"} must be a valid id.`);
  return parsed.data;
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The request the form names, proved to be one of the business the page is about. */
async function requestOf(businessId: string, requestId: string) {
  const item = await getChangeRequestForStaff(getStaffDb(), requestId);
  if (item === null || item.change.businessId !== businessId) throw new Error("That request does not belong to this business.");
  return item;
}

function finish(businessId: string, notice: RequestActionNotice, mail?: MailOutcome): never {
  revalidatePath(`/clients/${businessId}`);
  revalidatePath("/support");
  redirect(`/clients/${businessId}?requests=${notice}${mail === undefined ? "" : `&mail=${mail}`}#requests`);
}

/** The word the page shows for a refusal from the database functions. Anything else is a fault and is rethrown. */
function refusal(error: unknown): RequestActionNotice {
  if (error instanceof ChangeRequestError) {
    if (error.code === "wrong_state" || error.code === "not_found") return "moved";
    if (error.code === "no_included_left") return "no-included-left";
    if (error.code === "not_website") return "not-website";
    if (error.code === "invalid_input") return "invalid";
  }
  throw error;
}

async function audit(staffUserId: string, action: string, businessId: string, requestId: string): Promise<void> {
  await logStaffAccessOrThrow({ staffUserId, action, targetType: "change_request", targetId: requestId, businessId });
}

/**
 * Sends a quote, or replaces the one sent. The hour's price and the currency come from the customer's plan, never from the
 * form. A note, if written, joins the conversation as a reply and goes in the email. The customer is emailed.
 */
export async function sendQuoteAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const requestId = readId(formData, "requestId");
  const item = await requestOf(businessId, requestId);
  const parsed = parseQuoteForm({ what: readText(formData, "what"), hours: readText(formData, "hours"), workingDays: readText(formData, "workingDays"), note: readText(formData, "note") });
  if (!parsed.success) finish(businessId, "invalid");
  const db = getStaffDb();
  const now = new Date();
  const pricing = await requestPricing(db, businessId, now);
  if (pricing === null) finish(businessId, "no-plan");
  const { what, hours, workingDays, note } = parsed.data;
  let amountCents: number;
  try {
    const view = await sendChangeQuote(db, { requestId, staffId: user.id, what, hours, workingDays, unitCents: pricing.unitCents, currency: pricing.currency, now });
    amountCents = view.quote?.amountCents ?? hours * pricing.unitCents;
  } catch (error) {
    finish(businessId, refusal(error));
  }
  await audit(user.id, "change_request.quote", businessId, requestId);
  if (note !== null) {
    try {
      await appendSupportMessageByStaff(db, { staffUserId: user.id, ticketId: item.ticketId, body: note, visibility: "public", submissionKey: randomUUID() });
    } catch (error) {
      console.error("[requests] could not add the quote's note to the conversation", errorLogInfo(error));
    }
  }
  const update: ChangeRequestUpdate = {
    kind: "quote",
    line: quoteLine({ what, hours, unitCents: pricing.unitCents, currency: pricing.currency }),
    total: formatMoney(amountCents, pricing.currency),
    workingDays,
    note,
  };
  finish(businessId, "quoted", await notifyRequester(db, item.ticketId, update));
}

/** Starts the work with no quote: as one of the month's included edits (website changes), or at no charge. The customer is emailed. */
export async function startWithoutQuoteAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const requestId = readId(formData, "requestId");
  const coverage = readText(formData, "coverage");
  if (coverage !== "included" && coverage !== "free") throw new Error("A request is started as an included edit or at no charge.");
  const item = await requestOf(businessId, requestId);
  const db = getStaffDb();
  const pricing = await requestPricing(db, businessId, new Date());
  try {
    await startChangeWithoutQuote(db, { requestId, staffId: user.id, coverage, windowFor: monthBoundsIst, allowedPerMonth: pricing?.includedAllowed ?? 0 });
  } catch (error) {
    finish(businessId, refusal(error));
  }
  await audit(user.id, `change_request.${coverage}`, businessId, requestId);
  finish(businessId, "started", await notifyRequester(db, item.ticketId, { kind: "started", readyBy: null }));
}

const MOVES: Readonly<Record<StaffMove, RequestActionNotice>> = { preview: "previewed", shipped: "finished", declined: "declined" };

function isStaffMove(value: string): value is StaffMove {
  return Object.hasOwn(MOVES, value);
}

/** Send a started change for checking, mark it done, or decline it with a reason the customer reads. The customer is emailed. */
export async function moveRequestAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const businessId = readId(formData, "businessId");
  const requestId = readId(formData, "requestId");
  const to = readText(formData, "to");
  if (!isStaffMove(to)) throw new Error("A request is sent for checking, marked done or declined.");
  const item = await requestOf(businessId, requestId);
  let reason: string | null = null;
  if (to === "declined") {
    const parsed = parseDeclineReason(readText(formData, "reason"));
    if (!parsed.success) finish(businessId, "invalid");
    reason = parsed.reason;
  }
  const db = getStaffDb();
  try {
    await moveChangeAsStaff(db, { requestId, staffId: user.id, to, ...(reason === null ? {} : { reason }), now: new Date() });
  } catch (error) {
    finish(businessId, refusal(error));
  }
  await audit(user.id, `change_request.${to}`, businessId, requestId);
  const update: ChangeRequestUpdate = to === "preview" ? { kind: "ready" } : to === "shipped" ? { kind: "done" } : { kind: "closed", reason };
  finish(businessId, MOVES[to], await notifyRequester(db, item.ticketId, update));
}
