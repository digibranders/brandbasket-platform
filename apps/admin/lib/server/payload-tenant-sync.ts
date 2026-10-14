import "server-only";
import { syncTenantForBusiness as sync, type TenantSyncInput } from "@firstfold/cms";
import config from "@/payload.config";

export type { TenantSyncInput };

/** This app's Payload config, bound to the shared tenant sync. */
export function syncTenantForBusiness(input: TenantSyncInput): Promise<void> {
  return sync(config, input);
}
