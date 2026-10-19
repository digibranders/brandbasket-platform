import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { Button } from "@brandbasket/shared/ui/panel/button";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { SignOutButton } from "@brandbasket/shared/ui/panel/sign-out-button";
import { EntryScreen } from "@/components/panel/entry-screen";
import { getCustomerAccess } from "@/lib/server/customer-access";
import { signOut } from "@/lib/server/sign-out";
import { restoreAccount } from "./actions";

export const metadata: Metadata = { title: "Restore your account" };

// Never cached: it reads the session and the closure.
export const dynamic = "force-dynamic";

/**
 * Where an account that asked to be deleted lands when it signs in (the dashboard sends it here). It has no dashboard
 * until it is restored; one click brings it back, and signing out leaves the deletion as it was.
 */
export default async function RestoreAccountPage(): Promise<ReactElement> {
  const access = await getCustomerAccess();
  if (access.kind !== "closing") redirect("/");

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
        ending still ends with its paid month: email us if you’d like to keep it going.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <form action={restoreAccount}>
          <Button type="submit">Restore my account</Button>
        </form>
        <SignOutButton signOut={signOut} />
      </div>
    </EntryScreen>
  );
}
