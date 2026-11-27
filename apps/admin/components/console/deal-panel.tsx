import type { ReactElement } from "react";
import { markWebsiteReadyAction, undoWebsiteReadyAction } from "@/app/(protected)/clients/[businessId]/website/actions";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { ConfirmSubmit } from "@/components/console/confirm-submit";

/** Where a paid deal stands on the Website tab (plan 66): the advance is paid and the site is being built, it is marked ready and the balance is due, or the balance is paid. */
export interface DealCard {
  readonly state: "building" | "balance_due" | "paid";
  /** When the balance was paid, for the paid state. */
  readonly paidOn?: string;
  /** The balance of the build, worded with its currency. */
  readonly balance: string;
  /** The project is approved, so "Website ready" can be pressed. */
  readonly approved: boolean;
  /** The staff member has the money capability, which both buttons need (their actions refuse anyone else). */
  readonly canChange: boolean;
}

/** The deal's state in words, and the one button for it: Website ready while building (once approved), Undo ready while the balance is due. */
export function DealPanel({ businessId, deal }: { readonly businessId: string; readonly deal: DealCard }): ReactElement {
  const hidden = <input type="hidden" name="businessId" value={businessId} />;
  return (
    <div className="mt-4 max-w-2xl">
      <p className="text-sm text-ink-2">
        {deal.state === "building"
          ? `Advance paid. Balance of ${deal.balance} is due when the website is ready.`
          : deal.state === "balance_due"
            ? `Website marked ready. The customer pays the balance of ${deal.balance} with the first period of their plan, then it can go live.`
            : `Balance of ${deal.balance} paid${deal.paidOn === undefined ? "" : ` on ${deal.paidOn}`}. The website can go live.`}
      </p>
      {deal.state === "building" && deal.approved && deal.canChange ? (
        <form action={markWebsiteReadyAction} className="mt-3">
          {hidden}
          <ConfirmSubmit
            className={buttonPrimary}
            copy={{
              title: "Mark the website ready",
              consequence: `The customer is told and asked to pay the balance of ${deal.balance} with the first period of their plan. The website goes live after that.`,
              confirmLabel: "Website ready",
            }}
          >
            Website ready
          </ConfirmSubmit>
        </form>
      ) : null}
      {deal.state === "balance_due" && deal.canChange ? (
        <form action={undoWebsiteReadyAction} className="mt-3">
          {hidden}
          <ConfirmSubmit
            className={buttonSecondary}
            copy={{ title: "Undo ready", consequence: "The customer is no longer asked to pay the balance until you mark it ready again.", confirmLabel: "Undo ready" }}
          >
            Undo ready
          </ConfirmSubmit>
        </form>
      ) : null}
    </div>
  );
}
