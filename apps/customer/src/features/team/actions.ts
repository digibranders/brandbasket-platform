"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import {
  acceptBusinessInvite,
  BUSINESS_INVITE_DAYS,
  BusinessInviteOpenError,
  consumeRateLimit,
  createBusinessInvite,
  removeBusinessMember,
  revokeBusinessInvite,
  withTenantScope,
  type RateLimitRule,
} from "@brandbasket/db";
import { businessInviteEmail } from "@brandbasket/email";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { customerEmailTransport } from "@/features/server-common/email";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getAppDb, getPublicDb, getStaffDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { parseForm } from "@/lib/form";
import { requireOwner, requireSignedIn } from "@/lib/guards";
import { reportError } from "@/lib/report";
import {
  ALREADY_INVITED_MESSAGE,
  INVITE_SEND_FAILED_MESSAGE,
  inviteSchema,
  invitePath,
  inviteTokenSchema,
  OWN_ADDRESS_MESSAGE,
  refusalMessage,
  REMOVE_REFUSED_MESSAGE,
  REMOVE_SELF_MESSAGE,
  roleLabel,
  TOO_MANY_INVITES_MESSAGE,
} from "./rules";

const TEAM_PATH = "/settings/team";
/** An owner sends a handful of invitations; a loop is not one. */
const INVITES_PER_OWNER: RateLimitRule = { limit: 20, windowSeconds: 60 * 60 };
/** Someone signed in guessing invite links gets a small budget; a real link needs one try. */
const ACCEPTS_PER_USER: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };
const FAILED = "We could not do that. Try again in a moment.";

/*
 * Team management is the owner's alone (requireOwner sends an editor or a viewer Home before anything runs), and the database
 * refuses anyone else's invite writes as well. The business, the inviter and the role of the inviter come from the session,
 * never from the form.
 */

/** Invites someone as an editor or a viewer: stores the invite, then emails the link. If the email cannot be sent the invite is taken back. */
export async function inviteAction(formData: FormData): Promise<ActionResult> {
  const customer = await requireOwner();
  const parsed = parseForm(inviteSchema, formData);
  if (!parsed.ok) return parsed;
  const { email, role } = parsed.data;
  if (email === customer.user.email.trim().toLowerCase()) return actionFail(OWN_ADDRESS_MESSAGE, { email: OWN_ADDRESS_MESSAGE });

  try {
    const budget = await consumeRateLimit(getAppDb(), `business-invite:user:${customer.user.id}`, INVITES_PER_OWNER);
    if (!budget.allowed) return actionFail(TOO_MANY_INVITES_MESSAGE);

    const { token, invite } = await withTenantScope(getAppDb(), customer.tenant, (tx) =>
      createBusinessInvite(tx, { invitedBy: customer.user.id, email, role }),
    );
    try {
      // The intake connection may only add outbox messages, which is all an email needs (as the password reset does).
      await customerEmailTransport(getPublicDb()).send(
        businessInviteEmail({
          to: email,
          inviterName: customer.user.name,
          businessName: customer.businessName,
          roleLabel: roleLabel(role),
          acceptUrl: new URL(invitePath(token), serverEnv().APP_ORIGIN).toString(),
          expiresInDays: BUSINESS_INVITE_DAYS,
        }),
      );
    } catch (error) {
      unstable_rethrow(error);
      reportError(error, { area: "team.invite.email" });
      // An invite nobody was told about would block inviting the same address again.
      await withTenantScope(getAppDb(), customer.tenant, (tx) => revokeBusinessInvite(tx, invite.id));
      return actionFail(INVITE_SEND_FAILED_MESSAGE);
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof BusinessInviteOpenError) return actionFail(ALREADY_INVITED_MESSAGE, { email: ALREADY_INVITED_MESSAGE });
    reportError(error, { area: "team.invite.create" });
    return actionFail(FAILED);
  }
  revalidatePath(TEAM_PATH);
  return actionOk();
}

const revokeSchema = z.object({ inviteId: z.uuid() });

/** Takes an invitation back. The invite must belong to the owner's own business (the database checks it against the session's). */
export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  const customer = await requireOwner();
  const parsed = revokeSchema.safeParse({ inviteId });
  if (!parsed.success) return actionFail("That invitation does not exist.");
  try {
    const revoked = await withTenantScope(getAppDb(), customer.tenant, (tx) => revokeBusinessInvite(tx, parsed.data.inviteId));
    if (!revoked) return actionFail("That invitation was already used or taken back.");
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "team.invite.revoke" });
    return actionFail(FAILED);
  }
  revalidatePath(TEAM_PATH);
  return actionOk();
}

/** Better Auth's text ids: short, never empty. Anything else names nobody. */
const removeSchema = z.object({ userId: z.string().min(1).max(128) });

/**
 * Takes an editor or a viewer off the team; their next page sends them to sign in. Written on the staff connection, which alone
 * may delete business_members (sanctioned in src/lib/db.ts), scoped to the session's business; the query never removes an owner,
 * and the owner may not remove themselves.
 */
export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const customer = await requireOwner();
  const parsed = removeSchema.safeParse({ userId });
  if (!parsed.success) return actionFail(REMOVE_REFUSED_MESSAGE);
  if (parsed.data.userId === customer.user.id) return actionFail(REMOVE_SELF_MESSAGE);
  try {
    const removed = await removeBusinessMember(getStaffDb(), { businessId: customer.businessId, userId: parsed.data.userId });
    if (!removed) return actionFail(REMOVE_REFUSED_MESSAGE);
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "team.member.remove" });
    return actionFail(FAILED);
  }
  revalidatePath(TEAM_PATH);
  return actionOk();
}

/**
 * Accepts an invitation for the signed-in person: their email address must be the one invited. The membership is written on
 * the staff connection, which alone may insert business_members (sanctioned in src/lib/db.ts); the user and the address come only
 * from the session, and the token is the guard. Success goes Home.
 */
export async function acceptInviteAction(token: string): Promise<ActionResult> {
  const { user } = await requireSignedIn();
  const checked = inviteTokenSchema.safeParse(token);
  if (!checked.success) return actionFail(checked.error.issues[0]?.message ?? FAILED);
  try {
    const budget = await consumeRateLimit(getAppDb(), `business-invite-accept:user:${user.id}`, ACCEPTS_PER_USER);
    if (!budget.allowed) return actionFail("Too many tries. Please wait a while and try again.");
    const result = await acceptBusinessInvite(getStaffDb(), { token: checked.data, userId: user.id, userEmail: user.email });
    if (result.kind === "refused") return actionFail(refusalMessage(result.reason));
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "team.invite.accept" });
    return actionFail(FAILED);
  }
  redirect("/");
}
