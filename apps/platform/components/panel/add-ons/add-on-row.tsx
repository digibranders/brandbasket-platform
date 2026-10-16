import type { ReactElement, ReactNode } from "react";
import { requestBrand } from "@/lib/server/request-brand";
import { LIFETIME_OFFER_PERCENT } from "@fynix/shared/lib/billing/lifetime-offer";
import { PREMIUM_ADD_ON_DISCOUNT_PERCENT, type AddOn, type AddOnPrice } from "@fynix/shared/lib/billing/add-ons";
import type { AddOnAction, AddOnCheckoutIntent } from "@fynix/shared/lib/billing/add-on-state";
import { formatMoney } from "@fynix/shared/lib/money";
import { endAddOnAction, removeBundledAddOnAction, startAddOnAction } from "@/app/app-host/(protected)/add-ons/actions";
import { BundledAddOnRemove } from "@/components/panel/add-ons/bundled-add-on-remove";
import { AddOnCheckoutDialog } from "@/components/panel/add-ons/add-on-checkout-dialog";
import { AddOnEndConfirm } from "@/components/panel/add-ons/add-on-end-confirm";
import {
  addOnActionLabel,
  addOnDate,
  addOnStateLine,
  BROKEN_ADD_ON_LINE,
  checkoutCopy,
  dayOfMonthLabel,
  keepDateOf,
} from "@/lib/billing/add-on-copy";
import type { AddOnInvoiceNote } from "@/lib/billing/add-on-form";
import type { AddOnPageEntry } from "@/lib/server/add-ons";

interface AddOnRowProps {
  readonly addOn: AddOn;
  /** The add-on's state from the server, or null when there is none to show (it is then just "Get it"). */
  readonly entry: AddOnPageEntry | null;
  /** What it costs this business: the stored price while it is in force, else today's. */
  readonly price: AddOnPrice;
  readonly now: Date;
  readonly invoice: AddOnInvoiceNote;
  /** Anything that belongs under the row. */
  readonly children?: ReactNode;
}

const CHECKOUT_ACTIONS: readonly AddOnAction[] = ["buy", "resume", "pay-now", "keep"];

function isCheckoutIntent(action: AddOnAction): action is AddOnCheckoutIntent {
  return CHECKOUT_ACTIONS.includes(action);
}

/**
 * One service: what it is and where it runs on the left, its price, what it is doing now and the buttons on the right.
 * The state line is a live region that is always in the page, so a change after Pause or Cancel is announced. Pause and
 * Cancel confirm in place; every other action opens the purchase dialog.
 */
export async function AddOnRow({ addOn, entry, price, now, invoice, children }: AddOnRowProps): Promise<ReactElement> {
  const brand = await requestBrand();
  const headingId = `add-on-${addOn.id}-heading`;
  const monthly = addOn.billing === "monthly";
  const ready = entry !== null && entry.kind === "ready" ? entry : null;
  const view = ready === null ? null : ready.view;
  // A Keep it with no old billing date to charge on cannot be shown. The server already treats that row as broken and
  // logs it; this keeps the row from throwing if one ever gets here anyway.
  const keepsWithoutDate = ready !== null && ready.actions.includes("keep") && keepDateOf(ready.view) === null;
  const broken = (entry !== null && entry.kind === "broken") || keepsWithoutDate;
  const included = entry !== null && entry.kind === "included";
  const actions: readonly AddOnAction[] = broken || included ? [] : ready === null ? ["buy"] : ready.actions;
  const includedEntry = entry !== null && entry.kind === "included" ? entry : null;
  const stateLine = broken
    ? BROKEN_ADD_ON_LINE
    : includedEntry !== null
      ? includedEntry.endsOn === null
        ? "Included in your monthly plan payment."
        : `Stops on ${addOnDate(includedEntry.endsOn)}. You won't be charged for it after that.`
      : view === null
        ? null
        : addOnStateLine(view, price);
  const checkoutAction = actions.find(isCheckoutIntent);
  // Pause and Cancel are only offered on a running add-on, and act on the row the server names.
  const endTargetId = ready !== null && view !== null && view.state === "active" ? ready.endTargetId : null;
  // The state line is said in a warning colour only for a payment that is not going through, or a row that is broken.
  const warning = broken || (view !== null && (view.state === "failing" || view.state === "failed"));

  let dialog: ReactElement | null = null;
  if (checkoutAction !== undefined) {
    const date = checkoutAction === "keep" && view !== null ? keepDateOf(view) : null;
    const label = addOnActionLabel(checkoutAction, addOn.title);
    dialog = (
      <AddOnCheckoutDialog
        addOnId={addOn.id}
        title={addOn.title}
        line={addOn.line}
        intent={checkoutAction}
        triggerText={label.text}
        triggerLabel={label.ariaLabel}
        price={price}
        discountPercent={PREMIUM_ADD_ON_DISCOUNT_PERCENT}
        copy={checkoutCopy({
          intent: checkoutAction,
          addOnId: addOn.id,
          title: addOn.title,
          monthly,
          chargeDate: date === null ? null : addOnDate(date),
          renewDay: monthly ? dayOfMonthLabel(date ?? now) : null,
          brand,
        })}
        invoice={invoice}
        action={startAddOnAction}
      />
    );
  }

  return (
    <li className="py-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        <div className="min-w-0">
          <h2 id={headingId} tabIndex={-1} className="panel-section outline-none">
            {addOn.title}
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-ink-soft">{addOn.line}</p>
          {addOn.platforms === undefined ? null : (
            <ul aria-label={`${addOn.title} runs on`} className="mt-4 flex flex-wrap gap-2">
              {addOn.platforms.map((platform) => (
                <li key={platform} className="rounded-full bg-paper-deep px-3 py-1 text-xs text-ink-soft">
                  {platform}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-4 sm:max-w-xs sm:items-end sm:text-right">
          <div>
            {price.discountCents > 0 ? (
              <p className="text-sm tabular-nums text-ink-soft line-through">{formatMoney(price.listCents, price.currency)}</p>
            ) : null}
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(price.netCents, price.currency)}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{addOn.extra === undefined ? addOn.unit : `${addOn.unit} ${addOn.extra}`}</p>
            {price.offerCents > 0 ? (
              <p className="mt-1 text-sm text-accent-deep">{LIFETIME_OFFER_PERCENT}% lifetime discount</p>
            ) : null}
          </div>
          <p
            role="status"
            className={`text-sm tabular-nums empty:hidden ${warning ? "text-accent-deep" : "text-ink-soft"}`}
          >
            {stateLine}
          </p>
          {dialog}
          {includedEntry !== null && includedEntry.endsOn === null && includedEntry.nextBillingOn !== null ? (
            <BundledAddOnRemove
              addOn={addOn.id}
              title={addOn.title}
              endsOn={addOnDate(includedEntry.nextBillingOn)}
              headingId={headingId}
              action={removeBundledAddOnAction}
            />
          ) : null}
          {endTargetId !== null && view !== null && view.state === "active" ? (
            <AddOnEndConfirm
              addOnSubscriptionId={endTargetId}
              title={addOn.title}
              endsOn={addOnDate(view.renewsOn)}
              headingId={headingId}
              action={endAddOnAction}
            />
          ) : null}
        </div>
      </div>
      {children === undefined ? null : <div className="mt-6">{children}</div>}
    </li>
  );
}
