import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isAwaitingFirstPayment, loadBusinessEntry } from "@/features/checkout/server/entry";
import { AppShell } from "@/features/shell/components/app-shell";
import { loadShell } from "@/features/shell/loader";
import { requireCustomer } from "@/lib/guards";

/**
 * The signed-in workspace: sidebar, top bar and phone tabs around every page. This guard sends people without a workspace
 * away early and gives the shell its business; every page and action below still calls its own guard (plan 61, section 2).
 */
export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  const customer = await requireCustomer();
  // A sign-up that chose Managed Website and has not paid has no workspace yet, only its checkout (the old unpaid hold).
  // Pages that read or write customer data still run their own guards; this only keeps the empty dashboard out of view.
  if (isAwaitingFirstPayment(await loadBusinessEntry(customer))) redirect("/checkout");
  const view = await loadShell(customer);
  return <AppShell view={view}>{children}</AppShell>;
}
