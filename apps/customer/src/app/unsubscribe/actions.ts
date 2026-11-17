"use server";

import { redirect } from "next/navigation";
import { readUnsubscribeLink, unsubscribeAddress } from "@/platform/lib/server/unsubscribe";

/** Writes the suppression for the address the signed link names, then shows the done page. A link that does not verify stops here. */
export async function unsubscribeAction(formData: FormData): Promise<void> {
  const e = formData.get("e");
  const t = formData.get("t");
  const address = readUnsubscribeLink({ e: typeof e === "string" ? e : null, t: typeof t === "string" ? t : null });
  if (address === null) redirect("/unsubscribe");
  await unsubscribeAddress(address);
  redirect("/unsubscribe/done");
}
