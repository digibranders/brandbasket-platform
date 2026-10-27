import "server-only";
import { supportAccessFrom, type SupportAccess } from "@/lib/support-access";
import { getCustomerAccess } from "./customer-tenant";

export async function getSupportAccess(): Promise<SupportAccess | null> {
  return supportAccessFrom(await getCustomerAccess());
}
