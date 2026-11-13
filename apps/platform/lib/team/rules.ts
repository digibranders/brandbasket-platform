import type { BusinessInviteRefusal, BusinessInviteView, InvitableRole } from "@brandbasket/db";
import { z } from "zod";

/*
 * Settings, Team: who can open the business's dashboard, and what each role may do. Ownership is never handed out by
 * invite: an owner invites someone as an editor or a viewer. Pure, so the guard, the actions, the pages and the tests
 * share one reading.
 */

export type MemberRole = "owner" | InvitableRole;

/**
 * What a page or action asks of the member's role. `write` refuses a viewer (anything that changes the business);
 * `owner` refuses everyone but the owner (billing, checkout, the plan, the team, closing the account).
 */
export type MemberAccess = "write" | "owner";

/** Why a role is refused: the owner's pages send everyone else Home, a viewer's write is stopped where it starts. */
export type RoleRefusal = "owner-only" | "read-only";

export function roleRefusal(role: MemberRole, access: MemberAccess | undefined): RoleRefusal | null {
  if (access === "owner") return role === "owner" ? null : "owner-only";
  if (access === "write") return role === "viewer" ? "read-only" : null;
  return null;
}

/** The longest inviter or business name an invitation email carries: the owner chooses both, and the email goes to anyone. */
export const INVITE_NAME_MAX_LENGTH = 60;

/** A name cut to INVITE_NAME_MAX_LENGTH at a word boundary, with no ellipsis; one long word is cut where it stands. */
export function clampInviteName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= INVITE_NAME_MAX_LENGTH) return trimmed;
  const head = trimmed.slice(0, INVITE_NAME_MAX_LENGTH);
  if (/\s/.test(trimmed.charAt(INVITE_NAME_MAX_LENGTH))) return head.trimEnd();
  const lastSpace = head.search(/\s\S*$/);
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd();
}

/** The Team page, under Settings. */
export const TEAM_PATH = "/settings/team";

export const INVITE_ROLES = ["editor", "viewer"] as const satisfies readonly InvitableRole[];

const ROLE_LABELS: Readonly<Record<MemberRole, string>> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

export function roleLabel(role: MemberRole): string {
  return ROLE_LABELS[role];
}

export const ROLE_OPTIONS = INVITE_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/** Under the people list: what each role can do. */
export const ROLE_HELP = "Owners manage billing and the team. Editors can change the business profile and send requests. Viewers can see everything but change nothing.";

export const EMAIL_MAX_LENGTH = 254;

/** The invite form. The address is stored lower case, so one address has one open invite. */
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
export const ALREADY_IN_A_BUSINESS_MESSAGE =
  "This account already belongs to a business, so it cannot join another team yet. Ask the owner to invite a different email address.";
export const TOO_MANY_ACCEPTS_MESSAGE = "Too many tries. Please wait a while and try again.";
export const REMOVE_SELF_MESSAGE = "You can’t remove yourself from your own business.";
export const REMOVE_REFUSED_MESSAGE = "That person can’t be removed. Reload the page to see who has access.";
export const INVITE_GONE_MESSAGE = "That invitation was already used or taken back.";
export const INVITE_UNKNOWN_MESSAGE = "That invitation does not exist.";
export const TEAM_FAILED_MESSAGE = "We could not do that. Try again in a moment.";

/** What a team action answers: done, or why not, with the field the message is about. */
export type TeamResult = { readonly ok: true } | { readonly ok: false; readonly message: string; readonly field: "email" | null };

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

/** What the accept page says for each way an invitation can be refused. */
const REFUSALS: Readonly<Record<BusinessInviteRefusal, string>> = {
  not_found: "This invitation link is not valid. Ask the owner to send a new one.",
  revoked: "The owner withdrew this invitation. Ask them to send a new one.",
  expired: "This invitation has expired. Ask the owner to send a new one.",
  used: "This invitation has already been used.",
  wrong_email: "This invitation was sent to a different email address. Sign in with that address to accept it.",
};

export function refusalMessage(reason: BusinessInviteRefusal): string {
  return REFUSALS[reason];
}

export const INVITE_PATH_PREFIX = "/invite";

/** The accept link an invite email carries. */
export function invitePath(token: string): string {
  return `${INVITE_PATH_PREFIX}/${encodeURIComponent(token)}`;
}

/** Where sign-in is sent from the accept page, so the person comes back to it. */
export function inviteSignInHref(token: string): string {
  return `/login?next=${encodeURIComponent(invitePath(token))}`;
}

/** An invite token as the link carries it: url-safe base64 of 32 bytes. Anything else is refused before the database. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, REFUSALS.not_found);

/**
 * A `next` address that is safe to return to after sign-in: only an invite accept page, never another site or path.
 * The sign-in page and its action own the redirect and both call this, because the address comes from the browser.
 */
export function safeInviteReturn(next: string | null | undefined): string | null {
  if (typeof next !== "string") return null;
  return /^\/invite\/[A-Za-z0-9_-]{43}$/.test(next) ? next : null;
}

/** What the accept button shows after a try that was refused. A success never returns: it goes Home. */
export type AcceptInviteState = { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialAcceptInviteState: AcceptInviteState = { status: "idle" };

/** A date as the Team page writes it, in India's time zone so the server and the browser agree: "12 Nov 2026". */
export function teamDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** What the accept page shows: a bad link, a way to sign in, or the button. Decided from the token and the session alone. */
export type InviteView = "invalid-link" | "sign-in" | "accept";

export function inviteViewFor(token: string, signedIn: boolean): InviteView {
  if (!inviteTokenSchema.safeParse(token).success) return "invalid-link";
  return signedIn ? "accept" : "sign-in";
}
