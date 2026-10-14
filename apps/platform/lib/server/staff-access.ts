import "server-only";
import { createStaffAccess, type GrantedStaff } from "@fynix/shared/server/staff-access";
import { getStaffDb } from "./db";
import { getSessionUser } from "./session";

export type { GrantedStaff };

/** This app's staff authorisation, over its own session reader and staff connection. */
export const { getStaffAccess, requireStaffAccess } = createStaffAccess({ getSessionUser, getStaffDb });
