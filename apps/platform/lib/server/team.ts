import "server-only";
import {
  acceptBusinessInvite,
  BUSINESS_INVITE_DAYS,
  BusinessInviteOpenError,
  consumeRateLimit,
  createBusinessInvite,
  listBusinessInvites,
  listBusinessMembersForStaff,
  listMembershipsForUser,
  removeBusinessMember,
  revokeBusinessInvite,
  withTenantScope,
  type InvitableRole,
  type RateLimitRule,
} from "@brandbasket/db";
import { businessInviteEmail } from "@brandbasket/email";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import type { SessionUser, TenantContext } from "@brandbasket/shared/lib/access";
import { unstable_rethrow } from "next/navigation";
import {
  ALREADY_INVITED_MESSAGE,
  ALREADY_IN_A_BUSINESS_MESSAGE,
  clampInviteName,
  INVITE_GONE_MESSAGE,
  INVITE_SEND_FAILED_MESSAGE,
  invitePath,
  inviteTokenSchema,
  OWN_ADDRESS_MESSAGE,
  pendingInvites,
  refusalMessage,
  REMOVE_REFUSED_MESSAGE,
  REMOVE_SELF_MESSAGE,
  roleLabel,
  TEAM_FAILED_MESSAGE,
  TOO_MANY_ACCEPTS_MESSAGE,
  TOO_MANY_INVITES_MESSAGE,
  type MemberRole,
  type PendingInvite,
  type TeamResult,
} from "@/lib/team/rules";
import { getAppDb, getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { serverEnv } from "./env";
import { getPublicDb } from "./public-db";

/** An owner sends a handful of invitations; a loop is not one. */
export const INVITES_PER_OWNER: RateLimitRule = { limit: 20, windowSeconds: 60 * 60 };
/** Someone signed in guessing invite links gets a small budget; a real link needs one try. */
export const ACCEPTS_PER_USER: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };

/** One address is not a place to send the same business's (or any business's) invitations over and over, whoever owns them. */
export const INVITES_PER_RECIPIENT: RateLimitRule = { limit: 3, windowSeconds: 24 * 60 * 60 };

const ok: TeamResult = { ok: true };
const refused = (message: string, field: "email" | null = null): TeamResult => ({ ok: false, message, field });

export interface TeamMember {
  readonly userId: string;
  readonly name: string;
  /** Null for an account opened with a mobile number: its stored address is a placeholder nobody reads. */
  readonly email: string | null;
  readonly role: MemberRole;
  readonly joinedAt: Date;
  readonly isYou: boolean;
}

/**
 * Everyone who can open this business's dashboard, earliest first. A member can read only their own membership row under
 * row-level security, so the list is read on the staff connection, scoped by the session's business id alone, for the
 * owner alone (the page asks for `access: "owner"`). Read only. Sanctioned in ./db.ts.
 */
export async function loadMembers(tenant: TenantContext): Promise<readonly TeamMember[]> {
  const members = await listBusinessMembersForStaff(getStaffDb(), tenant.businessId);
  return members.map((member) => ({
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
    joinedAt: member.joinedAt,
    isYou: member.userId === tenant.userId,
  }));
}

/** The invites still waiting on the owner, read through row-level security as the owner. */
export async function loadInvites(tenant: TenantContext, now: Date = new Date()): Promise<readonly PendingInvite[]> {
  const invites = await withTenantScope(getAppDb(), tenant, (tx) => listBusinessInvites(tx));
  return pendingInvites(invites, now);
}

/**
 * Invites someone as an editor or a viewer: stores the invite, then emails the link. If the email cannot be sent the
 * invite is taken back, since one nobody was told about would block inviting the same address again. The business and
 * the inviter come from the session, never from the form.
 */
export async function inviteMember(
  customer: { readonly user: SessionUser; readonly tenant: TenantContext },
  input: { readonly email: string; readonly role: InvitableRole },
): Promise<TeamResult> {
  const { user, tenant } = customer;
  if (input.email === user.email.trim().toLowerCase()) return refused(OWN_ADDRESS_MESSAGE, "email");
  try {
    const budget = await consumeRateLimit(getAppDb(), `business-invite:user:${user.id}`, INVITES_PER_OWNER);
    if (!budget.allowed) return refused(TOO_MANY_INVITES_MESSAGE);
    const recipient = await consumeRateLimit(getAppDb(), `business-invite:to:${input.email.trim().toLowerCase()}`, INVITES_PER_RECIPIENT);
    if (!recipient.allowed) return refused(TOO_MANY_INVITES_MESSAGE);

    const { token, invite } = await withTenantScope(getAppDb(), tenant, (tx) =>
      createBusinessInvite(tx, { invitedBy: user.id, email: input.email, role: input.role }),
    );
    try {
      // The intake connection may only add outbox messages, which is all an email needs (as the password reset does).
      await customerEmailTransport(getPublicDb()).send(
        businessInviteEmail({
          to: input.email,
          inviterName: clampInviteName(user.name),
          businessName: clampInviteName(tenant.businessName),
          roleLabel: roleLabel(input.role),
          acceptUrl: new URL(invitePath(token), serverEnv().APP_ORIGIN).toString(),
          expiresInDays: BUSINESS_INVITE_DAYS,
        }),
      );
    } catch (error) {
      unstable_rethrow(error);
      console.error("[team] could not send an invitation", errorLogInfo(error));
      await withTenantScope(getAppDb(), tenant, (tx) => revokeBusinessInvite(tx, invite.id));
      return refused(INVITE_SEND_FAILED_MESSAGE);
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof BusinessInviteOpenError) return refused(ALREADY_INVITED_MESSAGE, "email");
    console.error("[team] could not create an invitation", errorLogInfo(error));
    return refused(TEAM_FAILED_MESSAGE);
  }
  return ok;
}

/** Takes an invitation back. The database checks it belongs to the session's business. */
export async function revokeInvite(tenant: TenantContext, inviteId: string): Promise<TeamResult> {
  try {
    const revoked = await withTenantScope(getAppDb(), tenant, (tx) => revokeBusinessInvite(tx, inviteId));
    return revoked ? ok : refused(INVITE_GONE_MESSAGE);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[team] could not revoke an invitation", errorLogInfo(error));
    return refused(TEAM_FAILED_MESSAGE);
  }
}

/**
 * Takes an editor or a viewer off the team; their next page sends them to sign in. Written on the staff connection, which
 * alone may delete business_members (sanctioned in ./db.ts), scoped to the session's business; the query never removes an
 * owner, and the owner may not remove themselves.
 */
export async function removeMember(customer: { readonly user: SessionUser; readonly tenant: TenantContext }, userId: string): Promise<TeamResult> {
  if (userId === customer.user.id) return refused(REMOVE_SELF_MESSAGE);
  try {
    const removed = await removeBusinessMember(getStaffDb(), { businessId: customer.tenant.businessId, userId });
    return removed ? ok : refused(REMOVE_REFUSED_MESSAGE);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[team] could not remove a member", errorLogInfo(error));
    return refused(TEAM_FAILED_MESSAGE);
  }
}

/**
 * Accepts an invitation for the signed-in person: their email address must be the one invited. The membership is written
 * on the staff connection, which alone may insert business_members (sanctioned in ./db.ts); the user and the address come
 * only from the session, and the token is the guard.
 */
export async function acceptInvite(user: SessionUser, token: string): Promise<TeamResult> {
  const checked = inviteTokenSchema.safeParse(token);
  if (!checked.success) return refused(checked.error.issues[0]?.message ?? TEAM_FAILED_MESSAGE);
  try {
    const budget = await consumeRateLimit(getAppDb(), `business-invite-accept:user:${user.id}`, ACCEPTS_PER_USER);
    if (!budget.allowed) return refused(TOO_MANY_ACCEPTS_MESSAGE);
    // Access resolves to the oldest membership, so a second one would never show: refuse before the invite is spent.
    if ((await listMembershipsForUser(getAppDb(), user.id)).length > 0) return refused(ALREADY_IN_A_BUSINESS_MESSAGE);
    const result = await acceptBusinessInvite(getStaffDb(), { token: checked.data, userId: user.id, userEmail: user.email });
    return result.kind === "refused" ? refused(refusalMessage(result.reason)) : ok;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[team] could not accept an invitation", errorLogInfo(error));
    return refused(TEAM_FAILED_MESSAGE);
  }
}
