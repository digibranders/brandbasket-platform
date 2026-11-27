import Image from "next/image";
import Link from "next/link";
import { SIGN_IN_PATH } from "@/features/entry/rules/account-entry";
import { PAY_LINK_GONE_MESSAGE } from "../rules";

/*
 * The two plain pages a payment link can end on without a checkout: it no longer works, or it belongs to an account that has to sign in
 * first. Each says as little as it can: nothing about the deal, the customer or why.
 */

function Frame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex h-topbar items-center border-b border-border bg-surface px-4 md:px-8">
        <Image src="/brand/brandbasket-logo-horizontal-light.svg" alt="Brandbasket" width={130} height={22} unoptimized priority />
      </header>
      <main id="page" className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-12 md:px-8">
        {children}
      </main>
    </div>
  );
}

export function LinkGone() {
  return (
    <Frame>
      <h1 className="type-title text-ink">Payment link</h1>
      <p className="type-body text-ink-2">{PAY_LINK_GONE_MESSAGE}</p>
    </Frame>
  );
}

export function LinkSignIn() {
  return (
    <Frame>
      <h1 className="type-title text-ink">Sign in to pay</h1>
      <p className="type-body text-ink-2">This payment link is for a Brandbasket account. Sign in to that account to see what is agreed and pay.</p>
      <p>
        <Link href={SIGN_IN_PATH}>Sign in</Link>
      </p>
    </Frame>
  );
}
