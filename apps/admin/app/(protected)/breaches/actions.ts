"use server";

import { listBreaches, logBreach, updateBreach } from "@fynix/db";
import { redirect } from "next/navigation";
import { parseBreachForm, parseBreachProgress } from "@/lib/breach-form";
import { getStaffDb } from "@/lib/server/db";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";

const BREACHES_PATH = "/breaches";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adds a breach to the register. Admins only; the entry is also in the access log. */
export async function logBreachAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("oversight");
  const parsed = parseBreachForm(formData, new Date());
  if (!parsed.ok) redirect(`${BREACHES_PATH}?problem=${encodeURIComponent(parsed.message)}`);
  const id = await logBreach(getStaffDb(), { ...parsed.input, recordedBy: user.id });
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "breach.log", targetType: "breach", targetId: id });
  redirect(BREACHES_PATH);
}

/**
 * Records a report made, or a new status, on one breach. The time of a report is the moment the button is pressed, so press it
 * when the report goes; a date already set is kept (see updateBreach). An id that is not in the register changes nothing.
 */
export async function updateBreachAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffCan("oversight");
  const id = formData.get("id");
  const parsed = parseBreachProgress(formData, new Date());
  if (typeof id !== "string" || !UUID.test(id) || !parsed.ok) redirect(BREACHES_PATH);
  const known = (await listBreaches(getStaffDb())).some((breach) => breach.id === id);
  if (!known) redirect(BREACHES_PATH);
  await updateBreach(getStaffDb(), id, parsed.progress);
  await logStaffAccessOrThrow({ staffUserId: user.id, action: "breach.update", targetType: "breach", targetId: id, detail: String(formData.get("do")).slice(0, 20) });
  redirect(BREACHES_PATH);
}
