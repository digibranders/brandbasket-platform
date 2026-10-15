import type { ReactElement, ReactNode } from "react";
import { BrandAbout } from "@/components/panel/membership/brand-about";
import { SignOutButton } from "@fynix/shared/ui/panel/sign-out-button";
import { logoOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { signOut } from "@/lib/server/sign-out";

interface MembershipGateShellProps {
  readonly children: ReactNode;
}

/**
 * The page around the membership's payment for an owner who chose Premium at sign-up and has not paid yet (docs/
 * superpowers/specs/2026-09-30-single-entry-premium-design.md). They have no dashboard until they pay, so there are
 * no sections to show: the logo (which says what the product is, and goes nowhere), a way out, and the page. The same quiet ground as the sign-in screen they came from.
 */
export async function MembershipGateShell({ children }: MembershipGateShellProps): Promise<ReactElement> {
  const brand = await requestBrand();
  return (
    <div className="relative isolate flex min-h-dvh flex-col px-5 py-5 sm:px-8 sm:py-6">
      <header className="flex items-center justify-between gap-4">
        {/* Not a link: someone paying is not sent away. Pressed, it says what the product is. */}
        <BrandAbout brand={logoOf(brand)} about={brand.about} />
        <SignOutButton signOut={signOut} label="Go back" />
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 py-12 sm:py-16">
        {children}
      </main>
    </div>
  );
}
