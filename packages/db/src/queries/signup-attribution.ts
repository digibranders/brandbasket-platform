import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { signupAttribution, type SignupAttribution } from "../schema";
import type { ScopedTransaction } from "../scope";

type Runner = Database | ScopedTransaction;

/** What is kept about the ad a business came from; everything but the two consent flags may be missing. */
export type NewSignupAttribution = Omit<typeof signupAttribution.$inferInsert, "businessId" | "capturedAt">;

/**
 * Keeps the ad a business came from (plan 59). The first one wins: a second call for the same business changes nothing.
 * Returns whether this call stored it. Staff connection.
 */
export async function recordSignupAttribution(db: Runner, businessId: string, input: NewSignupAttribution): Promise<boolean> {
  const stored = await db.insert(signupAttribution).values({ ...input, businessId }).onConflictDoNothing({ target: signupAttribution.businessId }).returning({ businessId: signupAttribution.businessId });
  return stored.length === 1;
}

/** The ad a business came from, or null when it did not come from one. Staff connection. */
export async function getSignupAttribution(db: Runner, businessId: string): Promise<SignupAttribution | null> {
  const [row] = await db.select().from(signupAttribution).where(eq(signupAttribution.businessId, businessId));
  return row ?? null;
}
