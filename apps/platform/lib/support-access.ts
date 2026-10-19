import type { CustomerAccess, SessionUser } from "@brandbasket/shared/lib/access";

export interface SupportAccess {
  readonly user: SessionUser;
  readonly businessId: string | null;
  readonly businessName: string | null;
}

/** Support depends on a live account, never a plan or an onboarding milestone. */
export function supportAccessFrom(access: CustomerAccess): SupportAccess | null {
  if (access.kind === "signed-out" || access.kind === "closing") return null;
  if (access.kind !== "granted") return { user: access.user, businessId: null, businessName: null };
  return { user: access.user, businessId: access.tenant.businessId, businessName: access.tenant.businessName };
}
