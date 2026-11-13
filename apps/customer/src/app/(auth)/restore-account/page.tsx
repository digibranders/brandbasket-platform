import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EntryScreen } from "@/features/entry/components/entry-screen";
import { SignOutButton } from "@/features/entry/components/sign-out-button";
import { KEEP_PLAN_NOTE, keepPlanRefusal } from "@/features/checkout/rules/keep-plan-copy";
import { loadKeepPlanOffer } from "@/features/checkout/server/keep-plan";
import { KeepPlanButton, RestoreButton } from "@/features/restore/components/restore-buttons";
import { findClosingAccount } from "@/features/restore/server";
import { formatDate } from "@/lib/format";
import { requireSignedIn } from "@/lib/guards";
import { Banner } from "@/ui";

export const metadata: Metadata = { title: "Restore your account" };

/**
 * Where an account that asked to be deleted lands (every guard sends it here). It has no workspace until it is restored; one
 * press brings it back, and signing out leaves the deletion as it was. Ported from apps/platform
 * app/app-host/restore-account/page.tsx.
 */
export default async function RestoreAccountPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSignedIn();
  const closing = await findClosingAccount();
  if (closing === null) redirect("/");
  const keepOffer = await loadKeepPlanOffer(closing.user.id, new Date());
  const keepOffered = keepOffer !== null;
  const refusal = keepPlanRefusal((await searchParams).keep);

  return (
    <EntryScreen title="Welcome back" lede="This account is set to be deleted. Restore it to carry on where you left off.">
      <p className="type-body text-ink-3">
        If you do nothing, it is deleted after {formatDate(closing.eraseAfter)}. A paid plan that was ending still ends with its paid month
        {keepOffered ? "." : ": email us if you’d like to keep it going."}
      </p>
      {refusal === null ? null : <Banner tone="neg">{refusal}</Banner>}
      <div className="flex flex-wrap items-center gap-3">
        <RestoreButton />
        {keepOffer === null ? null : <KeepPlanButton summary={keepOffer} />}
        <SignOutButton />
      </div>
      {keepOffered ? <p className="type-meta">{KEEP_PLAN_NOTE}</p> : null}
    </EntryScreen>
  );
}
