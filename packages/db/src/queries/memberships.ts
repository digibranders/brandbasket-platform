import { and, asc, eq, ne } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, businessMembers, type BusinessMemberRole } from "../schema";
import { withUserScope } from "../scope";

export interface BusinessMembership {
  readonly businessId: string;
  readonly businessName: string;
  readonly role: BusinessMemberRole;
}

/** Reads through row-level security as the user, so it can only ever return that user's businesses. */
export async function listMembershipsForUser(db: Database, userId: string): Promise<BusinessMembership[]> {
  return withUserScope(db, userId, (tx) =>
    tx
      .select({
        businessId: businesses.id,
        businessName: businesses.name,
        role: businessMembers.role,
      })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
      .where(eq(businessMembers.userId, userId))
      // uuidv7 business ids are time-ordered, so they break ties between memberships created in one transaction.
      .orderBy(asc(businessMembers.createdAt), asc(businessMembers.businessId)),
  );
}

/**
 * Takes one member who is not an owner off a business: the owner's "Remove" on the Team page, on the staff connection (the
 * app role may not delete business_members). An owner row is never removed here, so a business cannot lose its owner. True
 * when a membership was removed; false when the user is not a non-owner member of that business.
 */
export async function removeBusinessMember(db: Database, input: { readonly businessId: string; readonly userId: string }): Promise<boolean> {
  const removed = await db
    .delete(businessMembers)
    .where(and(eq(businessMembers.businessId, input.businessId), eq(businessMembers.userId, input.userId), ne(businessMembers.role, "owner")))
    .returning({ userId: businessMembers.userId });
  return removed.length > 0;
}
