import type { ReactElement, ReactNode } from "react";
import { BrandAbout } from "@/components/panel/membership/brand-about";
import { legalLinksFor } from "@/lib/legal-links";
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
 * no sections to show: the logo (which says what the product is, and goes nowhere), a way out, the page and a one-line footer. The same quiet ground as the sign-in screen they came from.
 */
export async function MembershipGateShell({ children }: MembershipGateShellProps): Promise<ReactElement> {
  const brand = await requestBrand();
  const legal = legalLinksFor(brand);
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

      {/* One quiet line, so the page ends instead of stopping: who takes the payment, and where to read the terms or ask for help. */}
      <footer className="mx-auto w-full max-w-5xl border-t border-line pb-20 pt-6 text-xs leading-relaxed text-ink-soft lg:pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>Secure payment. Prices are in rupees and GST is added at checkout.</p>
          <nav aria-label="Legal and help" className="flex flex-wrap gap-x-5 gap-y-1">
            <a href={legal.terms} className="underline-offset-4 transition-colors duration-300 ease-calm hover:text-ink hover:underline">
              Terms
            </a>
            <a href={legal.privacy} className="underline-offset-4 transition-colors duration-300 ease-calm hover:text-ink hover:underline">
              Privacy Notice
            </a>
            <a href={`mailto:${brand.contactEmail}`} className="underline-offset-4 transition-colors duration-300 ease-calm hover:text-ink hover:underline">
              {brand.contactEmail}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
