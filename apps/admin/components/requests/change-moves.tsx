import type { ChangeView } from "@brandbasket/db";
import { hoursLabel, includedEditsUsedLine } from "@brandbasket/shared/lib/change-requests";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { ReactElement } from "react";
import { moveRequestAction, sendQuoteAction, startWithoutQuoteAction } from "@/app/(protected)/clients/[businessId]/request-actions";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { coverageLabel, staffControls } from "@/lib/request-controls";
import type { RequestPricing } from "@/lib/server/request-pricing";

const INDIA_DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });

function Ids({ businessId, requestId }: { readonly businessId: string; readonly requestId: string }): ReactElement {
  return (
    <>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="requestId" value={requestId} />
    </>
  );
}

function Hidden({ name, value }: { readonly name: string; readonly value: string }): ReactElement {
  return <input type="hidden" name={name} value={value} />;
}

/**
 * What staff can do with a change request, inside the Requests panel and page. Every move emails the customer, so each one
 * goes through a dialog that names the email; there is no undo for a sent email. The actions are the existing ones: they
 * move the request and then show the client's Requests tab with the outcome.
 */
export function ChangeMoves({ change, requesterName, pricing, includedUsed }: { readonly change: ChangeView; readonly requesterName: string; readonly pricing: RequestPricing | null; readonly includedUsed: number }): ReactElement {
  const allowed = pricing?.includedAllowed ?? 0;
  const controls = staffControls({ state: change.state, kind: change.kind, accepted: change.acceptedAt !== null }, Math.max(0, allowed - includedUsed));
  const anyControl = Object.values(controls).some(Boolean);
  const id = `change-${change.id}`;
  return (
    <section aria-label="Change request" className="grid gap-3 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">Change request</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-2">Asked</dt>
        <dd className="font-figure">{INDIA_DATE.format(change.createdAt)}</dd>
        <dt className="text-ink-2">Coverage</dt>
        <dd>{coverageLabel(change.coverage)}</dd>
        {change.quote === null ? null : (
          <>
            <dt className="text-ink-2">Quote</dt>
            <dd>
              {change.quote.what}, {hoursLabel(change.quote.hours)}, <span className="font-figure">{formatMoney(change.quote.amountCents, change.quote.currency)}</span>, ready {change.quote.workingDays} working days after payment.
              {change.acceptedAt === null ? " Not accepted yet." : ` Accepted ${INDIA_DATE.format(change.acceptedAt)}; charge ${change.chargeStatus ?? "not found"}.`}
            </dd>
          </>
        )}
        {change.closedReason === null ? null : (
          <>
            <dt className="text-ink-2">Reason given</dt>
            <dd>{change.closedReason}</dd>
          </>
        )}
        <dt className="text-ink-2">Included edits</dt>
        <dd>{allowed === 0 ? "This plan has no included edits." : `${includedEditsUsedLine(includedUsed, allowed)} this month`}</dd>
      </dl>
      {anyControl ? (
        <>
          <p className="rounded-[10px] bg-sunken px-3 py-2 text-sm">
            <b>Every move below emails {requesterName}.</b> Each one asks you to confirm first and names the email. A sent email cannot be unsent.
          </p>
          <div className="flex flex-wrap gap-2">
            {controls.quote ? (
              <ConfirmDialog
                variant="default"
                triggerLabel={change.state === "quoted" ? "Send a new quote" : "Send a quote"}
                title={`Email the quote to ${requesterName}?`}
                consequence="They see the quote in their email and can pay it from their dashboard. A sent email cannot be unsent."
                confirmLabel="Send quote"
                formAction={sendQuoteAction}
              >
                <Ids businessId={change.businessId} requestId={change.id} />
                <div className="mb-5 grid gap-3">
                  <div>
                    <label htmlFor={`${id}-what`} className={labelClasses}>
                      What the quote is for
                      <RequiredMark />
                    </label>
                    <input id={`${id}-what`} name="what" type="text" required minLength={3} maxLength={80} placeholder="New page" className={fieldClasses} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`${id}-hours`} className={labelClasses}>
                        Hours
                        <RequiredMark />
                      </label>
                      <input id={`${id}-hours`} name="hours" type="number" required min={1} max={40} step={1} inputMode="numeric" className={fieldClasses} />
                      <p className="mt-1 text-sm text-ink-2">{pricing === null ? "This business has no plan to price from." : `${formatMoney(pricing.unitCents, pricing.currency)} an hour, taken from their plan.`}</p>
                    </div>
                    <div>
                      <label htmlFor={`${id}-days`} className={labelClasses}>
                        Working days to ready, after payment
                        <RequiredMark />
                      </label>
                      <input id={`${id}-days`} name="workingDays" type="number" required min={1} max={30} step={1} defaultValue={5} inputMode="numeric" className={fieldClasses} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`${id}-note`} className={labelClasses}>
                      A few words to go with it (optional)
                    </label>
                    <textarea id={`${id}-note`} name="note" rows={3} maxLength={2000} className={fieldClasses} />
                  </div>
                </div>
              </ConfirmDialog>
            ) : null}
            {controls.includedEdit ? (
              <ConfirmDialog variant="default" triggerLabel="Start as an included edit" title="Start this as an included edit?" consequence={`${requesterName} is emailed that the work has started. No payment is asked for.`} confirmLabel="Start and email" formAction={startWithoutQuoteAction}>
                <Ids businessId={change.businessId} requestId={change.id} />
                <Hidden name="coverage" value="included" />
              </ConfirmDialog>
            ) : null}
            {controls.noCharge ? (
              <ConfirmDialog variant="default" triggerLabel="Start at no charge" title="Start this at no charge?" consequence={`${requesterName} is emailed that the work has started. No payment is asked for.`} confirmLabel="Start and email" formAction={startWithoutQuoteAction}>
                <Ids businessId={change.businessId} requestId={change.id} />
                <Hidden name="coverage" value="free" />
              </ConfirmDialog>
            ) : null}
            {controls.sendForChecking ? (
              <ConfirmDialog variant="default" triggerLabel="Send for checking" title="Send this for checking?" consequence={`${requesterName} is emailed that it is ready to check.`} confirmLabel="Send and email" formAction={moveRequestAction}>
                <Ids businessId={change.businessId} requestId={change.id} />
                <Hidden name="to" value="preview" />
              </ConfirmDialog>
            ) : null}
            {controls.markDone ? (
              <ConfirmDialog variant="default" triggerLabel="Mark done" title="Mark this done?" consequence={`${requesterName} is emailed that the change is done.`} confirmLabel="Mark done and email" formAction={moveRequestAction}>
                <Ids businessId={change.businessId} requestId={change.id} />
                <Hidden name="to" value="shipped" />
              </ConfirmDialog>
            ) : null}
            {controls.decline ? (
              <ConfirmDialog triggerLabel="Decline" title="Decline this change?" consequence={`${requesterName} is emailed that the change was declined, with the reason you give. This cannot be undone.${change.chargeStatus === "paid" ? " They have paid for it, and declining does not refund it: refund them yourself." : ""}`} confirmLabel="Decline and email" formAction={moveRequestAction}>
                <Ids businessId={change.businessId} requestId={change.id} />
                <Hidden name="to" value="declined" />
                <div className="mb-5">
                  <label htmlFor={`${id}-reason`} className={labelClasses}>
                    Why (the customer reads it)
                    <RequiredMark />
                  </label>
                  <input id={`${id}-reason`} name="reason" type="text" required minLength={3} maxLength={300} className={fieldClasses} />
                </div>
              </ConfirmDialog>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
