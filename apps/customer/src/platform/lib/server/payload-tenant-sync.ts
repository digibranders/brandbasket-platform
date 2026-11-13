import "server-only";
import { syncTenantForBusiness as sync, type TenantSyncInput } from "@brandbasket/cms";
import { blogCmsConfig } from "@/features/blog/server/payload";

export type { TenantSyncInput };

/** This app's Payload config (the blog's), bound to the shared tenant sync. */
export function syncTenantForBusiness(input: TenantSyncInput): Promise<void> {
  return sync(blogCmsConfig(), input);
}
