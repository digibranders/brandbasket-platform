import "server-only";
import { redirect } from "next/navigation";
import { supportAccessFrom, type SupportAccess } from "@/lib/support-access";
import { RESTORE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { getCustomerAccess } from "./customer-tenant";

export async function getSupportAccess(): Promise<SupportAccess | null> {
  return supportAccessFrom(await getCustomerAccess());
}

export async function requireSupportAccess(): Promise<SupportAccess> {
  const access = await getCustomerAccess();
  if (access.kind === "closing") redirect(RESTORE_ACCOUNT_PATH);
  const support = supportAccessFrom(access);
  if (support === null) redirect("/login");
  return support;
}
