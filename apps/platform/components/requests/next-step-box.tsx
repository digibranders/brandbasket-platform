import type { ReactElement } from "react";
import { payChargeAction } from "@/app/app-host/(protected)/billing/actions";
import { approveChangeAction, declineQuoteAction, reopenRequestAction } from "@/app/app-host/(protected)/requests/move-actions";
import { acceptQuoteAction } from "@/app/app-host/(protected)/requests/pay-actions";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import type { NextStep } from "@/lib/requests/status";

interface NextStepBoxProps {
  readonly step: NextStep;
  readonly requestId: string;
  readonly ticketId: string;
}

/** The ids a move needs. Only ids: the business comes from the session and the database checks the rest. */
function Ids({ requestId, ticketId }: Pick<NextStepBoxProps, "requestId" | "ticketId">): ReactElement {
  return (
    <>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="ticketId" value={ticketId} />
    </>
  );
}

/**
 * What happens next, under the stepper. When the request waits on the customer it holds the page's only dark button, with
 * the price and the date it unlocks; a soft button beside it is "Not now" or "Reopen".
 */
export function NextStepBox({ step, requestId, ticketId }: NextStepBoxProps): ReactElement {
  const { action, secondary, quote } = step;
  return (
    <section aria-labelledby="next-step-title" className="mx-5 mt-4 grid gap-2.5 rounded-[0.625rem] bg-rattan-wash px-3.5 py-3">
      <div>
        <h3 id="next-step-title" className="text-[0.84375rem] font-semibold text-ink">
          {step.title}
        </h3>
        <p className="mt-0.5 text-[0.84375rem] leading-relaxed text-ink">{step.text}</p>
      </div>
      {quote === null ? null : (
        <p className="flex justify-between gap-3 border-t border-rattan-ink/20 pt-2 text-[0.84375rem]">
          <span className="text-ink-2">{quote.line}</span>
          <b className="font-figure font-semibold tabular-nums">{quote.total}</b>
        </p>
      )}
      {action === null && secondary === null ? null : (
        <div className="flex flex-wrap gap-2">
          {action?.kind === "accept" ? (
            <form action={acceptQuoteAction}>
              <Ids requestId={requestId} ticketId={ticketId} />
              <button type="submit" className={DARK_BUTTON}>
                {action.label}
              </button>
            </form>
          ) : null}
          {action?.kind === "pay" ? (
            <form action={payChargeAction}>
              <input type="hidden" name="chargeId" value={action.chargeId} />
              <button type="submit" className={DARK_BUTTON}>
                {action.label}
              </button>
            </form>
          ) : null}
          {action?.kind === "approve" ? (
            <form action={approveChangeAction}>
              <Ids requestId={requestId} ticketId={ticketId} />
              <button type="submit" className={DARK_BUTTON}>
                {action.label}
              </button>
            </form>
          ) : null}
          {secondary === null ? null : (
            <form action={secondary.kind === "decline" ? declineQuoteAction : reopenRequestAction}>
              <Ids requestId={requestId} ticketId={ticketId} />
              <button type="submit" className={SOFT_BUTTON}>
                {secondary.label}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
