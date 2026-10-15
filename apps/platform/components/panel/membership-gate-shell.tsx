import type { ReactElement, ReactNode } from "react";
import { siteConfig } from "@fynix/shared/lib/site-config";
import { ContourField } from "@fynix/shared/ui/contour-field";
import { WordmarkLogo } from "@fynix/shared/ui/logo";
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
 * no sections to show: the logo, a way out, and the page. The same quiet ground as the sign-in screen they came from.
 */
export async function MembershipGateShell({ children }: MembershipGateShellProps): Promise<ReactElement> {
  const brand = await requestBrand();
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-5 py-5 sm:px-8 sm:py-6">
      <ContourField seed={11} rings={6} className="absolute -left-80 -top-80 -z-10 size-[48rem] text-accent/10" />
      <ContourField seed={29} rings={6} className="absolute -bottom-80 -right-80 -z-10 size-[48rem] text-accent/10" />

      <header className="flex items-center justify-between gap-4">
        <WordmarkLogo href={brand.siteUrl ?? siteConfig.url} brand={logoOf(brand)} />
        <SignOutButton signOut={signOut} />
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 py-12 sm:py-16">
        {children}
      </main>
    </div>
  );
}
