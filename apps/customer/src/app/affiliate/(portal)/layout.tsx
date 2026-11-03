import type { ReactNode } from "react";
import { signOutAction } from "@/features/entry/actions";
import { requireAffiliate } from "@/lib/guards";
import { Button } from "@/ui";

/**
 * The affiliate's own frame: a stripped header with the one page and Sign out. No Settings and no bell, so an affiliate who is
 * not a customer cannot reach customer screens from here. Password changes come only from a link the team sends. The guard is
 * repeated on the page, because layouts render independently of the pages below them.
 */
export default async function AffiliateLayout({ children }: { readonly children: ReactNode }) {
  await requireAffiliate();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2.5">
        <p className="type-section flex-1">Brandbasket</p>
        <form action={signOutAction}>
          <Button type="submit" size="sm" icon="SignOut">
            Sign out
          </Button>
        </form>
      </header>
      <main id="page" className="mx-auto w-full max-w-page px-gutter pt-4 pb-12 md:pt-5">
        {children}
      </main>
    </div>
  );
}
