import { asc, eq } from "drizzle-orm";
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
