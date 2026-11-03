import type { ReactNode } from "react";

/** The entry frame for sign in, sign up and reset: one centred column on a plain surface (plan 60, Entry template). */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <main id="page" className="flex min-h-dvh items-center justify-center bg-surface px-4 py-8">
      <div className="flex w-full max-w-100 flex-col gap-4">{children}</div>
    </main>
  );
}
