"use client";

import { callInviteHref } from "@brandbasket/shared/lib/call-slots";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Panel } from "@/components";
import { formatDateTime, formatTime } from "@/lib/format";
import { Banner, Button, Icon } from "@/ui";
import { buttonClasses } from "@/ui/button-styles";
import { bookKickoffAction } from "../actions";
import { BOOK_PROBLEM_TEXT, bookButtonLabel, dayLabel, promiseDates } from "../rules";
import { SlotChooser, useCallSlots } from "./slot-picker";

/** The words for what the kickoff plans, by service. */
const PLANS: Readonly<Record<"website" | "social" | "search", string>> = { website: "website", social: "social media", search: "search" };

function plansLine(services: readonly ("website" | "social" | "search")[]): string {
  const words = services.map((service) => PLANS[service]);
  if (words.length <= 1) return words[0] ?? "work";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1] ?? ""}`;
}

/** The picker and its Book button: books the kickoff, then refreshes Home into its booked state. */
function KickoffPicker({ showLiveBy, bookingUrl }: { readonly showLiveBy: boolean; readonly bookingUrl: string | null }) {
  const router = useRouter();
  const { state, drop } = useCallSlots();
  const [slot, setSlot] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startBooking] = useTransition();
  const ready = "status" in state && state.status === "ok";

  const book = (): void => {
    if (slot === null) return;
    setProblem(null);
    startBooking(async () => {
      const result = await bookKickoffAction({ startIso: slot, timeZone: "Asia/Kolkata" }).catch(() => ({ ok: false as const, message: BOOK_PROBLEM_TEXT.failed }));
      if (result.ok) {
        router.refresh();
        return;
      }
      setProblem(result.message);
      if (result.message === BOOK_PROBLEM_TEXT.taken) {
        drop(slot);
        setSlot(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <SlotChooser state={state} slot={slot} onSlotChange={setSlot} bookingUrl={bookingUrl} />
      {showLiveBy && slot !== null ? <p className="type-meta">With this time, your website can be live by {dayLabel(promiseDates(slot).liveBy)}.</p> : null}
      {problem === null ? null : <Banner tone="neg">{problem}</Banner>}
      {ready ? (
        <div>
          <Button variant="primary" size="lg" disabled={slot === null} pending={pending} onClick={book}>
            {bookButtonLabel(slot, pending)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface KickoffPanelProps {
  readonly services: readonly ("website" | "social" | "search")[];
  readonly bookingUrl: string | null;
  /** False for a viewer, or an account with no real email address (the invitation could not reach it). */
  readonly canBook: boolean;
  /** Why booking is not possible here, when canBook is false. */
  readonly cannotBookLine: string | null;
  /** The booked call, or null to ask for a booking. */
  readonly booked: { readonly startsAtIso: string | null; readonly endsAtIso: string | null } | null;
  /** The time staff marked as missed, already written, or null. */
  readonly missedLine: string | null;
}

/**
 * Home's kickoff panel (mock: homeWelcome). Unbooked: what the call is, then the picker. Booked: the time, Add to calendar
 * (only with both times) and Change time, which opens the picker again; the new time is booked before the old one is
 * cancelled.
 */
export function KickoffPanel({ services, bookingUrl, canBook, cannotBookLine, booked, missedLine }: KickoffPanelProps) {
  const [changing, setChanging] = useState(false);
  const hasWebsite = services.includes("website");
  const cannotBook =
    cannotBookLine === null ? null : (
      <p className="type-body text-ink-2">
        {cannotBookLine}
        {bookingUrl === null ? null : (
          <>
            {" "}
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              Pick a time on our booking page
            </a>
            .
          </>
        )}
      </p>
    );

  if (booked !== null && !changing) {
    const starts = booked.startsAtIso === null ? null : new Date(booked.startsAtIso);
    const ends = booked.endsAtIso === null ? null : new Date(booked.endsAtIso);
    return (
      <Panel title="Kickoff call booked">
        <div className="flex items-start gap-3">
          <Icon name="CheckCircle" className="text-pos-text" />
          <div className="min-w-0">
            <p className="type-sub text-ink">{starts === null ? "Your kickoff call is booked" : `Your kickoff call is booked for ${ends === null ? formatDateTime(starts) : `${formatDateTime(starts)} to ${formatTime(ends)}`}`}</p>
            <p className="type-meta">Video call. The link is in your email and calendar invite.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {booked.startsAtIso === null || booked.endsAtIso === null ? null : (
            <a className={buttonClasses("secondary", "md")} href={callInviteHref(booked.startsAtIso, booked.endsAtIso)} download="brandbasket-kickoff.ics">
              <Icon name="CalendarBlank" size="sm" />
              Add to calendar
            </a>
          )}
          {canBook ? (
            <Button variant="ghost" onClick={() => setChanging(true)}>
              Change time
            </Button>
          ) : null}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={booked === null ? "Book your kickoff call" : "Pick a new time"}>
      <div className="flex flex-col gap-4">
        {missedLine === null ? null : <p className="type-body text-ink">{missedLine}</p>}
        <p className="type-body text-ink-2">30 minutes on video. We go through your business and plan your {plansLine(services)} with you.</p>
        {canBook ? <KickoffPicker showLiveBy={hasWebsite} bookingUrl={bookingUrl} /> : cannotBook}
        {booked !== null ? (
          <div>
            <Button variant="ghost" onClick={() => setChanging(false)}>
              Keep my time
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
