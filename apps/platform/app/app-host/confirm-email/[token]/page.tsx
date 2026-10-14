import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { EntryScreen } from "@/components/panel/entry-screen";
import { confirmEmailPath } from "@/lib/account-recovery-form";
import { confirmEmail } from "@/lib/server/account-recovery";

export const metadata: Metadata = { title: "Confirm your email", referrer: "no-referrer" };

export const dynamic = "force-dynamic";

/**
 * Where a confirmation email's link lands: opening it marks the address as its owner's. It changes nothing else and
 * signs nobody in, so a mail scanner opening the link first does no harm, and opening it twice says the same thing.
 */
export default async function ConfirmEmailPage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<ReactElement> {
  const { token } = await params;
  const outcome = await confirmEmail(token);

  if (outcome.kind === "dead-link") {
    return (
      <EntryScreen
        title={
          <>
            This link no longer <em>works.</em>
          </>
        }
        lede="Confirmation links expire after 3 days. Sign in and we'll send you a new one from your dashboard."
      >
        <Link href="/login" className="link-underline">
          Go to sign in
        </Link>
      </EntryScreen>
    );
  }

  if (outcome.kind === "limited" || outcome.kind === "failed") {
    const minutes = outcome.kind === "limited" ? Math.max(1, Math.ceil(outcome.retryAfterSeconds / 60)) : null;
    return (
      <EntryScreen title={<>Please try <em>again.</em></>}
        lede={minutes === null
          ? "We couldn't confirm your email right now. Try this same link again in a moment."
          : `Too many confirmation links have been opened from this network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`}>
        <a href={confirmEmailPath(token)} className="link-underline">Try this link again</a>
      </EntryScreen>
    );
  }

  return (
    <EntryScreen
      title={
        <>
          Your email is <em>confirmed.</em>
        </>
      }
      lede="Thanks. We'll call the business's number to confirm it's yours, usually within a working day."
    >
      <Link href="/" className="link-underline">
        Go to your dashboard
      </Link>
    </EntryScreen>
  );
}
