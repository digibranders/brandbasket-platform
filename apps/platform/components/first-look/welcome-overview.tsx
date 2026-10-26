import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import type { OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import type { SetupKey } from "@/lib/service-setup";
import { andList, SERVICE_NAMES, serviceWords, type ServiceKey } from "@/lib/first-look";
import type { FirstPaymentView } from "@/lib/server/first-look";
import { LIFT } from "@/components/v2/classes";
import { BookedLine } from "./booked-line";
import { KickoffPicker } from "./kickoff-picker";
import { NextSteps } from "./next-steps";
import { ReadyPreview, ReadyTask } from "./ready-list";

interface WelcomeOverviewProps {
  readonly firstName: string;
  readonly services: readonly ServiceKey[];
  readonly payment: FirstPaymentView | null;
  /** The kickoff booking, or null before one is made. Its times are null when the booking page did not report them. */
  readonly call: { readonly startsAtIso: string | null; readonly endsAtIso: string | null } | null;
  readonly bookingUrl: string | null;
  readonly doneSteps: readonly OnboardingStepKey[];
  readonly doneSetup: readonly SetupKey[];
  /** False for an account without a real email address: the invitation could not reach it. */
  readonly canBook: boolean;
}

/** Overview until the kickoff call has happened (plan 28 section 3): one button, and the answers beside it. */
export function WelcomeOverview({ firstName, services, payment, call, bookingUrl, doneSteps, doneSetup, canBook }: WelcomeOverviewProps): ReactElement {
  const hasWebsite = services.includes("website");
  const booked = call !== null;
  return (
    <div className="mx-auto grid w-full max-w-[68rem] gap-5">
      <header>
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-ink">Welcome, {firstName}. Your plan is active.</h1>
        {payment === null ? null : (
          <p className="mt-2 text-[0.84375rem] text-ink-2">
            <CheckCircle size={17} weight="fill" aria-hidden="true" className="mr-1 inline -translate-y-px align-middle text-sage" />
            Paid <span className="tabular-nums">{payment.amount}</span> on {payment.paidOn}
            {services.length === 0 ? "" : ` for ${andList(services.map((service) => SERVICE_NAMES[service]))}`}.{" "}
            <a href={payment.receiptHref} className="font-semibold text-ink underline underline-offset-[3px]">
              Receipt
            </a>
          </p>
        )}
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {booked ? (
          <div className="grid gap-4">
            <BookedLine key={call.startsAtIso ?? "booked"} startsAtIso={call.startsAtIso} endsAtIso={call.endsAtIso} showLiveBy={hasWebsite} bookingUrl={bookingUrl} />
            {services.length === 0 ? null : <ReadyTask services={services} doneSteps={doneSteps} doneSetup={doneSetup} />}
            <p className="text-[0.8125rem] text-ink-2">Add what you can now; bring the rest to the call. Everything saves as you go.</p>
          </div>
        ) : (
          <section aria-labelledby="kickoff-title" className={cn(LIFT, "grid gap-4 p-5")}>
            <div>
              <span className="inline-flex rounded-md bg-rattan-wash px-2 py-0.5 text-xs font-semibold text-rattan-ink">First step</span>
              <h2 id="kickoff-title" className="mt-2 font-display text-[1.3125rem] font-semibold tracking-[-0.02em] text-ink">
                Book your kickoff call
              </h2>
              <p className="mt-1.5 text-[0.84375rem] leading-relaxed text-ink-2">
                30 minutes on video. We go through your business{services.length === 0 ? "" : ` and plan your ${serviceWords(services)} with you`}.
              </p>
            </div>
            {canBook ? (
              <KickoffPicker showLiveBy={hasWebsite} bookingUrl={bookingUrl} />
            ) : (
              <p className="text-sm text-ink-2">
                Add an email address in Settings to book here
                {bookingUrl === null ? "." : (
                  <>
                    , or{" "}
                    <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">
                      pick a time on our booking page
                    </a>
                    .
                  </>
                )}
              </p>
            )}
          </section>
        )}

        <div className="grid gap-8">
          {booked || services.length === 0 ? null : <ReadyPreview services={services} />}
          <NextSteps hasWebsite={hasWebsite} callStartIso={call?.startsAtIso ?? null} booked={booked} />
        </div>
      </div>
    </div>
  );
}
