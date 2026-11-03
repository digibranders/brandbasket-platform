import type { ReactNode } from "react";

/**
 * The focused frame for the questions, the checkout and the payment pages: the name, then the page, with no workspace around
 * it (plan 61, section 3). An account that has not paid has no dashboard yet.
 */
export default function PayLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-topbar items-center border-b border-border bg-surface px-4 md:px-8">
        <p className="type-section text-ink">Brandbasket</p>
      </header>
      <main id="page" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
