import type { ReactElement } from "react";
import { formatAdLastDay, formatAdDeadline, formatAdWeek, formatRupees } from "@firstfold/shared/lib/directory/ads";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import type { AdSpotNow } from "@/lib/advertise-spots-now";
import { biddersLabel, SPOT_HINTS, SPOT_NAMES } from "@/lib/advertise-spots";
import type { AdWeek } from "@/lib/server/directory-ads";

/*
 * Every place an ad can show on Firstfold Local, one row each: what is showing there now and until when, and what the
 * next auction for it looks like. No boxes: a hairline between rows and the facts in two short columns. A place
 * staff have not opened is listed too, as "Opening soon", so the owner sees the whole map.
 */

const DOT = " · ";

function Now({ spot }: { readonly spot: AdSpotNow }): ReactElement {
  if (spot.holders.length === 0) {
    return <p className="text-sm text-ink-soft">No ad yet. Every spot is free.</p>;
  }
  const free = spot.totalSpots - spot.holders.length;
  // Ads booked for different stretches each say when they end; ads that end together share one line.
  const endTimes = new Set(spot.holders.map((holder) => holder.endsAt.getTime()));
  const sharedEnd = endTimes.size === 1 ? spot.holders[0]?.endsAt : undefined;
  return (
    <div className="text-sm">
      <ul className="space-y-0.5">
        {spot.holders.map((holder) => (
          <li key={holder.spot} className="flex min-w-0 items-center gap-2">
            <span className={holder.mine ? "truncate font-semibold" : "truncate"}>{holder.name}</span>
            {holder.mine ? <span className="shrink-0 rounded-full bg-accent px-2 py-px text-[0.6875rem] font-semibold text-paper">You</span> : null}
            {sharedEnd === undefined ? <span className="shrink-0 text-xs tabular-nums text-ink-soft">until {formatAdLastDay(holder.endsAt)}</span> : null}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs tabular-nums text-ink-soft">
        {sharedEnd === undefined ? null : `Until ${formatAdLastDay(sharedEnd)}`}
        {sharedEnd !== undefined && free > 0 ? DOT : null}
        {free > 0 ? `${free} free` : null}
      </p>
    </div>
  );
}

function Next({ week, placement }: { readonly week: AdWeek; readonly placement: AdSpotNow["placement"] }): ReactElement {
  const offer = week.offers.find((entry) => entry.placement === placement);
  if (offer === undefined || offer.reservePaise === null) return <p className="text-sm text-ink-soft">Opening soon</p>;
  if (offer.openSpots === 0) {
    return (
      <p className="text-sm text-ink-soft">
        {offer.bookedUntil === null ? `Booked for ${formatAdWeek(week.weekStart)}` : `Booked until ${formatAdLastDay(offer.bookedUntil)}`}
      </p>
    );
  }
  return (
    <div className="text-sm">
      <p className="tabular-nums">
        From {formatRupees(offer.reservePaise)}
        <span className="text-ink-soft">
          {DOT}
          {formatAdWeek(week.weekStart)}
        </span>
      </p>
      <p className="mt-1 text-xs tabular-nums text-ink-soft">
        {biddersLabel(offer.bidders, offer.myBidPaise !== null)}
        {DOT}closes {formatAdDeadline(week.closesAt)}
      </p>
    </div>
  );
}

export function SpotBoard({ spots, weeks }: { readonly spots: readonly AdSpotNow[]; readonly weeks: readonly AdWeek[] }): ReactElement | null {
  const week = weeks[0];
  if (week === undefined) return null;
  return (
    <ul className="mt-2 divide-y divide-line">
      {spots.map((spot) => {
        const offer = week.offers.find((entry) => entry.placement === spot.placement);
        const bidding = offer !== undefined && offer.reservePaise !== null && offer.openSpots > 0;
        return (
          <li key={spot.placement} className="grid gap-x-8 gap-y-3 py-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_8rem] sm:items-center">
            <div className="min-w-0">
              <h3 className="font-serif text-xl leading-tight">{SPOT_NAMES[spot.placement]}</h3>
              <p className="mt-1 text-[0.8125rem] text-ink-soft">{SPOT_HINTS[spot.placement]}</p>
            </div>
            <Now spot={spot} />
            <Next week={week} placement={spot.placement} />
            <div className="sm:text-right">
              {bidding ? (
                <ButtonLink href={`/advertise?spot=${spot.placement}&week=${week.weekStart}#bid`} size="sm" variant="secondary">
                  {offer.myBidPaise === null ? "Bid" : "Update bid"}
                </ButtonLink>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
