import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isAwaitingFirstPayment, loadBusinessEntry } from "@/features/checkout/server/entry";
import { AppShell } from "@/features/shell/components/app-shell";
import { loadShell } from "@/features/shell/loader";
import { unpaidHoldRedirect } from "@/lib/guard-rules";
import { requireCustomer } from "@/lib/guards";

/**
 * The signed-in workspace: sidebar, top bar and phone tabs around every page. This guard sends people without a workspace
 * away early and gives the shell its business; every page and action below still calls its own guard (plan 61, section 2).
 */
export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  const customer = await requireCustomer();
  // An unpaid customer can open Help, Settings and Sign out instead of being locked to /start.
  // Other workspace pages (like the home dashboard) redirect unpaid accounts to checkout.
  const entry = await loadBusinessEntry(customer);
  const reqHeaders = await headers();
  const pathname = reqHeaders.get("x-pathname") ?? "";
  const away = unpaidHoldRedirect(pathname, isAwaitingFirstPayment(entry));
  if (away !== null) redirect(away);

  const view = await loadShell(customer);
  return <AppShell view={view}>{children}</AppShell>;
}
