import type { StaffRole } from "@brandbasket/db";
import type { StaffNotice } from "./staff-notices";

export type StaffChange = { readonly kind: "role"; readonly role: StaffRole } | { readonly kind: "switch-off" } | { readonly kind: "switch-on" };

export interface StaffChangeContext {
  /** The admin making the change. */
  readonly actorUserId: string;
  readonly target: { readonly userId: string; readonly role: StaffRole; readonly active: boolean };
  readonly activeAdmins: number;
}

/**
 * Why a change must not happen, as a Staff page notice, or null when it may. Nobody changes their own access, so an
 * admin cannot lock themselves out by mistake, and the last active admin stays an admin.
 */
export function staffChangeProblem(change: StaffChange, context: StaffChangeContext): StaffNotice | null {
  const self = context.actorUserId === context.target.userId;
  if (self && change.kind === "switch-off") return "self-off";
  if (self && change.kind === "role" && change.role !== context.target.role) return "self-role";
  if (change.kind === "switch-on" && context.target.active) return "already-on";
  if (change.kind === "switch-off" && !context.target.active) return "already-off";
  const takesAwayAnAdmin =
    context.target.role === "admin" && context.target.active && (change.kind === "switch-off" || (change.kind === "role" && change.role !== "admin"));
  if (takesAwayAnAdmin && context.activeAdmins <= 1) return "last-admin";
  return null;
}
