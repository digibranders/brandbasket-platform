import type { ReactNode } from "react";

/**
 * The entry frame for sign in, sign up and reset (plan 60, Entry template; mock Auth screen): the form in a centred column,
 * and a plain brand panel beside it that phones leave out.
 */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <main id="page" className="grid min-h-dvh grid-cols-1 bg-surface md:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-8 md:p-8">
        <div className="flex w-full max-w-100 flex-col gap-4">
          <p className="type-section text-ink">Brandbasket</p>
          {children}
        </div>
      </div>
      <div className="hidden items-center justify-center border-l border-border bg-sidebar p-12 md:flex">
        <p className="max-w-95 type-section text-ink">We build your website, run your social media and get you found on Google. You run your business.</p>
      </div>
    </main>
  );
}
