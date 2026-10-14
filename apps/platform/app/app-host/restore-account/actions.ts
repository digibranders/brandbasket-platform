"use server";

import { redirect } from "next/navigation";
import { restoreAccountFor } from "@/lib/server/account-exit";
import { getCustomerAccess } from "@/lib/server/customer-access";

/** Brings a closing account back. Only the signed-in account's own closure is ever touched. */
export async function restoreAccount(): Promise<void> {
  const access = await getCustomerAccess();
  if (access.kind !== "closing") redirect("/login");
  await restoreAccountFor(access.user.id, new Date());
  redirect("/");
}
