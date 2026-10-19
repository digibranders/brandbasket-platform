"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactElement } from "react";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import { Button, ExternalButtonLink } from "@brandbasket/shared/ui/panel/button";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { callInviteHref } from "@brandbasket/shared/lib/call-slots";
import { isCalendlyUrl } from "@brandbasket/shared/lib/setup-call-link";
import { recordSetupCallBooked } from "@/app/app-host/(protected)/setup-call-actions";
import { CallSlotPicker } from "@/components/panel/call-slot-picker";
import type { SetupCallBookingView } from "@/lib/server/setup-call";

const CALENDLY_ORIGIN = "https://calendly.com";
const WIDGET_SCRIPT = "https://assets.calendly.com/assets/external/widget.js";
const WIDGET_STYLES = "https://assets.calendly.com/assets/external/widget.css";

/** After a booking, the meeting's time arrives a few seconds later (the booking page tells us); look for it a few times, then stop. */
const TIME_CHECKS_MS: readonly number[] = [4000, 9000, 16000];

interface CalendlyWidget {
  initInlineWidget(options: {
    readonly url: string;
    readonly parentElement: HTMLElement;
    readonly prefill?: { readonly name?: string; readonly email?: string };
    readonly utm?: { readonly utmSource?: string; readonly utmContent?: string };
  }): void;
}

declare global {
  interface Window {
    Calendly?: CalendlyWidget;
  }
}

interface KickoffCallCardProps {
  /** The booking page staff set in the console, or null when there is none. */
  readonly url: string | null;
  readonly booking: SetupCallBookingView | null;
  /** Filled in for the customer so they do not retype it; the email is null for an account with no real address. */
  readonly prefill: { readonly name: string; readonly email: string | null };
  /** Sent with the booking so the booking page's report finds its way back to this business. */
  readonly businessId: string;
}

/** The booking page with the customer's name and email filled in, in the dashboard's own colour. */
function embedAddress(url: string): string {
  const address = new URL(url);
  address.searchParams.set("hide_gdpr_banner", "1");
  address.searchParams.set("primary_color", "0c1e2e");
  return address.toString();
}

/** Loads Calendly's widget once for the page, then runs `ready` when it is there. */
function withCalendly(ready: (calendly: CalendlyWidget) => void): () => void {
  let cancelled = false;
  const run = (): void => {
    if (!cancelled && window.Calendly !== undefined) ready(window.Calendly);
  };
  if (window.Calendly !== undefined) {
    run();
    return () => {
      cancelled = true;
    };
  }
  if (document.querySelector(`link[href="${WIDGET_STYLES}"]`) === null) {
    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = WIDGET_STYLES;
    document.head.appendChild(styles);
  }
  let script = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SCRIPT}"]`);
  if (script === null) {
    script = document.createElement("script");
    script.src = WIDGET_SCRIPT;
    script.async = true;
    document.body.appendChild(script);
  }
  script.addEventListener("load", run);
  return () => {
    cancelled = true;
    script?.removeEventListener("load", run);
  };
}

function Embed({ url, prefill, businessId, onBooked }: Pick<KickoffCallCardProps, "url" | "prefill" | "businessId"> & { readonly url: string; readonly onBooked: (inviteeUri: unknown) => void }): ReactElement {
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const parent = container.current;
    if (parent === null) return;
    const stopLoading = withCalendly((calendly) => {
      parent.replaceChildren();
      calendly.initInlineWidget({
        url: embedAddress(url),
        parentElement: parent,
        prefill: { name: prefill.name, ...(prefill.email === null ? {} : { email: prefill.email }) },
        utm: { utmSource: "dashboard", utmContent: businessId },
      });
    });
    const onMessage = (event: MessageEvent): void => {
      // Only Calendly's own page may say a time was picked.
      if (event.origin !== CALENDLY_ORIGIN) return;
      const data: unknown = event.data;
      if (typeof data !== "object" || data === null || (data as { event?: unknown }).event !== "calendly.event_scheduled") return;
      const payload = (data as { payload?: { invitee?: { uri?: unknown } } }).payload;
      onBooked(payload?.invitee?.uri);
    };
    window.addEventListener("message", onMessage);
    return () => {
      stopLoading();
      window.removeEventListener("message", onMessage);
    };
  }, [url, prefill.name, prefill.email, businessId, onBooked]);

  return <div ref={container} aria-label="Pick a time for your kickoff call" className="min-h-[41rem] w-full overflow-hidden rounded-control bg-card" />;
}

/**
 * The first thing a customer does after paying: pick a time for the kickoff call. A Calendly page is shown right here in the
 * dashboard; any other booking page opens in a new tab; with no page set, the team arranges it. When the customer picks a time
 * the dashboard notes it (so it stops asking), and the card turns into a confirmation with the time once the booking page has
 * reported it.
 */
export function KickoffCallCard({ url, booking, prefill, businessId }: KickoffCallCardProps): ReactElement {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // The time of a call booked in this visit: both null when the booking page's own widget reported it, which cannot say when.
  const [justBooked, setJustBooked] = useState<{ readonly startsAtIso: string | null; readonly endsAtIso: string | null } | null>(null);
  // Times are offered in our own calendar; when they cannot be (no scheduling set up here, or no email to invite), the booking page is shown.
  const [pageInstead, setPageInstead] = useState(false);
  const booked = booking !== null || justBooked !== null;
  const startsAtIso = justBooked?.startsAtIso ?? booking?.startsAtIso ?? null;
  const endsAtIso = justBooked?.endsAtIso ?? booking?.endsAtIso ?? null;
  const [changing, setChanging] = useState(false);
  const waitingForTime = booked && startsAtIso === null;
  const minutes = startsAtIso === null || endsAtIso === null ? null : Math.round((new Date(endsAtIso).getTime() - new Date(startsAtIso).getTime()) / 60_000);
  const ownCalendar = prefill.email !== null && !pageInstead;

  useEffect(() => {
    if (!waitingForTime) return;
    const timers = TIME_CHECKS_MS.map((delay) => window.setTimeout(() => router.refresh(), delay));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [waitingForTime, router]);

  // Stable, so the booking page is set up once and not again on every render.
  const onBooked = useCallback(
    (inviteeUri: unknown): void => {
      setJustBooked({ startsAtIso: null, endsAtIso: null });
      startTransition(async () => {
        await recordSetupCallBooked(inviteeUri);
        router.refresh();
      });
    },
    [router],
  );

  const onPicked = useCallback(
    (call: { readonly startsAtIso: string; readonly endsAtIso: string }): void => {
      setJustBooked(call);
      setChanging(false);
      router.refresh();
    },
    [router],
  );
  const onUnavailable = useCallback((): void => setPageInstead(true), []);

  return (
    <section aria-labelledby="kickoff-call-heading" className="rounded-shell bg-paper-deep p-6 sm:p-8">
      {booked ? (
        changing && ownCalendar ? (
          <>
            <h2 id="kickoff-call-heading" className="panel-title">
              Pick a new time
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">Your current time stays until you confirm a new one.</p>
            <div className="mt-6">
              <CallSlotPicker onBooked={onPicked} onUnavailable={onUnavailable} />
            </div>
            <Button type="button" variant="quiet" size="sm" className="mt-4" onClick={() => setChanging(false)}>
              Keep my current time
            </Button>
          </>
        ) : (
        <>
          <h2 id="kickoff-call-heading" className="panel-title">
            Your kickoff call is booked
          </h2>
          <div className="mt-4 rounded-card bg-card p-5 sm:p-6">
            {startsAtIso === null ? (
              <p className="text-lg font-medium text-ink">Checking the time with the calendar…</p>
            ) : (
              <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
                <LocalDateTime iso={startsAtIso} />
              </p>
            )}
            <p className="mt-1 text-[0.9375rem] text-ink-soft">
              {minutes === null ? "Video call with the Brandbasket team" : `${String(minutes)} minutes, video call with the Brandbasket team`}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {startsAtIso === null || endsAtIso === null ? null : (
                <ExternalButtonLink href={callInviteHref(startsAtIso, endsAtIso)} download="brandbasket-kickoff-call.ics" variant="secondary" size="sm">
                  Add to calendar
                </ExternalButtonLink>
              )}
              {ownCalendar ? (
                <Button type="button" variant="quiet" size="sm" onClick={() => setChanging(true)}>
                  Change time
                </Button>
              ) : url === null ? null : (
                <ExternalButtonLink href={url} target="_blank" rel="noopener noreferrer" variant="quiet" size="sm" className="group">
                  Book a different time
                  <span className="sr-only"> (opens in a new tab)</span>
                  <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
                </ExternalButtonLink>
              )}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-ink-soft">
              You’ll get an email with the details and the video link. Fill in the checklist before the call so we can use the time well.
            </p>
          </div>
          <div className="mt-6">
            <p className="text-sm font-medium text-ink">On the call</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-soft">
              <li>We go through your business, your customers and the pages you need.</li>
              <li>You choose the look and feel, and we agree the plan for the build.</li>
              <li>You leave knowing the date your website goes live.</li>
            </ul>
          </div>
        </>
        )
      ) : (
        <>
          <h2 id="kickoff-call-heading" className="panel-title">
            Book your kickoff call
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Thirty minutes with our team. We plan your website together, and you leave knowing what happens next.
          </p>
          <div className="mt-6">
            {url === null ? (
              <p className="rounded-card bg-card p-6 text-sm leading-relaxed text-ink-soft">Our team will email you to arrange a time for the call.</p>
            ) : ownCalendar ? (
              <CallSlotPicker onBooked={onPicked} onUnavailable={onUnavailable} />
            ) : isCalendlyUrl(url) ? (
              <Embed url={url} prefill={prefill} businessId={businessId} onBooked={onBooked} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <ExternalButtonLink href={url} target="_blank" rel="noopener noreferrer" size="md" className="group">
                  Pick a time
                  <span className="sr-only"> (opens in a new tab)</span>
                  <ArrowIcon className="size-4 shrink-0 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
                </ExternalButtonLink>
                {/* A booking made on another site cannot be seen from here, so the customer says when they have booked. */}
                <Button type="button" variant="secondary" onClick={() => onBooked(null)}>
                  I’ve booked a time
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
