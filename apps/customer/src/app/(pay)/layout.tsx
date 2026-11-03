import type { ReactNode } from "react";
import { SignOutButton } from "@/features/entry/components/sign-out-button";
import { BRAND } from "@/features/entry/rules/brand";
import { LinkButton } from "@/ui";

/**
 * The focused frame for the questions, the checkout and the payment pages: the name, then the page, with no workspace around
 * it (plan 61, section 3). An account that has not paid has no dashboard yet, so the header carries the two ways out: Help
 * (an email to support, since the workspace's Help stays behind the unpaid hold) and Sign out.
 */
export default function PayLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-topbar items-center gap-2 border-b border-border bg-surface px-4 md:px-8">
        <p className="flex-1 type-section text-ink">Brandbasket</p>
        <LinkButton href={`mailto:${BRAND.contactEmail}`} variant="ghost">
          Help
        </LinkButton>
        <SignOutButton />
      </header>
      <main id="page" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
