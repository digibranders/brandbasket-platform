import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { DeleteAccountFlow } from "@/components/panel/delete-account-flow";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { PageFrame } from "@/components/v2/page";
import { planClosureFor } from "@/lib/account-exit-rules";
import { hasRunningAddOnsFor, loadPackageEndsFor } from "@/lib/server/account-exit";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { deleteAccountAction } from "../actions";

export const metadata: Metadata = { title: "Delete account" };

/** When the member's paid plan ends, if one is running: the paid period's end. Null for an account with no plan. */
function planEndsAt(subscription: Awaited<ReturnType<typeof requireCustomerAccess>>["billing"]["subscription"], now: Date): string | null {
  if (planClosureFor(subscription) === "none" || planClosureFor(subscription) === "drop-unpaid") return null;
  const paidThrough = subscription?.paidThroughAt ?? null;
  return paidThrough !== null && paidThrough.getTime() > now.getTime() ? paidThrough.toISOString() : null;
}

/** Deleting the account: the walk-through in components/panel/delete-account-flow.tsx. Open to every kind of account. */
export default async function DeleteAccountPage(): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const { billing } = customer;
  const [addOnsRunning, packageEnds] = await Promise.all([hasRunningAddOnsFor(customer), loadPackageEndsFor(customer)]);

  return (
    <PageFrame
      title="Delete account"
      lede="Close your account and end your plan."
      width="form"
      action={
        <Link href="/settings" className={SOFT_BUTTON}>
          Back to Settings
        </Link>
      }
    >
      <DeleteAccountFlow
        deleteAccount={deleteAccountAction}
        planEndsAt={planEndsAt(billing.subscription, new Date())}
        addOnsRunning={addOnsRunning}
        packageEnds={packageEnds}
      />
    </PageFrame>
  );
}
