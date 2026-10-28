import { countIncludedEdits, listChangeRequestsForBusiness, type StaffRequestItem } from "@brandbasket/db";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { hoursLabel, includedEditsUsedLine, monthBoundsIst } from "@brandbasket/shared/lib/change-requests";
import { formatMoney } from "@brandbasket/shared/lib/money";
import Link from "next/link";
import type { ReactElement } from "react";
import { moveRequestAction, sendQuoteAction, startWithoutQuoteAction } from "@/app/(protected)/clients/[businessId]/request-actions";
import { buttonDanger, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Quiet, Section } from "@/components/console/section";
import { coverageLabel, staffControls, stateLabel } from "@/lib/request-controls";
import { requestActionLine, type MailOutcome, type RequestActionNotice } from "@/lib/request-notices";
import { getStaffDb } from "@/lib/server/db";
import { requestPricing } from "@/lib/server/request-pricing";

const INDIA_DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
const KIND_LABELS = { website: "Website", social: "Social & Ads", search: "Search", billing: "Billing", other: "Something else" } as const;
const SMALL = `${buttonSecondary} !px-4 !py-2`;

function Ids({ businessId, requestId }: { readonly businessId: string; readonly requestId: string }): ReactElement {
  return (
    <>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="requestId" value={requestId} />
    </>
  );
}

function RequestCard({ item, businessId, unitCents, currency, includedLeft }: { readonly item: StaffRequestItem; readonly businessId: string; readonly unitCents: number | null; readonly currency: "USD" | "INR"; readonly includedLeft: number }): ReactElement {
  const { change } = item;
  const controls = staffControls({ state: change.state, kind: change.kind, accepted: change.acceptedAt !== null }, includedLeft);
  const anyControl = Object.values(controls).some(Boolean);
  const id = `request-${change.id}`;
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="min-w-0 break-words text-base font-semibold">{item.subject}</h3>
        <Link href={`/support/${item.ticketId}`} className="text-sm text-accent underline">
          Open the conversation and reply
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {KIND_LABELS[change.kind]}
        {change.page === null ? "" : `, ${change.page}`} · asked {INDIA_DATE.format(change.createdAt)} · {stateLabel(change.state)} · {coverageLabel(change.coverage)}
      </p>
      {change.quote === null ? null : (
        <p className="mt-1 text-sm tabular-nums">
          Quote: {change.quote.what}, {hoursLabel(change.quote.hours)}, {formatMoney(change.quote.amountCents, change.quote.currency)}, ready {change.quote.workingDays} working days after payment.
          {change.acceptedAt === null ? " Not accepted yet." : ` Accepted ${INDIA_DATE.format(change.acceptedAt)}; charge ${change.chargeStatus ?? "not found"}.`}
        </p>
      )}
      {change.closedReason === null ? null : <p className="mt-1 text-sm">Reason given: {change.closedReason}</p>}
      {anyControl ? (
        <details className="mt-3" open={change.state === "requested"}>
          <summary className="cursor-pointer text-sm font-medium text-ink">What to do with it</summary>
          <div className="mt-4 grid max-w-xl gap-6">
            {controls.quote ? (
              <form action={sendQuoteAction} className="grid gap-3">
                <Ids businessId={businessId} requestId={change.id} />
                <p className="text-sm font-medium">{change.state === "quoted" ? "Send a new quote" : "Send a quote"}</p>
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
                    <p className="mt-1 text-sm text-ink-soft">{unitCents === null ? "This business has no plan to price from." : `${formatMoney(unitCents, currency)} an hour, taken from their plan.`}</p>
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
                <div>
                  <button type="submit" className={SMALL}>
                    Send quote
                  </button>
                </div>
              </form>
            ) : null}
            {controls.includedEdit || controls.noCharge ? (
              <div className="flex flex-wrap gap-3">
                {controls.includedEdit ? (
                  <form action={startWithoutQuoteAction}>
                    <Ids businessId={businessId} requestId={change.id} />
                    <input type="hidden" name="coverage" value="included" />
                    <button type="submit" className={SMALL}>
                      Start as an included edit
                    </button>
                  </form>
                ) : null}
                {controls.noCharge ? (
                  <form action={startWithoutQuoteAction}>
                    <Ids businessId={businessId} requestId={change.id} />
                    <input type="hidden" name="coverage" value="free" />
                    <button type="submit" className={SMALL}>
                      Start at no charge
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            {controls.sendForChecking || controls.markDone ? (
              <div className="flex flex-wrap gap-3">
                {controls.sendForChecking ? (
                  <form action={moveRequestAction}>
                    <Ids businessId={businessId} requestId={change.id} />
                    <input type="hidden" name="to" value="preview" />
                    <button type="submit" className={SMALL}>
                      Send for checking
                    </button>
                  </form>
                ) : null}
                {controls.markDone ? (
                  <form action={moveRequestAction}>
                    <Ids businessId={businessId} requestId={change.id} />
                    <input type="hidden" name="to" value="shipped" />
                    <button type="submit" className={SMALL}>
                      Mark done
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            {controls.decline ? (
              <form action={moveRequestAction} className="grid gap-3">
                <Ids businessId={businessId} requestId={change.id} />
                <input type="hidden" name="to" value="declined" />
                {change.chargeStatus === "paid" ? <p className="text-sm text-accent">The customer has paid for this. Declining does not refund it: refund them yourself.</p> : null}
                <div>
                  <label htmlFor={`${id}-reason`} className={labelClasses}>
                    Decline, and say why (the customer reads it)
                  </label>
                  <input id={`${id}-reason`} name="reason" type="text" required minLength={3} maxLength={300} className={fieldClasses} />
                </div>
                <div>
                  <button type="submit" className={`${buttonDanger} !px-4 !py-2`}>
                    Decline
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </details>
      ) : null}
    </li>
  );
}

/** The customer's change requests on the client page: where each is, and what staff can do with it. */
export async function RequestsSection({
  businessId,
  notice,
  mail,
}: {
  readonly businessId: string;
  readonly notice: RequestActionNotice | null;
  readonly mail: MailOutcome | null;
}): Promise<ReactElement> {
  const db = getStaffDb();
  const now = new Date();
  const [items, pricing, used] = await Promise.all([listChangeRequestsForBusiness(db, businessId), requestPricing(db, businessId, now), countIncludedEdits(db, businessId, monthBoundsIst(now))]);
  const allowed = pricing?.includedAllowed ?? 0;
  const line = notice === null ? null : requestActionLine(notice, mail);
  const waiting = items.filter((item) => item.change.state === "requested").length;
  return (
    <Section title="Change requests" id="requests" aside={waiting === 0 ? undefined : `${waiting} waiting for us`}>
      <p className="max-w-xl text-sm text-ink-soft">
        Changes the customer asked for in their dashboard. Every reply, quote and move here emails them.{" "}
        {allowed === 0 ? "This plan has no included edits." : `Included edits this month: ${includedEditsUsedLine(used, allowed)}.`}
      </p>
      {line === null ? null : (
        <Notice tone={line.ok ? "ok" : "problem"} className="mt-4">
          {line.text}
        </Notice>
      )}
      {items.length === 0 ? (
        <div className="mt-4">
          <Quiet>No requests yet.</Quiet>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {items.map((item) => (
            <RequestCard key={item.change.id} item={item} businessId={businessId} unitCents={pricing?.unitCents ?? null} currency={pricing?.currency ?? "INR"} includedLeft={Math.max(0, allowed - used)} />
          ))}
        </ul>
      )}
    </Section>
  );
}
