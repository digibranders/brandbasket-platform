import type { ReactElement } from "react";
import type { IntakeSummaryRow } from "@brandbasket/shared/lib/intake/questions";
import { KickoffPicker } from "@/components/first-look/kickoff-picker";
import { LIFT } from "@/components/v2/classes";
import { slotLabel } from "@/lib/call-dates";
import { serviceWords, type ServiceKey } from "@/lib/first-look";
import type { ClientHomeState } from "@/lib/home/state";
import { Countdown } from "./countdown";
import { KickoffActions } from "./kickoff-actions";
import { StatusHero } from "./status-hero";

const HANDY = ["Your logo, in any format", "Photos of your place, your team or your work", "What you offer, and the prices", "Websites you like the look of", "Links to your social pages"] as const;

function Covering({ rows, services }: { readonly rows: readonly IntakeSummaryRow[]; readonly services: readonly ServiceKey[] }): ReactElement {
  return (
    <section aria-labelledby="home-cover" className="grid gap-3 rounded-control bg-sunken p-5">
      <div>
        <h3 id="home-cover" className="font-display text-lg font-semibold text-ink">
          What we will cover
        </h3>
        <p className="text-[0.8125rem] text-ink-3">{rows.length === 0 ? "We will go through your answers together." : "Built from what you told us before paying."}</p>
      </div>
      <ul className="grid gap-2.5 text-[0.9375rem] text-ink">
        {rows.map((row) => (
          <li key={row.field}>
            <span className="text-ink-2">{row.label}: </span>
            {row.value}
          </li>
        ))}
        {rows.length === 0 && services.length > 0 ? <li>How your {serviceWords(services)} will work for you</li> : null}
        <li>What happens after the call</li>
      </ul>
    </section>
  );
}

/** The kickoff states: book it, or the call that is booked, with its countdown. Nothing is asked of the customer before the call. */
export function KickoffHome({
  state,
  services,
  intake,
  bookingUrl,
  canBook,
  nowMs,
}: {
  readonly state: Extract<ClientHomeState, { kind: "kickoff_unbooked" | "kickoff_booked" }>;
  readonly services: readonly ServiceKey[];
  readonly intake: readonly IntakeSummaryRow[];
  readonly bookingUrl: string | null;
  /** False for an account without a real email address: the invitation could not reach it. */
  readonly canBook: boolean;
  readonly nowMs: number;
}): ReactElement {
  const hasWebsite = services.includes("website");
  const hero =
    state.kind === "kickoff_unbooked" ? (
      <StatusHero
        labelId="home-status"
        word="First step"
        tone="brand"
        title="Book your kickoff"
        aside={<Covering rows={intake} services={services} />}
        actions={
          canBook ? (
            <div className="w-full">
              <KickoffPicker showLiveBy={hasWebsite} bookingUrl={bookingUrl} />
            </div>
          ) : (
            <p className="text-[0.9375rem] text-ink-2">
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
          )
        }
      >
        Your plan is active. A 30 minute video call with your team is the next step. Nothing is needed from you before it.
      </StatusHero>
    ) : (
      <StatusHero
        labelId="home-status"
        word="Kickoff booked"
        tone="brand"
        title={state.startsAt === null ? "Your kickoff is booked" : `Your kickoff is ${slotLabel(state.startsAt.toISOString())}`}
        aside={<Covering rows={intake} services={services} />}
        actions={
          <>
            {state.startsAt === null ? null : <Countdown startsAtMs={state.startsAt.getTime()} nowMs={nowMs} />}
            <KickoffActions startsAtIso={state.startsAt?.toISOString() ?? null} endsAtIso={state.endsAt?.toISOString() ?? null} showLiveBy={hasWebsite} bookingUrl={bookingUrl} />
          </>
        }
      >
        {state.startsAt === null ? "Your booking is confirmed. The time is in your confirmation email, with the video link." : "A 30 minute video call to understand your business and how you want to come across. The video link is in your confirmation email."}
      </StatusHero>
    );
  return (
    <>
      {hero}
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="home-handy" className={`${LIFT} grid content-start gap-3 p-6`}>
          <div>
            <h2 id="home-handy" className="font-display text-lg font-semibold text-ink">
              If you already have these, keep them handy
            </h2>
            <p className="text-[0.9375rem] text-ink-2">None of this is required. If you do not have something, we sort it out together.</p>
          </div>
          <ul className="divide-y divide-line rounded-control border border-line">
            {HANDY.map((item) => (
              <li key={item} className="px-4 py-3 text-[0.9375rem] text-ink">
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="home-next" className={`${LIFT} grid content-start gap-3 p-6`}>
          <h2 id="home-next" className="font-display text-lg font-semibold text-ink">
            What happens next
          </h2>
          <ol className="grid gap-3 text-[0.9375rem] text-ink">
            <li>
              <b className="font-semibold">The kickoff call.</b> <span className="text-ink-2">We talk it through together.</span>
            </li>
            {hasWebsite ? (
              <>
                <li>
                  <b className="font-semibold">We build your first preview.</b> <span className="text-ink-2">It is ready within 48 hours of the call.</span>
                </li>
                <li>
                  <b className="font-semibold">You review it here.</b> <span className="text-ink-2">Approve it, or tell us what to change.</span>
                </li>
                <li>
                  <b className="font-semibold">Your website goes live.</b> <span className="text-ink-2">On your own address, and we keep it running.</span>
                </li>
              </>
            ) : null}
            {services.includes("social") ? (
              <li>
                <b className="font-semibold">We plan your posts.</b> <span className="text-ink-2">You approve them here before anything goes out.</span>
              </li>
            ) : null}
            {services.includes("search") ? (
              <li>
                <b className="font-semibold">We start on local search.</b> <span className="text-ink-2">Your first report arrives after the first month.</span>
              </li>
            ) : null}
          </ol>
        </section>
      </div>
    </>
  );
}
