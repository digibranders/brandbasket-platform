"use server";

import { closePrivacyRequest, listPrivacyRequests, logPrivacyRequest, updatePrivacyRequest } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { parsePrivacyRequestClose, parsePrivacyRequestForm, parsePrivacyRequestProgress } from "@/lib/privacy-request-form";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

const REQUESTS_PATH = "/privacy-requests";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function problemUrl(message: string): string {
  return `${REQUESTS_PATH}?problem=${encodeURIComponent(message)}`;
}

/** The id a form sent, when it is a real request in the tracker; anything else changes nothing. */
async function knownRequestId(formData: FormData): Promise<string | null> {
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const known = (await listPrivacyRequests(getStaffDb())).some((request) => request.id === id);
  return known ? id : null;
}

/** Adds a request that came by email or a call. Admins only; the entry is also in the access log. */
export async function logPrivacyRequestAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("oversight");
  const parsed = parsePrivacyRequestForm(formData, new Date());
  if (!parsed.ok) redirect(problemUrl(parsed.message));
  const { id } = await logPrivacyRequest(getStaffDb(), parsed.input);
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "privacy_request.log", targetType: "privacy_request", targetId: id, detail: parsed.input.kind });
  redirect(REQUESTS_PATH);
}

/** Moves an open request on: taking it, checking the person's identity, or starting the work. A closed request is left as it is. */
export async function updatePrivacyRequestAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("oversight");
  const id = await knownRequestId(formData);
  const parsed = parsePrivacyRequestProgress(formData, new Date(), user.id);
  if (id === null || !parsed.ok) redirect(REQUESTS_PATH);
  const changed = await updatePrivacyRequest(getStaffDb(), id, parsed.progress);
  if (changed) {
    await logStaffAccessOrThrow({ staffUserId: user.id, action: "privacy_request.update", targetType: "privacy_request", targetId: id, detail: String(formData.get("do")).slice(0, 20) });
  }
  redirect(REQUESTS_PATH);
}

/** Closes a request with how it ended and what was done. The time it was closed is the moment the button is pressed. */
export async function closePrivacyRequestAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("oversight");
  const id = await knownRequestId(formData);
  if (id === null) redirect(REQUESTS_PATH);
  const parsed = parsePrivacyRequestClose(formData);
  if (!parsed.ok) redirect(problemUrl(parsed.message));
  const closed = await closePrivacyRequest(getStaffDb(), id, { ...parsed.input, closedAt: new Date(), closedBy: user.id });
  if (closed) {
    await logStaffAccessOrThrow({ staffUserId: user.id, action: "privacy_request.close", targetType: "privacy_request", targetId: id, detail: parsed.input.outcome });
  }
  redirect(REQUESTS_PATH);
}
