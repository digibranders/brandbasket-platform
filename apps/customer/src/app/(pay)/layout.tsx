import Image from "next/image";
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/entry/components/sign-out-button";
import { LinkButton } from "@/ui";

/**
 * The focused frame for the questions, the checkout and the payment pages: the logo, then the page, with no workspace around
 * it (plan 61, section 3). An account that has not paid has no dashboard yet, so the header carries the ways out: Help,
 * Settings and Sign out.
 */
export default function PayLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-topbar items-center gap-2 border-b border-border bg-surface px-4 md:px-8">
        <div className="flex flex-1 items-center">
          {/* The workspace sidebar's logo, at its size. */}
          <Image src="/brand/brandbasket-logo-horizontal-light.svg" alt="Brandbasket" width={130} height={22} unoptimized priority />
        </div>
        <LinkButton href="/help" variant="ghost">
          Help
        </LinkButton>
        <LinkButton href="/settings" variant="ghost">
          Settings
        </LinkButton>
        <SignOutButton />
      </header>
      <main id="page" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
