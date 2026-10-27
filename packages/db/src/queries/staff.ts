import { and, asc, count, desc, eq, max, sql } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, sessions, staffAccessLog, staffMembers, users, type StaffRole } from "../schema";

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

/** A staff member as the Staff page shows them. */
export interface StaffRosterRow {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: StaffRole;
  readonly active: boolean;
  /** The last successful console sign-in in the access log, or null. */
  readonly lastSignInAt: Date | null;
}

export interface StaffMemberState {
  readonly userId: string;
  readonly role: StaffRole;
  readonly active: boolean;
}

/** Everyone who has or had console access, active first, then by name. Use with the staff connection. */
export async function listStaffRoster(db: Database): Promise<readonly StaffRosterRow[]> {
  const members = await db
    .select({ userId: staffMembers.userId, name: users.name, email: users.email, role: staffMembers.role, active: staffMembers.active })
    .from(staffMembers)
    .innerJoin(users, eq(users.id, staffMembers.userId))
    .orderBy(desc(staffMembers.active), asc(users.name));
  const signIns = await db
    .select({ staffUserId: staffAccessLog.staffUserId, at: max(staffAccessLog.createdAt) })
    .from(staffAccessLog)
    .where(and(eq(staffAccessLog.action, "staff.sign_in"), eq(staffAccessLog.result, "ok")))
    .groupBy(staffAccessLog.staffUserId);
  const lastSignIn = new Map(signIns.map((row) => [row.staffUserId, row.at]));
  return members.map((member) => ({ ...member, lastSignInAt: lastSignIn.get(member.userId) ?? null }));
}

/** A member by user id, active or not. Use with the staff connection. */
export async function findStaffMember(db: Database, userId: string): Promise<StaffMemberState | null> {
  const rows = await db
    .select({ userId: staffMembers.userId, role: staffMembers.role, active: staffMembers.active })
    .from(staffMembers)
    .where(eq(staffMembers.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** A member by sign-in address, active or not. Use with the staff connection. */
export async function findStaffMemberByEmail(db: Database, email: string): Promise<StaffMemberState | null> {
  const rows = await db
    .select({ userId: staffMembers.userId, role: staffMembers.role, active: staffMembers.active })
    .from(staffMembers)
    .innerJoin(users, eq(users.id, staffMembers.userId))
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

/** How many admins can sign in now. Use with the staff connection. */
export async function countActiveAdmins(db: Database): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(staffMembers)
    .where(and(eq(staffMembers.active, true), eq(staffMembers.role, "admin")));
  return rows[0]?.value ?? 0;
}

/** Returns false when there is no such member. Use with the staff connection. */
export async function setStaffRole(db: Database, userId: string, role: StaffRole): Promise<boolean> {
  const rows = await db.update(staffMembers).set({ role }).where(eq(staffMembers.userId, userId)).returning({ userId: staffMembers.userId });
  return rows.length === 1;
}

/**
 * Closes the console to a member and ends every session of their account, in one transaction: a switched-off person is
 * signed out at once, not when their cookie expires. Returns false when they were not active.
 */
export async function switchOffStaffMember(db: Database, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(staffMembers)
      .set({ active: false })
      .where(and(eq(staffMembers.userId, userId), eq(staffMembers.active, true)))
      .returning({ userId: staffMembers.userId });
    if (rows.length === 0) return false;
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    return true;
  });
}

/** Returns false when they were already active or are not a member. Use with the staff connection. */
export async function switchOnStaffMember(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .update(staffMembers)
    .set({ active: true })
    .where(and(eq(staffMembers.userId, userId), eq(staffMembers.active, false)))
    .returning({ userId: staffMembers.userId });
  return rows.length === 1;
}

/** Gives an account console access with a role, or switches an existing member on with that role (as `pnpm staff:create` does). */
export async function addStaffMember(db: Database, input: { readonly userId: string; readonly role: StaffRole }): Promise<void> {
  await db
    .insert(staffMembers)
    .values({ userId: input.userId, role: input.role })
    .onConflictDoUpdate({ target: staffMembers.userId, set: { active: true, role: input.role } });
}

