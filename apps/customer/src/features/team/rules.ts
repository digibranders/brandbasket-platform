import type { BusinessInviteRefusal, BusinessInviteView, InvitableRole } from "@brandbasket/db";
import { z } from "zod";

/*
 * Settings, Team. New in v4 (no old behaviour to port). Ownership is never handed out by invite: an owner invites someone
 * as an editor or a viewer (packages/db business-invites).
 */

export const INVITE_ROLES = ["editor", "viewer"] as const satisfies readonly InvitableRole[];

export type MemberRole = "owner" | InvitableRole;

const ROLE_LABELS: Readonly<Record<MemberRole, string>> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

export function roleLabel(role: MemberRole): string {
  return ROLE_LABELS[role];
}

/** The options of the invite dialog's role choice. */
export const ROLE_OPTIONS = INVITE_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/** Under the people table: what each role can do. */
export const ROLE_HELP = "Owners manage billing and the team. Editors can change the business profile and send requests. Viewers can see everything but change nothing.";

export const EMAIL_MAX_LENGTH = 254;

/** The invite dialog's form. The address is stored lower case, so one address has one open invite. */
export const inviteSchema = z.object({
  email: z
    .string({ error: "Enter an email address." })
    .trim()
    .toLowerCase()
    .min(1, "Enter an email address.")
    .max(EMAIL_MAX_LENGTH, "That email address is too long.")
    .pipe(z.email("Enter a valid email address.")),
  role: z.enum(INVITE_ROLES, { error: "Choose Editor or Viewer." }),
});

export const OWN_ADDRESS_MESSAGE = "That is your own address. You already have access.";
export const ALREADY_INVITED_MESSAGE = "That address already has an invitation. Revoke it first to send a new one.";
export const INVITE_SEND_FAILED_MESSAGE = "We could not send the invitation. Nothing was saved. Try again in a moment.";
export const TOO_MANY_INVITES_MESSAGE = "That is a lot of invitations in a short time. Please wait a while and try again.";
export const REMOVE_SELF_MESSAGE = "You can’t remove yourself from your own business.";
export const REMOVE_REFUSED_MESSAGE = "That person can’t be removed. Reload the page to see who has access.";

export type InviteStatus = "open" | "expired";

export interface PendingInvite {
  readonly id: string;
  readonly email: string;
  readonly role: InvitableRole;
  readonly status: InviteStatus;
  readonly expiresAt: Date;
  readonly sentAt: Date;
}

/**
 * The invites an owner still has to deal with: open ones, and expired ones that are still on the books (an expired invite
 * still blocks inviting the same address until it is revoked). Accepted and revoked ones are history and are left out.
 */
export function pendingInvites(invites: readonly BusinessInviteView[], now: Date): PendingInvite[] {
  return invites
    .filter((invite) => invite.acceptedAt === null && invite.revokedAt === null)
    .map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role === "viewer" ? "viewer" : "editor",
      status: invite.expiresAt.getTime() > now.getTime() ? ("open" as const) : ("expired" as const),
      expiresAt: invite.expiresAt,
      sentAt: invite.createdAt,
    }));
}

const REFUSAL_TITLES: Readonly<Record<BusinessInviteRefusal, string>> = {
  not_found: "This invitation link is not valid.",
  revoked: "This invitation was withdrawn.",
  expired: "This invitation has expired.",
  used: "This invitation has already been used.",
  wrong_email: "This invitation is for a different email address.",
};

export function refusalTitle(reason: BusinessInviteRefusal): string {
  return REFUSAL_TITLES[reason];
}

/** What the accept page says for each way an invitation can be refused. */
const REFUSALS: Readonly<Record<BusinessInviteRefusal, string>> = {
  not_found: "This invitation link is not valid. Ask the owner to send a new one.",
  revoked: "The owner withdrew this invitation. Ask them to send a new one.",
  expired: "This invitation has expired. Ask the owner to send a new one.",
  used: "This invitation has already been used. Ask the owner to send a new one.",
  wrong_email: "This invitation was sent to a different email address. Sign in with that address to accept it.",
};

export function refusalMessage(reason: BusinessInviteRefusal): string {
  return REFUSALS[reason];
}

/** The accept link an invite email carries. */
export function invitePath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`;
}

/** Where sign-in and sign-up are sent from the accept page, so the person comes back to it. */
export function inviteSignInHref(token: string): string {
  return `/login?next=${encodeURIComponent(invitePath(token))}`;
}

export function inviteSignUpHref(token: string): string {
  return `/signup?next=${encodeURIComponent(invitePath(token))}`;
}

/** An invite token as the link carries it: url-safe base64 of 32 bytes. Anything else is refused before the database. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This invitation link is not valid. Ask the owner to send a new one.");

/**
 * A `next` address that is safe to return to after sign-in: only an invite accept page, never another site or path. For the
 * sign-in and sign-up screens, which own the redirect.
 */
export function safeInviteReturn(next: string | null | undefined): string | null {
  if (typeof next !== "string") return null;
  return /^\/invite\/[A-Za-z0-9_-]{43}$/.test(next) ? next : null;
}
