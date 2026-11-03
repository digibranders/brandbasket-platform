import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isAwaitingFirstPayment, loadBusinessEntry } from "@/features/checkout/server/entry";
import { signOutAction } from "@/features/entry/actions";
import { getEntryAccess } from "@/features/entry/server/entry-access";
import { AppShell } from "@/features/shell/components/app-shell";
import { loadShell } from "@/features/shell/loader";
import { requireAffiliate, requireCustomer } from "@/lib/guards";
import { Button } from "@/ui";

/**
 * Two frames, as in the old app (PARITY affiliate, behaviours 4 and 5). A customer who is also an affiliate keeps their own
 * workspace around the page, so the way back to it is never lost; a closing account goes to restore it first. An affiliate
 * with no workspace gets a stripped header with Sign out only: no Settings and no bell, so they cannot reach customer
 * screens from here, and password changes come only from a link the team sends. The guard is repeated on the page, because
 * layouts render independently of the pages below them.
 */
export default async function AffiliateLayout({ children }: { readonly children: ReactNode }) {
  await requireAffiliate();
  const access = await getEntryAccess();
  if (access.kind === "closing") redirect("/restore-account");
  if (access.kind === "granted") {
    const customer = await requireCustomer();
    // A sign-up still to pay has no workspace yet (the (app) layout sends it to checkout), so it keeps the affiliate frame.
    if (!isAwaitingFirstPayment(await loadBusinessEntry(customer))) return <AppShell view={await loadShell(customer)}>{children}</AppShell>;
  }
  return (
    <div className="min-h-dvh">
      <a
        href="#page"
        className="sr-only z-60 rounded-control bg-primary px-3 py-2 type-button text-on-primary no-underline focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2.5">
        <p className="type-section flex-1">Brandbasket</p>
        <form action={signOutAction}>
          <Button type="submit" size="sm" icon="SignOut">
            Sign out
          </Button>
        </form>
      </header>
      <main id="page" tabIndex={-1} className="mx-auto w-full max-w-page px-gutter pt-4 pb-12 outline-none md:pt-5">
        {children}
      </main>
    </div>
  );
}
