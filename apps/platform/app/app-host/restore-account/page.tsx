import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { SignOutButton } from "@brandbasket/shared/ui/panel/sign-out-button";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { EntryScreen } from "@/components/panel/entry-screen";
import { getCustomerAccess } from "@/lib/server/customer-access";
import { loadKeepPlanOffered } from "@/lib/server/keep-plan";
import { signOut } from "@/lib/server/sign-out";
import { keepPlan, restoreAccount } from "./actions";
import { KEEP_PLAN_NOTE, keepPlanRefusal } from "@/lib/keep-plan-copy";

export const metadata: Metadata = { title: "Restore your account" };

interface RestoreAccountPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Never cached: it reads the session and the closure.
export const dynamic = "force-dynamic";

/**
 * Where an account that asked to be deleted lands when it signs in (the dashboard sends it here). It has no dashboard
 * until it is restored; one click brings it back, and signing out leaves the deletion as it was.
 */
export default async function RestoreAccountPage({ searchParams }: RestoreAccountPageProps): Promise<ReactElement> {
  const access = await getCustomerAccess();
  if (access.kind !== "closing") redirect("/");
  const keepOffered = await loadKeepPlanOffered(access.user.id, new Date());
  const refusal = keepPlanRefusal((await searchParams).keep);

  return (
    <EntryScreen
      title={
        <>
          Welcome <em>back.</em>
        </>
      }
      lede="This account is set to be deleted. Restore it to carry on where you left off."
    >
      <p className="text-sm text-ink-soft">
        If you do nothing, it is deleted after <LocalDate iso={access.eraseAfter.toISOString()} />. A paid plan that was
        ending still ends with its paid month{keepOffered ? "." : ": email us if you’d like to keep it going."}
      </p>
      {refusal === null ? null : (
        <p role="alert" className="mt-4 rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {refusal}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <form action={restoreAccount}>
          <Button type="submit">Restore my account</Button>
        </form>
        {keepOffered ? (
          <form action={keepPlan}>
            <SubmitButton variant="secondary" pendingLabel="Opening…">
              Keep my plan
            </SubmitButton>
          </form>
        ) : null}
        <SignOutButton signOut={signOut} />
      </div>
      {keepOffered ? <p className="mt-3 text-sm text-ink-soft">{KEEP_PLAN_NOTE}</p> : null}
    </EntryScreen>
  );
}
