"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import type { DirectoryAdPlacement } from "@firstfold/db";
// The subpath, not the package index: the index pulls in the database.
import { chargedAmountCents } from "@firstfold/billing/tax";
import { cn } from "@firstfold/shared/lib/cn";
import { formatMoney } from "@firstfold/shared/lib/money";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { RuleInput } from "@firstfold/shared/ui/forms/rule-input";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { useBrand } from "@/components/panel/brand-provider";
import { brandText } from "@/lib/brand";
import { biddersLabel, SPOT_HINTS, SPOT_NAMES } from "@/lib/advertise-spots";
import { AdPreview, type AdPreviewData } from "@/components/panel/advertise/ad-preview";
import type { BidPanelOffer, BidPanelWeek } from "@/lib/advertise-view";

/*
 * Bidding as one decision at a time: pick the week, tap one of the four places an ad can show (each drawn as a small
 * sketch of its page; the chosen one shows the business's own name), and enter a bid. The owner sees the most it could
 * cost with GST before bidding, that losing costs nothing, and the four dates that follow. A place staff have not
 * opened yet is shown but cannot be chosen. Every rule is checked again on the server (saveBidAction); what this
 * checks first is only to answer sooner.
 */

interface BidPanelProps {
  /** The weeks taking bids, soonest first. Never empty. */
  readonly weeks: readonly BidPanelWeek[];
  /** Where each placement can be seen on the website; null for the business page, which is every business's. */
  readonly pageHrefs: Readonly<Record<DirectoryAdPlacement, string | null>>;
  /** Shown in the chosen spot, so the picture is the owner's own ad. */
  readonly businessName: string;
  /** What the ad will look like on the website: the business's own name, line and picture. */
  readonly preview: AdPreviewData;
  /** Where to start: what was last bid on, so the page comes back to it. */
  readonly initialWeek: string | null;
  readonly initialPlacement: DirectoryAdPlacement | null;
  /** GST on a won spot, in basis points. */
  readonly taxBasisPoints: number;
  /** A form action that redirects back to this page with a notice. */
  readonly action: (formData: FormData) => Promise<void>;
}

/** One tap raises the bid by this much. */
const STEP_RUPEES = 100;
const MAX_RUPEES = 100_000;
/** The most digits a bid has: MAX_RUPEES is six. */
const BID_DIGITS = String(MAX_RUPEES).length;
const BID_PATTERN = `[0-9]{1,${String(BID_DIGITS)}}`;
const DOT = " · ";

const CHIP =
  "rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium tabular-nums text-ink-soft ring-1 ring-inset ring-ink-soft/65 transition-colors duration-300 ease-calm hover:bg-paper-deep hover:text-ink";

function rupees(paise: number): string {
  return formatMoney(paise, "INR");
}

/** Whether a placement is taking bids this week: staff have opened it, and staff-placed ads do not hold every spot. */
function taking(offer: BidPanelOffer): boolean {
  return offer.reservePaise !== null && offer.openSpots > 0;
}

/** The spot to open on: the one asked for, else one already bid on, else the first still open. */
function startingPlacement(week: BidPanelWeek, wanted: DirectoryAdPlacement | null): DirectoryAdPlacement {
  const offers = week.offers;
  const pick =
    offers.find((offer) => offer.placement === wanted && offer.reservePaise !== null) ??
    offers.find((offer) => offer.myBidPaise !== null) ??
    offers.find(taking) ??
    offers.find((offer) => offer.reservePaise !== null) ??
    offers[0];
  return pick?.placement ?? "home";
}

/**
 * What the bid box starts on: the owner's own bid, else the lowest bid. It never starts above the lowest: what the
 * spot went for last week is shown beside it and is one tap away, but the page does not choose a higher bid for them.
 */
function startingRupees(offer: BidPanelOffer): string {
  return String((offer.myBidPaise ?? offer.reservePaise ?? 0) / 100);
}

/** A whole number of rupees, or null for anything else typed. */
function readRupees(text: string): number | null {
  const cleaned = text.trim().replaceAll(",", "");
  return /^[0-9]{1,6}$/.test(cleaned) ? Number(cleaned) : null;
}

/**
 * A tiny sketch of the page a placement is on, drawn in the button's own colour: the faint shapes are the page, the
 * solid one is where the ad sits.
 */
function SpotSketch({ placement }: { readonly placement: DirectoryAdPlacement }): ReactElement {
  const page = "rounded-[2px] bg-current opacity-25";
  const ad = "rounded-[2px] bg-current";
  return (
    <span aria-hidden="true" className="block h-11 w-16 shrink-0">
      {placement === "home" ? (
        <span className="grid h-full grid-cols-3 grid-rows-2 gap-1">
          <span className={cn(ad, "col-span-2 row-span-2")} />
          <span className={ad} />
          <span className={ad} />
        </span>
      ) : placement === "top" ? (
        <span className="grid h-full content-start gap-1">
          <span className={cn(ad, "h-3")} />
          <span className={cn(page, "h-2")} />
          <span className={cn(page, "h-2")} />
          <span className={cn(page, "h-2")} />
        </span>
      ) : placement === "side" ? (
        <span className="grid h-full grid-cols-[1.6fr_1fr] gap-1">
          <span className="grid content-start gap-1">
            <span className={cn(page, "h-2")} />
            <span className={cn(page, "h-2")} />
            <span className={cn(page, "h-2")} />
          </span>
          <span className="grid grid-rows-2 gap-1">
            <span className={ad} />
            <span className={ad} />
          </span>
        </span>
      ) : (
        <span className="grid h-full grid-rows-[0.9fr_1.6fr] gap-1">
          <span className={page} />
          <span className="grid grid-cols-[1.5fr_1fr] gap-1">
            <span className={page} />
            <span className={ad} />
          </span>
        </span>
      )}
    </span>
  );
}

function spotState(offer: BidPanelOffer): string {
  if (offer.reservePaise === null) return "Opening soon";
  if (offer.openSpots === 0) return offer.bookedUntil === null ? "Booked" : `Booked until ${offer.bookedUntil}`;
  if (offer.myBidPaise !== null) return `Your bid ${rupees(offer.myBidPaise)}`;
  return `From ${rupees(offer.reservePaise)}`;
}

function SpotButton({
  offer,
  selected,
  onSelect,
  businessName,
}: {
  readonly offer: BidPanelOffer;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly businessName: string;
}): ReactElement {
  const closed = offer.reservePaise === null;
  const state = spotState(offer);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={closed}
      aria-pressed={selected}
      aria-label={`${SPOT_NAMES[offer.placement]}, ${state}`}
      className={cn(
        "flex min-w-0 items-center gap-3.5 rounded-control px-3.5 py-3 text-left transition-colors duration-300 ease-calm",
        selected ? "bg-accent text-paper" : "bg-paper text-ink ring-1 ring-inset ring-ink-soft/65 hover:bg-card",
        closed && "cursor-not-allowed opacity-55 hover:bg-paper",
      )}
    >
      <SpotSketch placement={offer.placement} />
      <span className="min-w-0">
        {/* Chosen, the spot becomes the ad itself: the business's name with the Ad mark, as the page shows it. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("truncate text-[0.875rem] font-semibold", selected && "font-serif text-[1rem] font-medium")}>
            {selected ? businessName : SPOT_NAMES[offer.placement]}
          </span>
          {selected ? <span className="shrink-0 rounded-full px-1.5 py-px text-[0.6875rem] font-semibold ring-1 ring-inset ring-paper/70">Ad</span> : null}
        </span>
        <span className={cn("mt-0.5 block text-xs tabular-nums", selected ? "text-paper" : "text-ink-soft")}>
          {selected ? `${SPOT_NAMES[offer.placement]}${DOT}${state}` : state}
        </span>
      </span>
    </button>
  );
}

/** The four places an ad can show, each a sketch of its page: tapping one chooses it. */
function SpotPicker({
  week,
  placement,
  onSelect,
  businessName,
}: {
  readonly week: BidPanelWeek;
  readonly placement: DirectoryAdPlacement;
  readonly onSelect: (placement: DirectoryAdPlacement) => void;
  readonly businessName: string;
}): ReactElement {
  return (
    <div role="group" aria-label="Where your ad shows" className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {week.offers.map((offer) => (
        <SpotButton key={offer.placement} offer={offer} selected={placement === offer.placement} onSelect={() => onSelect(offer.placement)} businessName={businessName} />
      ))}
    </div>
  );
}

function Timeline({ week }: { readonly week: BidPanelWeek }): ReactElement {
  const steps = [
    { title: "Bid", when: `until ${week.closes}` },
    { title: "Result", when: `from ${week.closes}` },
    { title: "Pay if you win", when: `by ${week.payBy}` },
    { title: "Ad shows", when: week.range },
  ];
  return (
    <ol className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span aria-hidden="true" className={cn("block size-2.5 rounded-full", index === 0 ? "bg-accent" : "ring-[1.5px] ring-inset ring-ink-soft/65")} />
          <p className="mt-2 text-[0.8125rem] font-semibold">{step.title}</p>
          <p className="mt-0.5 text-xs tabular-nums text-ink-soft">{step.when}</p>
        </li>
      ))}
    </ol>
  );
}

export function BidPanel({
  weeks,
  pageHrefs,
  businessName,
  preview,
  initialWeek,
  initialPlacement,
  taxBasisPoints,
  action,
}: BidPanelProps): ReactElement | null {
  const brand = useBrand();
  const firstWeek = weeks.find((week) => week.weekStart === initialWeek) ?? weeks[0];
  const [weekStart, setWeekStart] = useState(firstWeek?.weekStart ?? "");
  const [placement, setPlacement] = useState<DirectoryAdPlacement>(() =>
    firstWeek === undefined ? "home" : startingPlacement(firstWeek, initialPlacement),
  );
  const week = weeks.find((entry) => entry.weekStart === weekStart) ?? firstWeek;
  const offer = week?.offers.find((entry) => entry.placement === placement) ?? week?.offers[0];
  const [amount, setAmount] = useState(() => (offer === undefined ? "" : startingRupees(offer)));
  // Whether the bid has been changed since the spot was chosen: the reason it is refused shows only after that.
  const [edited, setEdited] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);
  // The lowest-bid and + chips set the amount without typing, so tell the form its field changed: its submit button
  // re-checks completeness on that event.
  useEffect(() => {
    amountInput.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [amount]);
  if (week === undefined || offer === undefined) return null;

  function choose(nextWeek: BidPanelWeek, nextPlacement: DirectoryAdPlacement): void {
    const nextOffer = nextWeek.offers.find((entry) => entry.placement === nextPlacement);
    setWeekStart(nextWeek.weekStart);
    setPlacement(nextPlacement);
    setEdited(false);
    if (nextOffer !== undefined) setAmount(startingRupees(nextOffer));
  }

  const typed = readRupees(amount);
  const reservePaise = offer.reservePaise ?? 0;
  const reserveRupees = reservePaise / 100;
  const valid = typed !== null && typed >= reserveRupees && typed <= MAX_RUPEES;
  const lowering = offer.myBidPaise !== null && typed !== null && typed * 100 < offer.myBidPaise;
  const notOpen = offer.reservePaise === null;
  const booked = !notOpen && offer.openSpots === 0;
  const pageHref = pageHrefs[offer.placement];

  function fill(next: string): void {
    setAmount(next);
    setEdited(true);
  }

  /** Why the typed bid cannot be placed, or null when it can. The server checks every rule again. */
  const bidProblem =
    typed === null
      ? "Enter a whole number of rupees."
      : typed < reserveRupees
        ? `The lowest bid is ${rupees(reservePaise)}.`
        : typed > MAX_RUPEES
          ? `The highest bid is ${rupees(MAX_RUPEES * 100)}.`
          : lowering && !week.canLower
            ? "In the last day before bidding closes, a bid can only go up."
            : null;

  const problem = edited ? bidProblem : null;

  // A zero bid has nothing to charge tax on (chargedAmountCents refuses it): it shows no total, as an empty box does.
  const total = valid && typed !== null && typed > 0 ? chargedAmountCents(typed * 100, 0, taxBasisPoints) : null;
  // One business holds one of the list page's spots a week, so with bids on both it helps to know which one it would get.
  const bidOnBoth = ["top", "side"].every((name) => week.offers.some((entry) => entry.placement === name && entry.myBidPaise !== null));

  return (
    <div>
      {weeks.length < 2 ? null : (
        <div role="group" aria-label="Week" className="flex flex-wrap gap-1.5">
          {weeks.map((entry) => (
            <button
              key={entry.weekStart}
              type="button"
              aria-pressed={entry.weekStart === week.weekStart}
              onClick={() => choose(entry, startingPlacement(entry, placement))}
              className={cn(
                "rounded-full px-4 py-2 text-sm tabular-nums transition-colors duration-300 ease-calm",
                entry.weekStart === week.weekStart ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink",
              )}
            >
              {entry.label}
              {DOT}
              {entry.range}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        <SpotPicker week={week} placement={placement} onSelect={(next) => choose(week, next)} businessName={businessName} />
      </div>

      <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
        <AdPreview placement={placement} data={preview} brand={brand} />

        <div className="min-w-0">
          <h3 className="font-serif text-2xl leading-tight">{SPOT_NAMES[offer.placement]}</h3>
          <p className="mt-1 text-sm text-ink-soft">{SPOT_HINTS[offer.placement]}</p>
          <p className="mt-3 text-[0.8125rem] tabular-nums text-ink-soft">
            {biddersLabel(offer.bidders, offer.myBidPaise !== null)}
            {offer.lastPaise === null ? null : `${DOT}last week it went for ${rupees(offer.lastPaise)}`}
            {offer.totalSpots > 1 && offer.openSpots > 0 && offer.openSpots < offer.totalSpots
              ? `${DOT}${offer.openSpots} ${offer.openSpots === 1 ? "spot" : "spots"} left`
              : null}
          </p>
          {pageHref === null ? null : (
            <p className="mt-1.5 text-xs">
              <a href={pageHref} target="_blank" rel="noopener noreferrer" className="link-underline text-ink">
                See where it shows
              </a>
            </p>
          )}

          {notOpen ? (
            <p className="mt-6 flex items-center gap-2.5 text-[0.9375rem] font-medium">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full ring-[1.5px] ring-inset ring-ink-soft/65" />
              Not open for bids yet
            </p>
          ) : booked ? (
            <div className="mt-6">
              <p className="flex items-center gap-2.5 text-[0.9375rem] font-medium">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full ring-[1.5px] ring-inset ring-ink-soft/65" />
                {offer.bookedUntil === null ? "Booked for this week" : `Booked until ${offer.bookedUntil}`}
              </p>
              {offer.bookedUntil === null ? null : (
                <p className="mt-2 max-w-sm text-sm text-ink-soft">
                  {brandText("Firstfold has this spot booked for that whole time, so it takes no bids until then. It opens to bidding again after that.", brand)}
                </p>
              )}
            </div>
          ) : (
            <form action={action} noValidate className="mt-6">
              <input type="hidden" name="placement" value={offer.placement} />
              <input type="hidden" name="week" value={week.weekStart} />
              <label htmlFor="bid-amount" className="text-[0.8125rem] text-ink-soft">
                Your bid for the week <RequiredMark />
              </label>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <div className="relative w-44">
                  <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-ink-soft">
                    ₹
                  </span>
                  <RuleInput
                    rule="digits"
                    id="bid-amount"
                    name="amount"
                    required
                    pattern={BID_PATTERN}
                    maxLength={BID_DIGITS}
                    title={`Whole rupees, up to ${MAX_RUPEES.toLocaleString("en-IN")}`}
                    autoComplete="off"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setEdited(true);
                    }}
                    // A bid the rules refuse holds the Place bid button back; the reason shows on submit or when it is fixed.
                    ref={(input) => {
                      amountInput.current = input;
                      input?.setCustomValidity(bidProblem ?? "");
                    }}
                    aria-invalid={problem === null ? undefined : true}
                    aria-describedby="bid-cost bid-problem"
                    className="block w-full rounded-control border border-ink-soft/65 bg-paper py-2.5 pl-9 pr-4 text-lg tabular-nums text-ink transition-colors duration-300 ease-calm focus:border-accent"
                  />
                </div>
                <SubmitButton size="sm">{offer.myBidPaise === null ? "Place bid" : "Update bid"}</SubmitButton>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={CHIP} onClick={() => fill(String(reserveRupees))}>
                  Lowest {rupees(reservePaise)}
                </button>
                {offer.lastPaise === null || offer.lastPaise === offer.reservePaise ? null : (
                  <button type="button" className={CHIP} onClick={() => fill(String((offer.lastPaise ?? 0) / 100))}>
                    Last week {rupees(offer.lastPaise)}
                  </button>
                )}
                <button type="button" className={CHIP} onClick={() => fill(String((typed ?? reserveRupees) + STEP_RUPEES))}>
                  + {rupees(STEP_RUPEES * 100)}
                </button>
              </div>

              <p id="bid-problem" role="status" className={cn("mt-3 text-sm text-accent-deep", problem === null && "hidden")}>
                {problem}
              </p>
              {/* One line for the cost: the ceiling with GST, then what it is made of and that losing is free. */}
              <div id="bid-cost" className="mt-4">
                {total !== null && typed !== null ? (
                  <>
                    <p className="text-[0.9375rem] font-medium tabular-nums">You pay at most {rupees(total)}</p>
                    <p className="mt-1 text-sm tabular-nums text-ink-soft">
                      {rupees(typed * 100)} + {rupees(total - typed * 100)} GST. Often less, and nothing if you don&rsquo;t win.
                    </p>
                  </>
                ) : problem === null ? (
                  <p className="text-[0.9375rem] font-medium tabular-nums">Bids start at {rupees(reservePaise)}</p>
                ) : null}
              </div>
              {bidOnBoth ? <p className="mt-3 text-sm text-ink-soft">You&rsquo;ve bid on both spots. You can win one: the top, if both bids win.</p> : null}

              {offer.myBidPaise === null ? null : week.canLower ? (
                <button type="submit" name="intent" value="withdraw" formNoValidate className="link-underline mt-4 text-sm text-ink-soft hover:text-ink">
                  Withdraw this bid
                </button>
              ) : (
                <p className="mt-4 text-sm text-ink-soft">This close to the result, a bid can only go up.</p>
              )}
            </form>
          )}
        </div>
      </div>

      <Timeline week={week} />
    </div>
  );
}
