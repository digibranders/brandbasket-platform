import { and, count, eq } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, staffMembers, users, type StaffRole } from "../schema";

export interface ActiveStaffMember {
  readonly userId: string;
  readonly role: StaffRole;
}

export interface PlatformCounts {
  readonly businesses: number;
}

/** Use with the staff connection. */
export async function findActiveStaffMember(db: Database, userId: string): Promise<ActiveStaffMember | null> {
  const rows = await db
    .select({ userId: staffMembers.userId, role: staffMembers.role })
    .from(staffMembers)
    .where(and(eq(staffMembers.userId, userId), eq(staffMembers.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The user id of the active staff member who signs in with `email` (already trimmed and lower case), so a failed sign-in
 * can be recorded against the account being guessed. Never shown to the person signing in. Use with the staff connection.
 */
export async function findActiveStaffUserIdByEmail(db: Database, email: string): Promise<string | null> {
  const rows = await db
    .select({ userId: staffMembers.userId })
    .from(staffMembers)
    .innerJoin(users, eq(users.id, staffMembers.userId))
    .where(and(eq(users.email, email), eq(staffMembers.active, true)))
    .limit(1);
  return rows[0]?.userId ?? null;
}

/** Use with the staff connection. */
export async function countPlatformRecords(db: Database): Promise<PlatformCounts> {
  // Website clients only: free listing accounts are not clients.
  const businessRows = await db.select({ value: count() }).from(businesses).where(eq(businesses.kind, "website"));
  return { businesses: businessRows[0]?.value ?? 0 };
}
