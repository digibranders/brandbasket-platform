import type { ReactNode } from "react";
import { AppShell } from "@/features/shell/components/app-shell";
import { loadShell } from "@/features/shell/loader";
import { requireCustomer } from "@/lib/guards";

/**
 * The signed-in workspace: sidebar, top bar and phone tabs around every page. This guard sends people without a workspace
 * away early and gives the shell its business; every page and action below still calls its own guard (plan 61, section 2).
 */
export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  const customer = await requireCustomer();
  const view = await loadShell(customer);
  return <AppShell view={view}>{children}</AppShell>;
}
