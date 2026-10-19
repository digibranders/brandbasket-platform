import "server-only";
import { findActiveStaffMember, type ActiveStaffMember, type Database } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { decideStaffAccess, type SessionUser, type StaffAccess } from "../lib/access";

export interface GrantedStaff {
  readonly user: SessionUser;
  readonly staff: ActiveStaffMember;
}

export interface StaffAccessDependencies {
  readonly getSessionUser: () => Promise<SessionUser | null>;
  readonly getStaffDb: () => Database;
}

export interface StaffAccessFunctions {
  readonly getStaffAccess: () => Promise<StaffAccess>;
  /**
   * Call in every staff page, layout and action. Anyone who isn't the superadmin is sent to /login, which explains
   * why.
   */
  readonly requireStaffAccess: () => Promise<GrantedStaff>;
}

/**
 * Builds the staff authorisation helpers for an app, over that app's session reader and staff connection.
 *
 * This is the authorisation path, so it is deliberately one implementation rather than a copy per app: a fix here
 * reaches both. Only the two dependencies differ between them.
 */
export function createStaffAccess({ getSessionUser, getStaffDb }: StaffAccessDependencies): StaffAccessFunctions {
  const getStaffAccess = cache(async (): Promise<StaffAccess> => {
    const user = await getSessionUser();
    if (user === null) return decideStaffAccess(null, null);
    return decideStaffAccess(user, await findActiveStaffMember(getStaffDb(), user.id));
  });

  return {
    getStaffAccess,
    async requireStaffAccess(): Promise<GrantedStaff> {
      const access = await getStaffAccess();
      if (access.kind !== "granted") redirect("/login");
      return { user: access.user, staff: access.staff };
    },
  };
}
