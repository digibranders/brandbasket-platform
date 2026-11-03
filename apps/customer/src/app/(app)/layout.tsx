import type { ReactNode } from "react";
import { requireCustomer } from "@/lib/guards";

/**
 * The signed-in workspace. The shell (sidebar, top bar, phone tabs) replaces this placeholder <main>. This guard sends
 * people without a workspace away early; every page and action below still calls its own guard.
 */
export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  await requireCustomer();
  return (
    <main id="page" tabIndex={-1} className="mx-auto w-full max-w-page px-gutter pt-4 pb-12 md:pt-5">
      {children}
    </main>
  );
}
