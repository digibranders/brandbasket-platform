import "server-only";
import {
  checkBusinessInvite,
  listBusinessInvites,
  listBusinessMembersForStaff,
  withTenantScope,
  type CheckBusinessInviteResult,
} from "@brandbasket/db";
import { getAppDb, getStaffDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { pendingInvites, type MemberRole, type PendingInvite } from "./rules";

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
 * row-level security, so the list is read on the staff connection, scoped by the session's business id alone, for the owner
 * alone (the page asks requireOwner). Read only. Sanctioned in src/lib/db.ts.
 */
export async function loadMembers(customer: Pick<CustomerContext, "businessId" | "user">): Promise<readonly TeamMember[]> {
  const members = await listBusinessMembersForStaff(getStaffDb(), customer.businessId);
  return members.map((member) => ({
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
    joinedAt: member.joinedAt,
    isYou: member.userId === customer.user.id,
  }));
}

/** The invites still waiting on the owner, read through row-level security as the owner. */
export async function loadInvites(customer: Pick<CustomerContext, "tenant">, now: Date = new Date()): Promise<readonly PendingInvite[]> {
  const invites = await withTenantScope(getAppDb(), customer.tenant, (tx) => listBusinessInvites(tx));
  return pendingInvites(invites, now);
}

/**
 * Loads and evaluates an invitation by its raw token on the staff connection, since an invitee has no business membership
 * yet and business_invites is row-level secured. Returns either valid or refused with reason.
 */
export async function loadInviteForToken(
  token: string,
  userEmail?: string | null,
  now: Date = new Date(),
): Promise<CheckBusinessInviteResult> {
  return checkBusinessInvite(getStaffDb(), { token, userEmail, now });
}
