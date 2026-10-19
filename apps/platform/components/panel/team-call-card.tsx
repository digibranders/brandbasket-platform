"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactElement } from "react";
import { CallSlotPicker } from "@/components/panel/call-slot-picker";
import { callInviteHref } from "@brandbasket/shared/lib/call-slots";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import { Button, ExternalButtonLink } from "@brandbasket/shared/ui/panel/button";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";

interface TeamCallCardProps {
  /** The booking page staff set in the console. */
  readonly url: string;
  /** The call already booked, when it is still ahead; a call that has taken place is not shown, so another can be booked. */
  readonly upcoming: { readonly startsAtIso: string; readonly endsAtIso: string | null } | null;
  /** Null for an account with no real email address, which cannot be sent an invitation: it books on the booking page instead. */
  readonly email: string | null;
}

/**
 * A call with the team after setup: while the website is built, reviewed or live. Closed by default, so the stage card above
 * stays the one thing to do; "Book a call" opens the dashboard's own calendar. A booked call shows its time and can be moved.
 * Where times cannot be offered here, the button opens the booking page in a new tab.
 */
export function TeamCallCard({ url, upcoming, email }: TeamCallCardProps): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pageInstead, setPageInstead] = useState(email === null);
  const [justBooked, setJustBooked] = useState<{ readonly startsAtIso: string; readonly endsAtIso: string } | null>(null);
  const call = justBooked ?? upcoming;

  const onBooked = useCallback(
    (booked: { readonly startsAtIso: string; readonly endsAtIso: string }): void => {
      setJustBooked(booked);
      setOpen(false);
      router.refresh();
    },
    [router],
  );
  const onUnavailable = useCallback((): void => {
    setPageInstead(true);
    setOpen(false);
  }, []);

  return (
    <section aria-labelledby="team-call-heading" className="rounded-shell bg-paper-deep p-6 sm:p-8">
      <h2 id="team-call-heading" className="panel-title">
        {open ? "Pick a time" : "Talk to our team"}
      </h2>
      {open ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {call === null ? "Thirty minutes with our team, by video call." : "Your current time stays until you confirm a new one."}
          </p>
          <div className="mt-6">
            <CallSlotPicker onBooked={onBooked} onUnavailable={onUnavailable} />
          </div>
          <Button type="button" variant="quiet" size="sm" className="mt-4" onClick={() => setOpen(false)}>
            {call === null ? "Not now" : "Keep my current time"}
          </Button>
        </>
      ) : (
        <>
          {call === null ? (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
              Questions about your website, a change you have in mind, or anything else: book thirty minutes with us.
            </p>
          ) : (
            <div className="mt-4 rounded-card bg-card p-5 sm:p-6">
              <p className="text-sm text-ink-soft">Your call is booked for</p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-ink tabular-nums">
                <LocalDateTime iso={call.startsAtIso} />
              </p>
              <p className="mt-1 text-sm text-ink-soft">You’ll get an email with the details and the video link.</p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {pageInstead ? (
              <ExternalButtonLink href={url} target="_blank" rel="noopener noreferrer" variant={call === null ? "primary" : "secondary"} size="md" className="group">
                {call === null ? "Book a call" : "Change time"}
                <span className="sr-only"> (opens in a new tab)</span>
                <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
              </ExternalButtonLink>
            ) : (
              <Button type="button" variant={call === null ? "primary" : "secondary"} onClick={() => setOpen(true)}>
                {call === null ? "Book a call" : "Change time"}
              </Button>
            )}
            {call === null || call.endsAtIso === null ? null : (
              <ExternalButtonLink href={callInviteHref(call.startsAtIso, call.endsAtIso)} download="brandbasket-call.ics" variant="quiet" size="sm">
                Add to calendar
              </ExternalButtonLink>
            )}
          </div>
        </>
      )}
    </section>
  );
}
