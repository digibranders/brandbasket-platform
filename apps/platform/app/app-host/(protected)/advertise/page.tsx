import type { Metadata } from "next";

import { EmailUs } from "@/components/panel/email-us";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import type { DirectoryAdMarket, DirectoryAdWin } from "@brandbasket/db";
import {
  AD_MARKER,
  AD_PLACEMENTS,
  AD_TAGLINE_MAX_LENGTH,
  AD_TAX_BASIS_POINTS,
  adChargedPaise,
  formatAdDeadline,
  formatAdWeek,
  formatRupees,
  marketLabel,
  parseAdPlacement,
} from "@brandbasket/shared/lib/directory/ads";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { Button, ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { areaName } from "@brandbasket/shared/lib/directory/places";
import { AdResultsView } from "@/components/panel/advertise/ad-results";
import type { AdPreviewData } from "@/components/panel/advertise/ad-preview";
import { BidPanel } from "@/components/panel/advertise/bid-panel";
import { SpotBoard } from "@/components/panel/advertise/spot-board";
import { PictureCard } from "@/components/panel/pictures/picture-card";
import { StatusLine, type StatusTone } from "@/components/panel/status-line";
import { ADVERTISE_NOTICES, readAdvertiseNotice } from "@/lib/advertise-notices";
import { familyOf } from "@/lib/ad-preview-families";
import { SPOT_NAMES } from "@/lib/advertise-spots";
import { adOutcomes, bidPanelWeeks, MISSED_REASONS, placementPageHref, weekLabel, type AdOutcomes } from "@/lib/advertise-view";
import { profileHref } from "@/lib/business-profile-notices";
import { opensClaimPages } from "@/lib/listing-sections";
import { kindStatus, ownPictureHref, shownPicture, type KindStatus, type PictureState } from "@/lib/photos-view";
import { getCustomerBusinessKind, requireCustomerAccess } from "@/lib/server/customer-access";
import { getAdvertisePage, type AdvertisePage } from "@/lib/server/directory-ads";
import { getPhotosPage, type PhotosPage } from "@/lib/server/listing-pictures";
import { payChargeAction } from "../billing/actions";
import { saveBidAction, saveTaglineAction } from "./actions";
import { removeAdPictureAction } from "./picture-actions";

export const metadata: Metadata = { title: "Advertise" };

const SECTION = "mt-10 border-t border-line pt-6";
const DOT = " · ";

interface AdvertisePageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function Notice({ code }: { readonly code: string | string[] | undefined }): ReactElement | null {
  const notice = readAdvertiseNotice(code);
  if (notice === null) return null;
  const { ok, text } = ADVERTISE_NOTICES[notice];
  return (
    <p role="status" className={`mt-6 rounded-control px-4 py-3 text-sm ${ok ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep"}`}>
      {text}
    </p>
  );
}

function spotName(win: Pick<DirectoryAdWin, "placement">): string {
  return SPOT_NAMES[win.placement];
}

/** Where an ad on `placement` can be seen on the website, or null for the business page. */
function seeItHref(page: AdvertisePage, placement: DirectoryAdWin["placement"]): string | null {
  return page.market === null ? null : placementPageHref(placement, page.market, siteConfig.url);
}

/** A spot won and not yet paid for: the amount with GST, one button, and what happens if it is left. */
function ToPay({ win }: { readonly win: DirectoryAdWin }): ReactElement {
  const total = adChargedPaise(win.pricePaise);
  return (
    <div className="grid gap-x-10 gap-y-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-medium">
          You won{DOT}
          {spotName(win)}
          {DOT}
          <span className="tabular-nums">{formatAdWeek(win.weekStart)}</span>
        </p>
        <p className="heading-display mt-2 text-5xl tabular-nums">{formatRupees(total)}</p>
        <p className="mt-1 text-sm tabular-nums text-ink-soft">
          {formatRupees(win.pricePaise)} + {formatRupees(total - win.pricePaise)} GST
        </p>
      </div>
      <form action={payChargeAction} className="sm:text-right">
        <input type="hidden" name="chargeId" value={win.chargeId} />
        <Button type="submit">Pay now</Button>
        <p className="mt-3 max-w-xs text-sm tabular-nums text-accent-deep sm:ml-auto">
          Pay by {formatAdDeadline(win.payBy)}, or the spot goes to the next business.
        </p>
      </form>
    </div>
  );
}

/**
 * The one thing this owner should see first: what is owed, then what is showing, then a bid that is waiting for its
 * result. A first-timer with none of those gets two lines on what this is, and that losing costs nothing.
 */
function Headline({ outcomes, page, now }: { readonly outcomes: AdOutcomes; readonly page: AdvertisePage; readonly now: Date }): ReactElement | null {
  if (page.market === null || page.weeks.length === 0) return null;
  const bidWeek = page.weeks.find((week) => week.weekStart === outcomes.bidWeek);
  if (outcomes.toPay.length + outcomes.live.length + outcomes.upcoming.length === 0 && bidWeek === undefined) {
    return (
      <div className="mt-8 max-w-2xl">
        <p className="font-serif text-2xl leading-snug">Put your business in front of {marketLabel(page.market)}.</p>
        <p className="mt-2 text-sm text-ink-soft">
          Pick a spot below and bid for one week at a time. The highest bid gets it, and you pay only if you win.
        </p>
      </div>
    );
  }
  const bids = bidWeek?.offers.filter((offer) => offer.myBidPaise !== null) ?? [];
  return (
    <div className="mt-8 space-y-8">
      {outcomes.toPay.map((win) => (
        <ToPay key={win.id} win={win} />
      ))}
      {outcomes.live.length + outcomes.upcoming.length === 0 ? null : (
        <ul className="space-y-2.5">
          {outcomes.live.map((win) => (
            <li key={win.id}>
              <StatusLine tone="done">
                Your ad is showing{DOT}
                {spotName(win)}
                {DOT}
                <span className="tabular-nums">{formatAdWeek(win.weekStart)}</span>
                {seeItHref(page, win.placement) === null ? null : (
                  <>
                    {DOT}
                    <a href={seeItHref(page, win.placement) ?? ""} target="_blank" rel="noopener noreferrer" className="link-underline">
                      See it
                    </a>
                  </>
                )}
              </StatusLine>
            </li>
          ))}
          {outcomes.upcoming.map((win) => (
            <li key={win.id}>
              <StatusLine tone="done">
                Paid{DOT}
                {spotName(win)}
                {DOT}
                <span className="tabular-nums">starts {formatAdWeek(win.weekStart)}</span>
              </StatusLine>
            </li>
          ))}
        </ul>
      )}
      {bidWeek === undefined ? null : (
        <div className="space-y-1.5">
          <StatusLine tone="waiting">
            Your bid is in for {weekLabel(bidWeek.weekStart, now).toLowerCase()}
            {DOT}
            <span className="tabular-nums">{formatAdWeek(bidWeek.weekStart)}</span>
          </StatusLine>
          <p className="text-sm tabular-nums text-ink-soft">
            {bids.map((offer) => `${SPOT_NAMES[offer.placement]} ${formatRupees(offer.myBidPaise ?? 0)}`).join(DOT)}
            {DOT}result here from {formatAdDeadline(bidWeek.closesAt)}
          </p>
        </div>
      )}
    </div>
  );
}

/** The ad as the website will draw it: the business's own name, line and approved pictures, else stock photos of its kind of place. */
function adPreviewData(page: AdvertisePage, market: DirectoryAdMarket, photos: PhotosPage): AdPreviewData {
  const claim = page.claim;
  const family = familyOf(market.categorySlug);
  const own = (slot: "ad_tall" | "ad_wide" | "listing"): string | null => {
    const picture = shownPicture(photos.slots[slot]);
    return picture === null ? null : ownPictureHref(picture.id);
  };
  const tall = own("ad_tall");
  const wide = own("ad_wide");
  const square = own("listing");
  return {
    name: claim?.businessName ?? "",
    tagline: claim?.tagline ?? null,
    place: areaName(market.citySlug, market.areaSlug) ?? market.areaSlug,
    tall: tall ?? `/ad-preview/${family}-1.webp`,
    wide: wide ?? `/ad-preview/${family}-2.webp`,
    square: square ?? `/ad-preview/${family}-2.webp`,
    stock: tall === null || wide === null,
  };
}

function Bidding({
  page,
  now,
  week,
  spot,
  photos,
}: {
  readonly photos: PhotosPage;
  readonly page: AdvertisePage;
  readonly now: Date;
  readonly week: string | null;
  readonly spot: string | null;
}): ReactElement | null {
  if (page.weeks.length === 0 || page.market === null || page.claim === null) return null;
  const market = page.market;
  const weeks = bidPanelWeeks(page, now);
  const pageHrefs = Object.fromEntries(AD_PLACEMENTS.map((placement) => [placement, placementPageHref(placement, market, siteConfig.url)])) as Record<
    DirectoryAdWin["placement"],
    string | null
  >;
  // A new key after every saved bid, so the panel starts again from what is now stored.
  const revision = weeks.flatMap((entry) => entry.offers.map((offer) => offer.myBidPaise ?? 0)).join("-");
  return (
    <section id="bid" aria-labelledby="bid-title" className={SECTION}>
      <h2 id="bid-title" className="panel-section">
        Place a bid
      </h2>
      <div className="mt-5">
        <BidPanel
          key={revision}
          weeks={weeks}
          pageHrefs={pageHrefs}
          businessName={page.claim.businessName}
          preview={adPreviewData(page, market, photos)}
          initialWeek={week}
          initialPlacement={parseAdPlacement(spot)}
          taxBasisPoints={AD_TAX_BASIS_POINTS}
          action={saveBidAction}
        />
      </div>
    </section>
  );
}

/** Every place an ad can show: who has it now and until when, and what the next auction for it is. */
function Spots({ page }: { readonly page: AdvertisePage }): ReactElement | null {
  if (page.weeks.length === 0 || page.claim === null) return null;
  return (
    <section id="spots" aria-labelledby="spots-title" className={SECTION}>
      <h2 id="spots-title" className="panel-section">
        Where your ad can show
      </h2>
      <SpotBoard spots={page.spots} weeks={page.weeks} />
    </section>
  );
}

/** Who saw an ad and who clicked it, one ad at a time. Left out until there is something to show. */
function Results({ page }: { readonly page: AdvertisePage }): ReactElement | null {
  const results = page.results;
  if (results === null || (results.bookings.length === 0 && results.total.seen === 0 && results.total.clicks === 0)) return null;
  return (
    <section id="results" aria-labelledby="results-title" className={SECTION}>
      <h2 id="results-title" className="panel-section">
        Ad results
      </h2>
      <div className="mt-4">
        <AdResultsView results={results} days={page.resultsDays} />
      </div>
    </section>
  );
}

/** The ad as the directory shows it, with the one line the owner can change. */
function YourAd({ page }: { readonly page: AdvertisePage }): ReactElement | null {
  const claim = page.claim;
  if (claim === null || claim.status !== "approved" || (claim.origin === "added" && claim.placeId === null)) return null;
  const waiting = claim.tagline !== null && !claim.taglineApproved;
  return (
    <section id="your-ad" aria-labelledby="your-ad-title" className={SECTION}>
      <h2 id="your-ad-title" className="panel-section">
        Your ad
      </h2>
      <div className="mt-4 flex max-w-2xl items-center gap-4 border-y border-line py-4">
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-control bg-paper-deep font-serif text-2xl">
          {Array.from(claim.businessName)[0]?.toUpperCase() ?? ""}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="truncate font-serif text-xl">{claim.businessName}</span>
            <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-soft ring-1 ring-inset ring-ink-soft/65">{AD_MARKER}</span>
          </p>
          {claim.tagline === null ? null : <p className="mt-0.5 truncate text-sm text-ink-soft">{claim.tagline}</p>}
        </div>
      </div>
      <form action={saveTaglineAction} className="mt-4 flex max-w-2xl flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="tagline" className="text-[0.8125rem] text-ink-soft">
            Your line, up to {AD_TAGLINE_MAX_LENGTH} characters
          </label>
          <input
            id="tagline"
            name="tagline"
            maxLength={AD_TAGLINE_MAX_LENGTH}
            defaultValue={claim.tagline ?? ""}
            placeholder="Painless treatment, open on Sundays"
            className="mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-4 py-2.5 text-base text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Save
        </Button>
      </form>
      {waiting ? (
        <div className="mt-3">
          <StatusLine tone="waiting">We&rsquo;re checking your line. It shows on your ad once it&rsquo;s cleared.</StatusLine>
        </div>
      ) : null}
    </section>
  );
}

/** Spots bid for and not won, each with its reason. */
function Missed({ outcomes }: { readonly outcomes: AdOutcomes }): ReactElement | null {
  if (outcomes.missed.length === 0) return null;
  return (
    <section aria-labelledby="missed-title" className={SECTION}>
      <h2 id="missed-title" className="panel-section">
        Not won
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {outcomes.missed.map((spot) => (
          <li key={spot.id} className="grid gap-1 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <p className="text-[0.9375rem] font-medium">
              {SPOT_NAMES[spot.placement]}
              {DOT}
              <span className="tabular-nums">{formatAdWeek(spot.weekStart)}</span>
            </p>
            <p className="text-sm text-ink-soft">{MISSED_REASONS[spot.reason]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What visitors did on the listing. Left out until there is something to show. */
function Visits({ page }: { readonly page: AdvertisePage }): ReactElement | null {
  const interest = page.interest;
  if (interest === null) return null;
  const figures = [
    { label: "Page views", value: interest.view },
    { label: "Calls", value: interest.call },
    { label: "WhatsApp", value: interest.whatsapp },
    { label: "Enquiries", value: interest.enquire },
  ];
  if (figures.every((figure) => figure.value === 0)) return null;
  return (
    <section aria-labelledby="visits-title" className={SECTION}>
      <h2 id="visits-title" className="panel-section">
        Your page, last {page.resultsDays} days
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label}>
            <dd className="heading-display text-5xl tabular-nums">{figure.value.toLocaleString("en-IN")}</dd>
            <dt className="mt-1 text-[0.8125rem] text-ink-soft">{figure.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Before the claim is approved there is nothing to bid on: say where it stands and what happens next. */
async function ClaimWaiting({ page }: { readonly page: AdvertisePage }): Promise<ReactElement | null> {
  const claim = page.claim;
  if (claim === null) return null;
  if (claim.status === "pending" && claim.origin === "added") {
    return (
      <div className="mt-8 max-w-2xl space-y-4">
        <StatusLine tone="quiet">Your business isn&rsquo;t published yet</StatusLine>
        <p className="text-sm text-ink-soft">Publish it from your Business profile first. Its page goes live straight away.</p>
        <ButtonLink href={profileHref("review")} size="sm" variant="secondary">
          Review &amp; publish
        </ButtonLink>
      </div>
    );
  }
  if (claim.status === "pending") {
    return (
      <div className="mt-8 max-w-2xl space-y-2">
        <StatusLine tone="waiting">Waiting for our call</StatusLine>
        <p className="text-sm text-ink-soft">
          We&rsquo;ll call <span className="tabular-nums">{displayPhone(claim.phone).text}</span> to confirm the business is yours,
          usually within a working day. You can bid straight after.
        </p>
      </div>
    );
  }
  if (claim.status === "rejected") {
    return (
      <div className="mt-8 max-w-2xl space-y-2">
        <StatusLine tone="stopped">Not confirmed</StatusLine>
        <p className="text-sm text-ink-soft">
          We couldn&rsquo;t confirm this business is yours. Email us at <EmailUs /> and we&rsquo;ll look again.
        </p>
      </div>
    );
  }
  if (claim.origin === "added" && claim.placeId === null) {
    return (
      <div className="mt-8 max-w-2xl space-y-2">
        <StatusLine tone="quiet">Your page isn&rsquo;t ready for ads yet</StatusLine>
        <p className="text-sm text-ink-soft">{"We’re still setting up your page on the local directory. Ads open here as soon as it’s ready."}</p>
      </div>
    );
  }
  if (page.reserves !== null && AD_PLACEMENTS.every((placement) => page.reserves?.[placement] === null)) {
    return (
      <div className="mt-8 max-w-2xl space-y-2">
        <StatusLine tone="quiet">Ads aren&rsquo;t open for your category yet</StatusLine>
        <p className="text-sm text-ink-soft">Bidding opens here as soon as they are.</p>
      </div>
    );
  }
  return null;
}

const PICTURE_TONES: Readonly<Record<Exclude<PictureState, "empty">, StatusTone>> = {
  waiting: "waiting",
  refused: "stopped",
  incomplete: "stopped",
  showing: "done",
};

const PICTURE_WORDS: Readonly<Record<Exclude<PictureState, "empty">, string>> = {
  waiting: "Waiting for our check, usually within a working day",
  refused: "Not accepted. Try another photo",
  incomplete: "One shape is missing. Add the photo again",
  showing: "Approved",
};

function AdPictureStatus({ status }: { readonly status: KindStatus }): ReactElement | null {
  if (status.state === "empty") return null;
  return <StatusLine tone={PICTURE_TONES[status.state]}>{PICTURE_WORDS[status.state]}</StatusLine>;
}

/** The ad picture, in the side spots' two shapes: shown on an ad that wins a side spot, after our check. */
function AdPicture({ photos }: { readonly photos: PhotosPage }): ReactElement | null {
  if (photos.claim === null || photos.claim.status === "rejected") return null;
  return (
    <PictureCard
      kind="ad"
      title="Ad picture"
      where="On your ad when you win a side spot. One photo, fitted to both shapes."
      previews={(["ad_tall", "ad_wide"] as const).map((slot) => ({ slot, pictureId: shownPicture(photos.slots[slot])?.id ?? null }))}
      status={<AdPictureStatus status={kindStatus(photos.slots, "ad")} />}
      canUpload
      removeAction={removeAdPictureAction}
    />
  );
}

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * A free listing account's home, and a Premium member's Advertise section, one question at a time: what is owed, what
 * is showing, then one bid panel (pick a week, tap a spot on a picture of the page, enter the most you would pay), the
 * ad itself, and what was missed and why.
 */
export default async function AdvertiseScreen({ searchParams }: AdvertisePageProps): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const now = new Date();
  const [kind, page, params, photos] = await Promise.all([
    getCustomerBusinessKind(customer.tenant.userId, customer.tenant.businessId),
    getAdvertisePage(customer, now),
    searchParams,
    getPhotosPage(customer),
  ]);
  // Advertising is the free listing's: a website client has it only as a Premium member that kept its free listing.
  if (!opensClaimPages(kind, page.claim !== null)) notFound();
  // Signed up with no listing and not added the business yet: that comes first. The page still opens and says so,
  // rather than sending the owner back to where they came from as if the menu had not worked.
  if (page.claim === null) {
    return (
      <>
        <h1 className="panel-title">Advertise</h1>
        <div className="mt-8 max-w-2xl space-y-4">
          <StatusLine tone="quiet">Set up your business first</StatusLine>
          <p className="text-sm text-ink-soft">
            Ads run on your listing. Fill in your Business profile and publish it, then bid for a spot here.
          </p>
          <ButtonLink href={profileHref("details")} size="sm" variant="secondary">
            Go to Business profile
          </ButtonLink>
        </div>
      </>
    );
  }
  const outcomes = adOutcomes(page, now);

  return (
    <>
      <h1 className="panel-title">Advertise</h1>
      <p className="mt-2 text-sm text-ink-soft">
        {page.claim.businessName}
        {page.market === null ? null : (
          <>
            {DOT}
            {marketLabel(page.market)}
          </>
        )}
      </p>
      <Notice code={params.notice} />
      <ClaimWaiting page={page} />
      <Headline outcomes={outcomes} page={page} now={now} />
      <Spots page={page} />
      <Bidding page={page} now={now} week={single(params.week)} spot={single(params.spot)} photos={photos} />
      <Results page={page} />
      <YourAd page={page} />
      <AdPicture photos={photos} />
      <Missed outcomes={outcomes} />
      <Visits page={page} />
    </>
  );
}
