import "server-only";
import { supportSubmissionsEnabled } from "@/lib/support-rollout";

export function canCreateSupportRequest(userId: string | null): boolean {
  return supportSubmissionsEnabled(process.env.BRANDBASKET_SUPPORT_MODE, process.env.BRANDBASKET_SUPPORT_INTERNAL_ACCOUNT_IDS, userId);
}
