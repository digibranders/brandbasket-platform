import { accountOtps, clearRateLimits, findUserByEmail, isPhoneAccountEmail, sessions, staffMembers, users, type Database } from "@brandbasket/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { staffSignInCodeAddressKeys } from "./staff-sign-in-code";

export class StaffRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffRecoveryError";
  }
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export interface StaffRecoveryResult {
  readonly userId: string;
  readonly email: string;
  readonly sessionsEnded: number;
  readonly codesRemoved: number;
}

/**
 * Gets a locked-out staff member back to a clean start, run on the server by an admin (`pnpm staff:reset-2fa`):
 * ends their sessions, removes their unused sign-in codes, and lifts the code limits for their address and the
 * all-network sign-in limit for the account. With `newEmail` it also moves the account to another address, for a mailbox
 * that is lost, so the next code goes there. The password is not touched, and no code is issued here: they sign in
 * as usual and the code is emailed to the address on file.
 *
 * Refuses an address that is not a staff account (active or not), so it cannot be used to hand an address to a customer.
 */
export async function resetStaffSignIn(db: Database, input: { readonly email: string; readonly newEmail?: string }): Promise<StaffRecoveryResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw new StaffRecoveryError("--email must be a valid email address.");
  let newEmail: string | null = null;
  if (input.newEmail !== undefined) {
    const parsed = emailSchema.safeParse(input.newEmail);
    if (!parsed.success) throw new StaffRecoveryError("--new-email must be a valid email address.");
    if (isPhoneAccountEmail(parsed.data)) throw new StaffRecoveryError("--new-email must be a real email address.");
    newEmail = parsed.data;
  }

  const [staff] = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(staffMembers, eq(staffMembers.userId, users.id))
    .where(eq(users.email, email.data))
    .limit(1);
  if (staff === undefined) throw new StaffRecoveryError(`${email.data} is not a staff account.`);

  if (newEmail !== null && newEmail !== email.data && (await findUserByEmail(db, newEmail)) !== null) {
    throw new StaffRecoveryError(`${newEmail} already belongs to another account.`);
  }

  const addresses = newEmail === null ? [email.data] : [email.data, newEmail];
  const result = await db.transaction(async (tx) => {
    const ended = await tx.delete(sessions).where(eq(sessions.userId, staff.userId)).returning({ id: sessions.id });
    const removed = await tx
      .delete(accountOtps)
      .where(and(eq(accountOtps.purpose, "staff_sign_in"), inArray(accountOtps.email, addresses)))
      .returning({ id: accountOtps.id });
    if (newEmail !== null) await tx.update(users).set({ email: newEmail }).where(eq(users.id, staff.userId));
    return { sessionsEnded: ended.length, codesRemoved: removed.length };
  });

  await clearRateLimits(db, [
    ...addresses.flatMap((address) => Object.values(staffSignInCodeAddressKeys(address))),
    `sign-in:account:${email.data}`,
  ]);
  return { userId: staff.userId, email: newEmail ?? email.data, ...result };
}
