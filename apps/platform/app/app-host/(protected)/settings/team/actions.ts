"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { panelFormErrorState, panelFormSavedState, type PanelFormState } from "@/lib/panel-form-state";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { inviteMember, removeMember, revokeInvite } from "@/lib/server/team";
import { INVITE_UNKNOWN_MESSAGE, inviteSchema, REMOVE_REFUSED_MESSAGE, TEAM_PATH, type TeamResult } from "@/lib/team/rules";

/*
 * Team management is the owner's alone: requireCustomerAccess sends an editor or a viewer Home before anything runs, and
 * the database refuses anyone else's invite writes as well. The business and the inviter come from the session, never
 * from the form.
 */

/** Invites someone as an editor or a viewer and emails them the link. */
export async function inviteAction(_previous: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const customer = await requireCustomerAccess({ access: "owner" });
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return panelFormErrorState({ message: issue?.message ?? "Check the details and try again.", field: issue?.path[0] === "role" ? "role" : "email" }, formData);
  }
  const result = await inviteMember(customer, parsed.data);
  if (!result.ok) return panelFormErrorState({ message: result.message, field: result.field }, formData);
  revalidatePath(TEAM_PATH);
  return panelFormSavedState;
}

const revokeSchema = z.object({ inviteId: z.uuid() });

/** Takes an invitation back. The invite must belong to the owner's own business. */
export async function revokeInviteAction(inviteId: string): Promise<TeamResult> {
  const customer = await requireCustomerAccess({ access: "owner" });
  const parsed = revokeSchema.safeParse({ inviteId });
  if (!parsed.success) return { ok: false, message: INVITE_UNKNOWN_MESSAGE, field: null };
  const result = await revokeInvite(customer.tenant, parsed.data.inviteId);
  if (result.ok) revalidatePath(TEAM_PATH);
  return result;
}

/** Better Auth's text ids: short, never empty. Anything else names nobody. */
const removeSchema = z.object({ userId: z.string().min(1).max(128) });

/** Takes an editor or a viewer off the team. */
export async function removeMemberAction(userId: string): Promise<TeamResult> {
  const customer = await requireCustomerAccess({ access: "owner" });
  const parsed = removeSchema.safeParse({ userId });
  if (!parsed.success) return { ok: false, message: REMOVE_REFUSED_MESSAGE, field: null };
  const result = await removeMember(customer, parsed.data.userId);
  if (result.ok) revalidatePath(TEAM_PATH);
  return result;
}
