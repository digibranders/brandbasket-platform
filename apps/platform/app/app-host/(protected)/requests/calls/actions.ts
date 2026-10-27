"use server";

import { isPhoneAccountEmail } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readBookCall } from "@/lib/calls/form";
import { CALLS_PATH } from "@/lib/calls/links";
import { REQUESTS_PATH } from "@/lib/requests/links";
import { kindOptions } from "@/lib/requests/form";
import { bookTeamCall, callsAreOpen, cancelTeamCallFor } from "@/lib/server/calls";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSetupServices } from "@/lib/server/first-look";

/** What the Book a call sheet is told. `invalid` carries a sentence the sheet shows as it is. */
export type BookCallActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "taken" | "failed" | "limit" }
  | { readonly ok: false; readonly reason: "invalid"; readonly message: string };

export type CancelCallActionResult = { readonly ok: true } | { readonly ok: false; readonly reason: "gone" | "failed" };

const bookSchema = z.object({
  startIso: z.string(),
  timeZone: z.string(),
  reason: z.unknown(),
  note: z.unknown().optional(),
  replaceId: z.uuid().nullable().optional(),
});

/** Pages that show a call, refreshed after one is booked or cancelled. */
function refreshCallPages(): void {
  revalidatePath(CALLS_PATH);
  revalidatePath(REQUESTS_PATH);
  revalidatePath("/");
}

/**
 * Books a call for the signed-in customer's own business. Everything comes from the session except the time, the reason and
 * the note; an account with no real email address cannot be sent the invitation, and calls are closed during the first look.
 */
export async function bookCallAction(input: unknown): Promise<BookCallActionResult> {
  const { user, tenant, billing } = await requireCustomerAccess();
  if (isPhoneAccountEmail(user.email) || !(await callsAreOpen(tenant, billing))) return { ok: false, reason: "failed" };
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "failed" };
  const allowed = kindOptions((await loadSetupServices(tenant)) ?? []).map((option) => option.value);
  const read = readBookCall({ reason: parsed.data.reason, note: parsed.data.note }, allowed);
  if (!read.ok) return { ok: false, reason: "invalid", message: read.message };
  const result = await bookTeamCall(
    tenant,
    { name: user.name, email: user.email },
    { startIso: parsed.data.startIso, timeZone: parsed.data.timeZone, reason: read.reason, note: read.note, replaceId: parsed.data.replaceId ?? null },
    new Date(),
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  refreshCallPages();
  return { ok: true };
}

/** Cancels one of the signed-in business's calls that has not started. */
export async function cancelCallAction(callId: unknown): Promise<CancelCallActionResult> {
  const { tenant, billing } = await requireCustomerAccess();
  const id = z.uuid().safeParse(callId);
  if (!id.success || !(await callsAreOpen(tenant, billing))) return { ok: false, reason: "failed" };
  const result = await cancelTeamCallFor(tenant, id.data, new Date());
  // A call that is already gone is shown as gone on the next draw, so the page is refreshed either way.
  if (result.ok || result.reason === "gone") refreshCallPages();
  return result;
}
