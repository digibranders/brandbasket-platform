import "server-only";
import {
  countActiveAdmins,
  createStaffInvite,
  findOpenStaffInvite,
  findStaffMember,
  findStaffMemberByEmail,
  setStaffRole,
  switchOffStaffMember,
  switchOnStaffMember,
  type StaffRole,
} from "@brandbasket/db";
import { staffInviteEmail } from "@brandbasket/email";
import { STAFF_INVITE_EXPIRY_DAYS } from "@/lib/staff-invite-form";
import type { StaffNotice } from "@/lib/staff-notices";
import { ROLE_LABELS } from "@/lib/staff-roles";
import { staffChangeProblem, type StaffChange } from "@/lib/staff-rules";
import { recordStaffAction } from "./activity";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import { serverEnv } from "./env";
import type { GrantedStaff } from "./staff-access";
import { logStaffAccess } from "./staff-access-log";

/**
 * Invites someone with a role. Someone already active on the team is refused (change their role instead); someone
 * switched off can be invited again, which switches them on when they accept.
 */
export async function inviteStaff(granted: GrantedStaff, input: { readonly email: string; readonly role: StaffRole }): Promise<StaffNotice> {
  const db = getStaffDb();
  const member = await findStaffMemberByEmail(db, input.email);
  if (member !== null && member.active) return "already-staff";
  const created = await createStaffInvite(db, { email: input.email, role: input.role, invitedBy: granted.user.id, expiresInDays: STAFF_INVITE_EXPIRY_DAYS });
  await customerEmailTransport(db).send(
    staffInviteEmail({
      to: created.invite.email,
      roleLabel: ROLE_LABELS[input.role],
      inviterName: granted.user.name,
      acceptUrl: new URL(`/staff-invite/${created.token}`, serverEnv().ADMIN_ORIGIN).toString(),
      expiresInDays: STAFF_INVITE_EXPIRY_DAYS,
    }),
  );
  await logStaffAccess({ staffUserId: granted.user.id, action: "staff.invite", targetType: "staff_invite", targetId: created.invite.id, detail: input.role });
  await recordStaffAction(granted, {
    businessId: null,
    kind: "staff.invited",
    summary: `Invited someone as ${ROLE_LABELS[input.role]}`,
    data: { inviteId: created.invite.id, role: input.role },
  });
  return "invited";
}

/** A fresh link to the same address and role; the old link stops working. */
export async function resendStaffInvite(granted: GrantedStaff, inviteId: string): Promise<StaffNotice> {
  const invite = await findOpenStaffInvite(getStaffDb(), inviteId);
  if (invite === null) return "invite-gone";
  const notice = await inviteStaff(granted, { email: invite.email, role: invite.role });
  return notice === "invited" ? "resent" : notice;
}

/** Loads the target and checks the rules; returns the target, or the notice that refuses the change. */
async function checkChange(granted: GrantedStaff, userId: string, change: StaffChange): Promise<{ readonly role: StaffRole } | StaffNotice> {
  const db = getStaffDb();
  const target = await findStaffMember(db, userId);
  if (target === null) return "not-found";
  // shortcut: the admin count is read before the update, so two admins demoting each other at the same instant could both pass; pnpm staff:create recovers that, add a database check if it ever happens.
  const problem = staffChangeProblem(change, { actorUserId: granted.user.id, target, activeAdmins: await countActiveAdmins(db) });
  return problem ?? { role: target.role };
}

export async function changeStaffRole(granted: GrantedStaff, userId: string, role: StaffRole): Promise<StaffNotice> {
  const checked = await checkChange(granted, userId, { kind: "role", role });
  if (typeof checked === "string") return checked;
  if (!(await setStaffRole(getStaffDb(), userId, role))) return "not-found";
  await logStaffAccess({ staffUserId: granted.user.id, action: "staff.role_change", targetType: "staff_member", targetId: userId, detail: `${checked.role} to ${role}` });
  await recordStaffAction(granted, {
    businessId: null,
    kind: "staff.role_changed",
    summary: `Changed a role from ${ROLE_LABELS[checked.role]} to ${ROLE_LABELS[role]}`,
    data: { userId, from: checked.role, to: role },
  });
  return "role-changed";
}

export async function switchOffStaff(granted: GrantedStaff, userId: string): Promise<StaffNotice> {
  const checked = await checkChange(granted, userId, { kind: "switch-off" });
  if (typeof checked === "string") return checked;
  if (!(await switchOffStaffMember(getStaffDb(), userId))) return "already-off";
  await logStaffAccess({ staffUserId: granted.user.id, action: "staff.deactivate", targetType: "staff_member", targetId: userId });
  await recordStaffAction(granted, { businessId: null, kind: "staff.switched_off", summary: `Switched off a ${ROLE_LABELS[checked.role]} member`, data: { userId } });
  return "switched-off";
}

export async function switchOnStaff(granted: GrantedStaff, userId: string): Promise<StaffNotice> {
  const checked = await checkChange(granted, userId, { kind: "switch-on" });
  if (typeof checked === "string") return checked;
  if (!(await switchOnStaffMember(getStaffDb(), userId))) return "already-on";
  await logStaffAccess({ staffUserId: granted.user.id, action: "staff.reactivate", targetType: "staff_member", targetId: userId });
  await recordStaffAction(granted, { businessId: null, kind: "staff.switched_on", summary: `Switched a ${ROLE_LABELS[checked.role]} member back on`, data: { userId } });
  return "switched-on";
}
