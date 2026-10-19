import { adminBrand } from "@/lib/brand";
import {
  addWeeks,
  countDirectoryClaims,
  countWaitingDirectoryPictures,
  findPlaces,
  listAuctionBidsForStaff,
  listDirectoryAdPrices,
  listDirectoryAdSpotPrices,
  listDirectoryClaimsForStaff,
  listDirectoryPicturesForStaff,
  listDirectoryVideosForStaff,
  listStaffAds,
  marketOfListing,
  adPictureShape,
  MAX_STAFF_AD_WEEKS,
  PLACE_URL_CHANGE_REASON_MAX,
  PLACE_URL_SLUG_MAX,
  staffAuctionWeeks,
  weekStartOf,
  type DirectoryPlace,
  type StaffAd,
  type StaffAuctionBid,
  type StaffDirectoryClaim,
  type StaffDirectoryPicture,
  type StaffDirectoryVideo,
} from "@brandbasket/db";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";
import {
  AD_PLACEMENT_LABELS,
  adChargedPaise,
  formatAdDeadline,
  formatAdWeek,
  formatRupees,
  marketLabel,
} from "@brandbasket/shared/lib/directory/ads";
import { PICTURE_SHAPES, PICTURE_SLOT_LABELS } from "@brandbasket/shared/lib/directory/pictures";
import { vimeoEmbedUrl } from "@brandbasket/shared/lib/directory/videos";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Figures } from "@/components/console/figures";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { EditAdForm } from "@/components/edit-ad-form";
import { PlaceAdForm } from "@/components/place-ad-form";
import { formatRunRange, groupStaffAdRuns, type StaffAdRun } from "@/lib/staff-ad-runs";
import { WebAddress } from "@/components/web-address";
import { StatusDot, type StatusTone } from "@/components/console/status-dot";
import {
  ADS_NOTICES,
  ADS_PAGE_SIZE,
  adsHref,
  parseAdsNotice,
  parseAdsView,
  type AdsView,
  type ClaimFilter,
  type PictureFilter,
} from "@/lib/ads-view";
import { buildPriceBoard, openCategoryCount, type PriceBoard } from "@/lib/ad-prices";
import { adsPickLists, type AdsPickLists } from "@/lib/ads-pick-lists";
import { placementLine, spotLabel } from "@/lib/ad-spot-label";
import { settleDueAdsForStaff } from "@/lib/server/ad-settlement";
import { getStaffDb } from "@/lib/server/db";
import { STAFF_AD_SPOTS } from "@/lib/staff-ad-form";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { businessAddressOf } from "@/lib/business-address";
import { webAddressOf } from "@/lib/server/web-address";
import {
  approveClaimAction,
  approvePictureAction,
  approveTaglineAction,
  placeStaffAdAction,
  rejectPictureAction,
  removePriceAction,
  removeSpotPriceAction,
  editStaffAdAction,
  removeStaffAdsAction,
  savePriceAction,
  saveSpotPriceAction,
  takeDownPictureAction,
} from "./actions";
import { takeDownVideoAction } from "./video-actions";

export const metadata: Metadata = { title: "Ads" };

type ViewOf<S extends AdsView["section"]> = Extract<AdsView, { readonly section: S }>;

const ROW = "grid gap-x-6 gap-y-3 border-b border-line py-5 pl-1 pr-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start";
const ROW_BUTTON = "px-4 py-1.5";
const DOT = " · ";
/** Whole rupees from 100 to 100,000, which is all parseAdRupees accepts; the typing rule already drops commas. */
const RUPEES_PATTERN = "[0-9]{3,6}";
const RUPEES_TITLE = "Whole rupees, from 100 to 100000";
const WEBSITE = "https://fynix.digital";
/** How many weeks ahead an ad placed by staff may start. */
const STAFF_AD_START_WEEKS = 9;

function ViewFields({ view }: { readonly view: ViewOf<"claims"> }): ReactElement {
  return (
    <>
      <input type="hidden" name="status" value={view.status} />
      <input type="hidden" name="page" value={view.page} />
    </>
  );
}

function listingHref(listingKey: string): string {
  const [service, city, area, slug] = listingKey.split("/");
  return `${WEBSITE}/in/${service}/mh/${city}/${area}/${slug}`;
}

function ClaimRow({
  claim,
  place,
  view,
  webAddressCities,
}: {
  readonly claim: StaffDirectoryClaim;
  /** The business the claim is about, with its web address; null for an address no place has. */
  readonly place: DirectoryPlace | null;
  readonly view: ViewOf<"claims">;
  readonly webAddressCities: AdsPickLists["webAddressCities"];
}): ReactElement {
  const phone = displayPhone(claim.phone);
  // The business's web address once it has a place; its category's page in its area for an address with none.
  const address = businessAddressOf(place, claim.listingKey);
  const showsWebAddress = place !== null;
  const waitingLine = claim.status === "approved" && claim.tagline !== null && !claim.taglineApproved;
  return (
    <li className={ROW}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.98rem] font-semibold">
          {/* A business its owner added has no page on the website to open yet. */}
          {claim.origin === "added" ? (
            <>
              <span className="truncate">{claim.businessName}</span>
              <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-soft ring-1 ring-inset ring-ink-soft/65">
                New business
              </span>
            </>
          ) : (
            <a href={address} target="_blank" rel="noopener noreferrer" className="link-underline truncate">
              {claim.businessName}
            </a>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-soft">{marketLabel(marketOfListing(claim.listingKey))}</p>
        {claim.streetAddress === null ? null : (
          <p className="mt-0.5 text-sm text-ink-soft">
            {claim.streetAddress}
            {/* Its web address shows below once it has a place; before that, the old page its owner's picks made. */}
            {showsWebAddress ? null : (
              <>
                {DOT}
                <a href={address} target="_blank" rel="noopener noreferrer" className="link-underline font-mono text-xs">
                  {address.replace(/^https:\/\//, "")}
                </a>
              </>
            )}
          </p>
        )}
        {/* Outside the opened districts: the post-office locality and PIN its owner gave. The key above names the state and district. */}
        {claim.pincode !== null ? (
          <p className="mt-0.5 text-sm text-ink-soft">
            {claim.localityName}
            {DOT}
            <span className="tabular-nums">PIN {claim.pincode}</span>
          </p>
        ) : null}
        <p className="mt-3 text-sm">
          {claim.ownerName ?? "No owner"}
          {claim.ownerEmail === null ? null : <span className="text-ink-soft">{`${DOT}${claim.ownerEmail}`}</span>}
          {claim.ownerEmailConfirmed === false ? (
            <span className="ml-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-deep ring-1 ring-inset ring-accent-deep/50">
              Email not confirmed
            </span>
          ) : null}
          {DOT}
          {phone.href === null ? (
            <span className="tabular-nums">{phone.text}</span>
          ) : (
            <a href={phone.href} className="link-underline tabular-nums">
              {phone.text}
            </a>
          )}
        </p>
        {!showsWebAddress || place === null ? null : (
          // A new business's address is its owner's until staff approve it; once its page is live, only staff change it.
          <div className="mt-3 max-w-2xl">
            <WebAddress
              businessId={claim.businessId}
              place={{ id: place.id, citySlug: place.citySlug, urlSlug: place.urlSlug, locked: place.urlLockedAt !== null }}
              url={webAddressOf(place)}
              cities={webAddressCities}
              nameMaxLength={PLACE_URL_SLUG_MAX}
              reasonMaxLength={PLACE_URL_CHANGE_REASON_MAX}
            />
          </div>
        )}
        {claim.websiteUrl === null ? null : (
          <p className="mt-2 max-w-2xl break-words text-sm">
            <span className="text-ink-soft">Website: </span>
            {/* Shown as text, not a link: staff read where it goes before opening it themselves. */}
            <span className="font-mono text-xs">{claim.websiteUrl}</span>
          </p>
        )}
        {claim.tagline === null ? null : (
          <p className="mt-2 max-w-2xl text-sm">
            <span className="text-ink-soft">Ad line: </span>&ldquo;{claim.tagline}&rdquo;
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end">
        <span className="text-sm tabular-nums text-ink-soft">
          <LocalDateTime iso={(claim.decidedAt ?? claim.createdAt).toISOString()} variant="timestamp" />
        </span>
        <div className="flex flex-wrap gap-2">
          {waitingLine ? (
            <form action={approveTaglineAction}>
              <input type="hidden" name="id" value={claim.id} />
              <ViewFields view={view} />
              <button type="submit" className={`${buttonPrimary} ${ROW_BUTTON}`}>
                Approve line
              </button>
            </form>
          ) : null}
          {claim.status === "approved" ? null : (
            <form action={approveClaimAction}>
              <input type="hidden" name="id" value={claim.id} />
              {/* The details this row shows, so an approval is refused if the owner has changed them since. */}
              <input type="hidden" name="seenListingKey" value={claim.listingKey} />
              <input type="hidden" name="seenPhone" value={claim.phone} />
              <input type="hidden" name="seenBusinessName" value={claim.businessName} />
              <ViewFields view={view} />
              <button type="submit" className={`${claim.status === "pending" ? buttonPrimary : buttonSecondary} ${ROW_BUTTON}`}>
                Approve
              </button>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}

/** Newer and older links under a paged list; nothing for a list that fits on one page. */
function Pager({ view, pages }: { readonly view: ViewOf<"claims"> | ViewOf<"pictures"> | ViewOf<"videos">; readonly pages: number }): ReactElement | null {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-6 text-sm tabular-nums text-ink-soft">
      {view.page > 1 ? (
        <a href={adsHref({ ...view, page: view.page - 1 })} className="link-underline font-semibold">
          ← Newer
        </a>
      ) : (
        <span />
      )}
      <span>
        Page {view.page} of {pages}
      </span>
      {view.page < pages ? (
        <a href={adsHref({ ...view, page: view.page + 1 })} className="link-underline font-semibold">
          Older →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

const CLAIM_EMPTY: Readonly<Record<ClaimFilter, string>> = {
  pending: "No claims waiting for a call.",
  tagline: "No ad lines waiting for approval.",
  approved: "No approved claims yet.",
};

function ClaimsSection({
  view,
  claims,
  places,
  total,
  webAddressCities,
}: {
  readonly view: ViewOf<"claims">;
  readonly claims: readonly StaffDirectoryClaim[];
  /** The claims' businesses, by place id. */
  readonly places: ReadonlyMap<string, DirectoryPlace>;
  readonly total: number;
  readonly webAddressCities: AdsPickLists["webAddressCities"];
}): ReactElement {
  const pages = Math.max(1, Math.ceil(total / ADS_PAGE_SIZE));
  return (
    <>
      {claims.length === 0 ? (
        <EmptyLine>{CLAIM_EMPTY[view.status]}</EmptyLine>
      ) : (
        <ul aria-label="Claims" className="mt-6 border-t border-line">
          {claims.map((claim) => (
            <ClaimRow
              key={claim.id}
              claim={claim}
              place={claim.placeId === null ? null : (places.get(claim.placeId) ?? null)}
              view={view}
              webAddressCities={webAddressCities}
            />
          ))}
        </ul>
      )}
      <Pager view={view} pages={pages} />
    </>
  );
}

const PICTURE_EMPTY: Readonly<Record<PictureFilter, string>> = {
  pending: "No pictures waiting for a check.",
  approved: "No approved pictures yet.",
  rejected: "No refused pictures.",
};

function pictureHref(picture: Pick<StaffDirectoryPicture, "id">): string {
  return `/directory-pictures/${picture.id}`;
}

function PictureForm({
  action,
  picture,
  view,
  label,
  className,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly picture: StaffDirectoryPicture;
  readonly view: ViewOf<"pictures">;
  readonly label: string;
  readonly className: string;
}): ReactElement {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={picture.id} />
      <input type="hidden" name="show" value="pictures" />
      <input type="hidden" name="status" value={view.status} />
      <input type="hidden" name="page" value={view.page} />
      <button type="submit" className={`${className} ${ROW_BUTTON}`}>
        {label}
      </button>
    </form>
  );
}

/** One uploaded picture in its slot's own shape, with the business it belongs to and what staff can do with it. */
function PictureRow({ picture, view }: { readonly picture: StaffDirectoryPicture; readonly view: ViewOf<"pictures"> }): ReactElement {
  const shape = PICTURE_SHAPES[picture.slot];
  return (
    <li className="grid gap-x-6 gap-y-4 border-b border-line py-5 pl-1 pr-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <a href={pictureHref(picture)} target="_blank" rel="noopener noreferrer" className="block w-fit">
        {/* The image optimiser is skipped: it would fetch the file without the staff session and be refused. */}
        <Image
          src={pictureHref(picture)}
          alt={`${PICTURE_SLOT_LABELS[picture.slot]} for ${picture.businessName}`}
          width={shape.width}
          height={shape.height}
          unoptimized
          className="h-36 w-auto rounded-[12px] bg-paper-deep object-cover"
        />
        <span className="sr-only">Open the full picture in a new tab</span>
      </a>
      <div className="min-w-0">
        <p className="truncate text-[0.98rem] font-semibold">
          <a href={listingHref(picture.listingKey)} target="_blank" rel="noopener noreferrer" className="link-underline">
            {picture.businessName}
          </a>
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-soft">{marketLabel(marketOfListing(picture.listingKey))}</p>
        <p className="mt-3 text-sm">
          {PICTURE_SLOT_LABELS[picture.slot]}
          <span className="tabular-nums text-ink-soft">{`${DOT}${picture.width} × ${picture.height}`}</span>
        </p>
        {picture.claimStatus === "approved" ? null : (
          <p className="mt-2 text-sm text-ink-soft">
            {picture.claimStatus === "pending" ? "Claim not approved yet: it shows once the claim is." : "Claim rejected: it won't show."}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end">
        <span className="text-sm tabular-nums text-ink-soft">
          <LocalDateTime iso={(picture.decidedAt ?? picture.createdAt).toISOString()} variant="timestamp" />
        </span>
        <div className="flex flex-wrap gap-2">
          {picture.status === "pending" ? (
            <>
              <PictureForm action={approvePictureAction} picture={picture} view={view} label="Approve" className={buttonPrimary} />
              <PictureForm action={rejectPictureAction} picture={picture} view={view} label="Refuse" className={buttonDanger} />
            </>
          ) : null}
          {picture.status === "approved" ? (
            <PictureForm action={takeDownPictureAction} picture={picture} view={view} label="Take down" className={buttonDanger} />
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Pictures listing owners uploaded, each already cut to its slot's shape: approve, refuse, or take a live one down. */
function PicturesSection({
  view,
  pictures,
  total,
}: {
  readonly view: ViewOf<"pictures">;
  readonly pictures: readonly StaffDirectoryPicture[];
  readonly total: number;
}): ReactElement {
  return (
    <>
      {pictures.length === 0 ? (
        <EmptyLine>{PICTURE_EMPTY[view.status]}</EmptyLine>
      ) : (
        <ul aria-label="Pictures" className="mt-6 border-t border-line">
          {pictures.map((picture) => (
            <PictureRow key={picture.id} picture={picture} view={view} />
          ))}
        </ul>
      )}
      <Pager view={view} pages={Math.max(1, Math.ceil(total / ADS_PAGE_SIZE))} />
    </>
  );
}

function VideoForm({
  action,
  video,
  view,
  label,
  className,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly video: StaffDirectoryVideo;
  readonly view: ViewOf<"videos">;
  readonly label: string;
  readonly className: string;
}): ReactElement {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={video.id} />
      <input type="hidden" name="show" value="videos" />
      <input type="hidden" name="page" value={view.page} />
      <button type="submit" className={`${className} ${ROW_BUTTON}`}>
        {label}
      </button>
    </form>
  );
}

/** The player's box, in the video's own shape: a tall clip is a narrow box, a wide one a wide box. 16:9 until Vimeo has told us. */
function playerBox(video: StaffDirectoryVideo): { readonly aspectRatio: string; readonly className: string } {
  const width = video.width ?? 16;
  const height = video.height ?? 9;
  const portrait = height > width;
  return {
    aspectRatio: `${String(width)} / ${String(height)}`,
    className: portrait ? "w-36 sm:w-40" : "w-full sm:w-[22rem]",
  };
}

/** The video in Vimeo's player; a still of it when Vimeo has no privacy hash for it yet, and nothing when it has neither. */
function VideoPlayer({ video }: { readonly video: StaffDirectoryVideo }): ReactElement | null {
  const label = `Video ${String(video.slot)} for ${video.businessName}`;
  const box = playerBox(video);
  if (video.vimeoHash !== null) {
    return (
      <div className={`${box.className} overflow-hidden rounded-[12px] bg-paper-deep`} style={{ aspectRatio: box.aspectRatio }}>
        <iframe
          src={vimeoEmbedUrl(video.vimeoId, video.vimeoHash)}
          loading="lazy"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
          title={label}
          className="h-full w-full border-0"
        />
      </div>
    );
  }
  if (video.posterUrl !== null) {
    return (
      <div className={`${box.className} overflow-hidden rounded-[12px] bg-paper-deep`} style={{ aspectRatio: box.aspectRatio }}>
        {/* A still on Vimeo's image host: the image optimiser has nothing to add. */}
        <Image src={video.posterUrl} alt={label} width={640} height={360} unoptimized className="h-full w-full object-cover" />
      </div>
    );
  }
  return null;
}

/** What is known of the clip: its length and its size in pixels, each left out until Vimeo has reported it. */
function videoFacts(video: StaffDirectoryVideo): string {
  const facts = [`Video ${String(video.slot)}`];
  if (video.durationMs !== null) facts.push(`${(video.durationMs / 1000).toFixed(1)} s`);
  if (video.width !== null && video.height !== null) facts.push(`${String(video.width)} × ${String(video.height)}`);
  return facts.join(DOT);
}

/** One live video in Vimeo's player with the business it belongs to; staff can take it down. */
function VideoRow({ video, view }: { readonly video: StaffDirectoryVideo; readonly view: ViewOf<"videos"> }): ReactElement {
  return (
    <li className="grid gap-x-6 gap-y-4 border-b border-line py-5 pl-1 pr-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <VideoPlayer video={video} />
      <div className="min-w-0">
        <p className="truncate text-[0.98rem] font-semibold">
          <a href={listingHref(video.listingKey)} target="_blank" rel="noopener noreferrer" className="link-underline">
            {video.businessName}
          </a>
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-soft">{marketLabel(marketOfListing(video.listingKey))}</p>
        <p className="mt-3 text-sm tabular-nums text-ink-soft">{videoFacts(video)}</p>
        {video.claimStatus === "approved" ? null : (
          <p className="mt-2 text-sm text-ink-soft">
            {video.claimStatus === "pending" ? "Claim not approved yet: it shows once the claim is." : "Claim rejected: it won't show."}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end">
        <span className="text-sm tabular-nums text-ink-soft">
          <LocalDateTime iso={(video.decidedAt ?? video.createdAt).toISOString()} variant="timestamp" />
        </span>
        <div className="flex flex-wrap gap-2">
          <VideoForm action={takeDownVideoAction} video={video} view={view} label="Take down" className={buttonDanger} />
        </div>
      </div>
    </li>
  );
}

/** Videos Premium members uploaded. They go live when uploaded, so this is the list of what is on business pages, newest first, to take down. */
function VideosSection({
  view,
  videos,
  total,
}: {
  readonly view: ViewOf<"videos">;
  readonly videos: readonly StaffDirectoryVideo[];
  readonly total: number;
}): ReactElement {
  return (
    <>
      {videos.length === 0 ? (
        <EmptyLine>No videos on business pages yet.</EmptyLine>
      ) : (
        <ul aria-label="Videos" className="mt-6 border-t border-line">
          {videos.map((video) => (
            <VideoRow key={video.id} video={video} view={view} />
          ))}
        </ul>
      )}
      <Pager view={view} pages={Math.max(1, Math.ceil(total / ADS_PAGE_SIZE))} />
    </>
  );
}

function bidState(bid: StaffAuctionBid, now: Date): { readonly tone: StatusTone; readonly label: string } {
  if (bid.win !== null) {
    if (bid.win.status === "paid") return { tone: "done", label: "Paid" };
    if (bid.win.status === "lapsed") return { tone: "quiet", label: "Lapsed, not paid" };
    return bid.win.payBy <= now
      ? { tone: "problem", label: "Pay-by passed" }
      : { tone: "waiting", label: `To pay by ${formatAdDeadline(bid.win.payBy)}` };
  }
  if (bid.status === "lost") return { tone: "quiet", label: "Not won" };
  return { tone: "moving", label: "Bidding" };
}

interface AuctionGroup {
  readonly key: string;
  readonly weekStart: string;
  readonly market: string;
  readonly placement: StaffAuctionBid["placement"];
  readonly bids: StaffAuctionBid[];
}

/** Bids arrive ordered by week, market, placement, then amount: fold them into one group per auction. */
function groupAuctions(bids: readonly StaffAuctionBid[]): AuctionGroup[] {
  const groups: AuctionGroup[] = [];
  for (const bid of bids) {
    const key = `${bid.weekStart}|${bid.categorySlug}/${bid.citySlug}/${bid.areaSlug}|${bid.placement}`;
    const last = groups.at(-1);
    if (last !== undefined && last.key === key) {
      last.bids.push(bid);
    } else {
      groups.push({ key, weekStart: bid.weekStart, market: marketLabel(bid), placement: bid.placement, bids: [bid] });
    }
  }
  return groups;
}

function AuctionsSection({ bids, now }: { readonly bids: readonly StaffAuctionBid[]; readonly now: Date }): ReactElement {
  const groups = groupAuctions(bids);
  if (groups.length === 0) return <EmptyLine>No bids for this week or the next two.</EmptyLine>;
  const current = weekStartOf(now);
  return (
    <div className="mt-6 space-y-10">
      {groups.map((group) => (
        <section key={group.key} aria-label={`${group.market}, ${AD_PLACEMENT_LABELS[group.placement]}`}>
          <h2 className="font-serif text-xl">
            {group.market}
            <span className="text-ink-soft">{`${DOT}${AD_PLACEMENT_LABELS[group.placement]}`}</span>
          </h2>
          <p className="mt-1 text-sm tabular-nums text-ink-soft">
            {formatAdWeek(group.weekStart)}
            {group.weekStart === current ? `${DOT}running now` : null}
          </p>
          <ul className="mt-4 border-t border-line">
            {group.bids.map((bid) => {
              const state = bidState(bid, now);
              return (
                <li key={bid.id} className="grid gap-x-6 gap-y-1 border-b border-line py-3 pl-1 pr-2 sm:grid-cols-[minmax(0,1fr)_8rem_12rem] sm:items-center">
                  <span className="min-w-0 truncate text-[0.95rem] font-medium">{bid.businessName}</span>
                  <span className="text-sm tabular-nums">
                    Bid {formatRupees(bid.amountPaise)}
                  </span>
                  <span className="flex flex-col gap-0.5 sm:items-end">
                    <StatusDot tone={state.tone} label={state.label} />
                    {bid.win === null ? null : (
                      <span className="text-xs tabular-nums text-ink-soft">
                        {spotLabel({ placement: bid.placement, spot: bid.win.spot })}
                        {DOT}
                        {bid.win.status === "lapsed" ? "was" : "pays"} {formatRupees(adChargedPaise(bid.win.pricePaise))}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Placing an ad by hand for a business that asked, then every staff-placed ad running now or booked ahead. */
function PlacedSection({
  ads,
  now,
  lists,
  editId,
}: {
  readonly ads: readonly StaffAd[];
  readonly now: Date;
  readonly lists: AdsPickLists;
  /** The first week's id of the booking staff opened to edit, if any. */
  readonly editId: string | undefined;
}): ReactElement {
  const current = weekStartOf(now);
  const runs = groupStaffAdRuns(ads);
  const editing: StaffAdRun | undefined = editId === undefined ? undefined : runs.find((run) => run.ids.includes(editId));
  const weeks = Array.from({ length: STAFF_AD_START_WEEKS }, (_, index) => {
    const weekStart = addWeeks(current, index);
    return { value: weekStart, label: index === 0 ? `${formatAdWeek(weekStart)} (this week)` : formatAdWeek(weekStart) };
  });
  return (
    <>
      {editId === undefined ? null : (
        <section aria-labelledby="edit-ad-heading" className="mt-10">
          <h2 id="edit-ad-heading" className="font-serif text-xl">
            Edit an ad
          </h2>
          {editing === undefined ? (
            <EmptyLine>That ad is no longer up, so there is nothing to edit.</EmptyLine>
          ) : (
            <EditAdForm
              // A fresh form for each booking, so what was typed for one never carries over to another.
              key={editing.ids[0]}
              action={editStaffAdAction}
              ids={editing.ids}
              isLink={editing.ad.linkUrl !== null}
              values={{
                businessName: editing.ad.businessName,
                tagline: editing.ad.tagline ?? "",
                link: editing.ad.linkUrl ?? "",
                price: editing.ad.agreedPaise === null ? "" : String(editing.ad.agreedPaise / 100),
                note: editing.ad.note ?? "",
              }}
              pictureId={editing.ad.pictureId}
              where={placementLine(editing.ad)}
              pictureSize={PICTURE_SHAPES[adPictureShape(editing.ad.placement, editing.ad.spot) === "tall" ? "ad_tall" : "ad_wide"]}
              spotLabel={spotLabel(editing.ad)}
              cancelHref={adsHref({ section: "placed" })}
            />
          )}
        </section>
      )}
      <section aria-labelledby="place-ad-heading" className="mt-10">
        <h2 id="place-ad-heading" className="font-serif text-xl">
          Place an ad
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          For a business that asked us directly, or any ad that should open a link you choose. You pick the spot, including the home page&rsquo;s four tiles, and
          how long it runs: a month, two, or more. It needs no account and no bid. While it runs the spot is closed to bidders, and a
          customer sees the date it opens again.
        </p>
        <PlaceAdForm
          action={placeStaffAdAction}
          categories={lists.categories.map((category) => ({ value: category.slug, label: category.label }))}
          areasByCity={lists.areasByCity}
          cities={lists.cities}
          spots={STAFF_AD_SPOTS.map((spot) => ({ value: spot.value, label: spot.label }))}
          weeks={weeks}
          maxWeeks={MAX_STAFF_AD_WEEKS}
          pictureSizes={{ tall: PICTURE_SHAPES.ad_tall, wide: PICTURE_SHAPES.ad_wide }}
        />
      </section>

      <section aria-labelledby="placed-heading" className="mt-12">
        <h2 id="placed-heading" className="font-serif text-xl">
          Placed by staff
        </h2>
        {ads.length === 0 ? (
          <EmptyLine>No ad placed by staff is running or booked.</EmptyLine>
        ) : (
          <ul aria-label="Ads placed by staff" className="mt-4 border-t border-line">
            {runs.map((run) => {
              const { ad } = run;
              const showingNow = run.firstWeek <= current && current <= run.lastWeek;
              return (
                <li key={run.ids[0]} className={ROW}>
                  <div className="min-w-0">
                    {ad.pictureId === null ? null : (
                      // eslint-disable-next-line @next/next/no-img-element -- a staff-only preview of a file served by this app
                      <img src={`/staff-ad-pictures/${ad.pictureId}`} alt="" className="mb-2 h-20 w-auto rounded-control bg-paper-deep" />
                    )}
                    <p className="flex min-w-0 items-center gap-2 text-[0.98rem] font-semibold">
                      {ad.listingKey === null ? (
                        <span className="truncate">{ad.businessName}</span>
                      ) : (
                        <a href={listingHref(ad.listingKey)} target="_blank" rel="noopener noreferrer" className="link-underline truncate">
                          {ad.businessName}
                        </a>
                      )}
                      {ad.linkUrl === null ? null : (
                        <span className="shrink-0 rounded-full px-2 py-px text-[0.6875rem] font-semibold ring-1 ring-inset ring-ink-soft/65">Link ad</span>
                      )}
                    </p>
                    {ad.linkUrl === null ? null : (
                      <p className="mt-0.5 truncate text-sm">
                        <span className="text-ink-soft">Opens </span>
                        <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer" className="link-underline">
                          {ad.linkUrl}
                        </a>
                      </p>
                    )}
                    <p className="mt-0.5 text-sm text-ink-soft">{placementLine(ad)}</p>
                    {ad.tagline === null ? null : <p className="mt-2 max-w-2xl text-sm">&ldquo;{ad.tagline}&rdquo;</p>}
                    {ad.agreedPaise === null && ad.note === null ? null : (
                      <p className="mt-2 text-sm tabular-nums text-ink-soft">
                        {ad.agreedPaise === null ? null : `${formatRupees(ad.agreedPaise)} a week`}
                        {ad.agreedPaise !== null && ad.note !== null ? DOT : null}
                        {ad.note}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end">
                    <span className="text-sm tabular-nums">{formatRunRange(run.firstWeek, run.lastWeek)}</span>
                    <span className="text-xs tabular-nums text-ink-soft">{run.weeks === 1 ? "1 week" : `${run.weeks} weeks`}</span>
                    <StatusDot tone={showingNow ? "done" : "waiting"} label={showingNow ? "Showing now" : "Booked"} />
                    <Link href={adsHref({ section: "placed", edit: run.ids[0] })} className={`${buttonSecondary} ${ROW_BUTTON}`}>
                      Edit
                    </Link>
                    <form action={removeStaffAdsAction}>
                      {run.ids.map((id) => (
                        <input key={id} type="hidden" name="id" value={id} />
                      ))}
                      <button type="submit" className={`${buttonDanger} ${ROW_BUTTON}`}>
                        Take down
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

/** A price, or a plain "Closed" where there is none. */
function PriceCell({ label, paise }: { readonly label: string; readonly paise: number | null }): ReactElement {
  return (
    <span className="text-sm tabular-nums">
      <span className="text-ink-soft">{label} </span>
      {paise === null ? <span className="text-ink-soft">Closed</span> : formatRupees(paise)}
    </span>
  );
}

function PricesSection({ board, categories }: { readonly board: PriceBoard; readonly categories: AdsPickLists["categories"] }): ReactElement {
  const categoryOptions: readonly SelectOption[] = categories.map((category) => ({ value: category.slug, label: category.label }));
  const openRows = board.rows.filter((row) => row.topWeekPaise !== null || row.sideWeekPaise !== null || row.profileWeekPaise !== null);
  return (
    <>
      <section aria-labelledby="home-price-heading" className="mt-10 max-w-3xl">
        <h2 id="home-price-heading" className="font-serif text-xl">
          Home page
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          One weekly price, before GST, for each of the four tiles. Every category in a city bids for them together; it is also the lowest bid.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <StatusDot tone={board.homeWeekPaise === null ? "quiet" : "done"} label={board.homeWeekPaise === null ? "Closed" : `Open at ${formatRupees(board.homeWeekPaise)} a week`} />
          {board.homeWeekPaise === null ? null : (
            <form action={removeSpotPriceAction}>
              <input type="hidden" name="placement" value="home" />
              <button type="submit" className={`${buttonDanger} ${ROW_BUTTON}`}>
                Close
              </button>
            </form>
          )}
        </div>
        <form action={saveSpotPriceAction} className="mt-5 grid max-w-md gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="placement" value="home" />
          <div>
            <label htmlFor="price-home" className={labelClasses}>
              Price a week (₹)<RequiredMark />
            </label>
            <RuleInput id="price-home" name="price" rule="digits" required pattern={RUPEES_PATTERN} title={RUPEES_TITLE} maxLength={6} autoComplete="off" placeholder="4999" className={`${fieldClasses} tabular-nums`} />
          </div>
          <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">
            {board.homeWeekPaise === null ? "Open home page" : "Save price"}
          </GatedSubmitButton>
        </form>
      </section>

      <section aria-labelledby="set-price-heading" className="mt-12 max-w-3xl">
        <h2 id="set-price-heading" className="font-serif text-xl">
          Set a category&rsquo;s list price
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Per week, before GST. It is also the lowest bid, in every area.</p>
        <form action={savePriceAction} className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor="price-category" className={labelClasses}>
              Category<RequiredMark />
            </label>
            <SelectField id="price-category" name="category" required options={categoryOptions} placeholder="Choose…" className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="price-top" className={labelClasses}>
              Top of the list (₹)<RequiredMark />
            </label>
            <RuleInput id="price-top" name="top" rule="digits" required pattern={RUPEES_PATTERN} title={RUPEES_TITLE} maxLength={6} autoComplete="off" placeholder="999" className={`${fieldClasses} tabular-nums`} />
          </div>
          <div>
            <label htmlFor="price-side" className={labelClasses}>
              Side spot (₹)<RequiredMark />
            </label>
            <RuleInput id="price-side" name="side" rule="digits" required pattern={RUPEES_PATTERN} title={RUPEES_TITLE} maxLength={6} autoComplete="off" placeholder="499" className={`${fieldClasses} tabular-nums`} />
          </div>
          <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">
            Save price
          </GatedSubmitButton>
        </form>
      </section>

      <section aria-labelledby="set-profile-price-heading" className="mt-12 max-w-3xl">
        <h2 id="set-profile-price-heading" className="font-serif text-xl">
          Set a category&rsquo;s business page price
        </h2>
        <p className="mt-1 text-sm text-ink-soft">The one spot on every business page in the category, per week before GST.</p>
        <form action={saveSpotPriceAction} className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="placement" value="profile" />
          <div>
            <label htmlFor="price-profile-category" className={labelClasses}>
              Category<RequiredMark />
            </label>
            <SelectField id="price-profile-category" name="category" required options={categoryOptions} placeholder="Choose…" className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="price-profile" className={labelClasses}>
              Business page (₹)<RequiredMark />
            </label>
            <RuleInput id="price-profile" name="price" rule="digits" required pattern={RUPEES_PATTERN} title={RUPEES_TITLE} maxLength={6} autoComplete="off" placeholder="299" className={`${fieldClasses} tabular-nums`} />
          </div>
          <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">
            Save price
          </GatedSubmitButton>
        </form>
      </section>

      <section aria-labelledby="prices-heading" className="mt-12">
        <h2 id="prices-heading" className="font-serif text-xl">
          Open for ads
        </h2>
        <p className="mt-1 text-sm text-ink-soft">A placement without a price is closed to bids.</p>
        {openRows.length === 0 ? (
          <EmptyLine>No category is open yet. Set a price above to open one.</EmptyLine>
        ) : (
          <ul aria-label="Category prices" className="mt-4 border-t border-line">
            {openRows.map((row) => (
              <li
                key={row.categorySlug}
                className="grid gap-x-6 gap-y-2 border-b border-line py-4 pl-1 pr-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_11rem_auto] sm:items-center"
              >
                <span className="text-[0.95rem] font-medium">{row.label}</span>
                <PriceCell label="Top" paise={row.topWeekPaise} />
                <PriceCell label="Side" paise={row.sideWeekPaise} />
                <PriceCell label="Business page" paise={row.profileWeekPaise} />
                <span className="flex flex-wrap gap-2">
                  {row.topWeekPaise === null ? null : (
                    <form action={removePriceAction}>
                      <input type="hidden" name="category" value={row.categorySlug} />
                      <button type="submit" className={`${buttonDanger} ${ROW_BUTTON}`}>
                        Close list
                      </button>
                    </form>
                  )}
                  {row.profileWeekPaise === null ? null : (
                    <form action={removeSpotPriceAction}>
                      <input type="hidden" name="placement" value="profile" />
                      <input type="hidden" name="category" value={row.categorySlug} />
                      <button type="submit" className={`${buttonDanger} ${ROW_BUTTON}`}>
                        Close business page
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Free listing accounts' claims, pictures and videos, this week's and the next two weeks' auctions, ads staff placed by hand, and each category's price. */
export default async function AdsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireStaffAccess();
  const now = new Date();
  await settleDueAdsForStaff(now);
  const params = await searchParams;
  const view = parseAdsView((name) => params[name]);
  const notice = parseAdsNotice(params.done);
  const db = getStaffDb();

  const currentWeek = weekStartOf(now);
  const [counts, waitingPictures, prices, spotPrices, auctionBids, staffAds, claims, pictures, videos] = await Promise.all([
    countDirectoryClaims(db),
    countWaitingDirectoryPictures(db),
    listDirectoryAdPrices(db),
    listDirectoryAdSpotPrices(db),
    listAuctionBidsForStaff(db, staffAuctionWeeks(now)),
    listStaffAds(db, currentWeek),
    view.section === "claims"
      ? listDirectoryClaimsForStaff(db, { filter: view.status, limit: ADS_PAGE_SIZE, offset: (view.page - 1) * ADS_PAGE_SIZE })
      : Promise.resolve(null),
    view.section === "pictures"
      ? listDirectoryPicturesForStaff(db, { status: view.status, limit: ADS_PAGE_SIZE, offset: (view.page - 1) * ADS_PAGE_SIZE })
      : Promise.resolve(null),
    view.section === "videos"
      ? listDirectoryVideosForStaff(db, { status: "approved", limit: ADS_PAGE_SIZE, offset: (view.page - 1) * ADS_PAGE_SIZE })
      : Promise.resolve(null),
  ]);
  const claimPlaces = await findPlaces(
    db,
    (claims?.claims ?? []).flatMap((claim) => (claim.placeId === null ? [] : [claim.placeId])),
  );
  // Read now, after requireStaffAccess has brought the places up to date with the geography catalog.
  const lists = adsPickLists();
  const board = buildPriceBoard(lists.categories, prices, spotPrices);
  const owed = auctionBids.filter((bid) => bid.win?.status === "awaiting_payment").length;
  const live =
    auctionBids.filter((bid) => bid.win?.status === "paid" && bid.weekStart === currentWeek).length +
    staffAds.filter((ad) => ad.weekStart === currentWeek).length;

  return (
    <>
      <PageHeader title="Ads" meta={`Free listing claims, pictures and videos, weekly auctions, ads you place by hand, and each category's price on ${adminBrand().directoryName}.`} />

      <Figures
        items={[
          { value: counts.pending, label: "Claims to call", emphasis: counts.pending > 0 },
          { value: counts.tagline, label: "Lines to approve", emphasis: counts.tagline > 0 },
          { value: waitingPictures, label: "Pictures to check", emphasis: waitingPictures > 0 },
          { value: live, label: "Ads live this week" },
          { value: owed, label: "Waiting for payment" },
        ]}
      />

      {notice === null ? null : (
        <Notice tone={ADS_NOTICES[notice].ok ? "ok" : "problem"} className="mt-8">
          {ADS_NOTICES[notice].text}
        </Notice>
      )}

      <div className="mt-10">
        <FilterPills
          label="Section"
          options={[
            { href: adsHref({ section: "claims", status: "pending", page: 1 }), label: "Claims", count: counts.pending, current: view.section === "claims" },
            { href: adsHref({ section: "pictures", status: "pending", page: 1 }), label: "Pictures", count: waitingPictures, current: view.section === "pictures" },
            { href: adsHref({ section: "videos", page: 1 }), label: "Videos", current: view.section === "videos" },
            { href: adsHref({ section: "auctions" }), label: "Auctions", count: auctionBids.length, current: view.section === "auctions" },
            { href: adsHref({ section: "placed" }), label: "Placed by staff", count: groupStaffAdRuns(staffAds).length, current: view.section === "placed" },
            { href: adsHref({ section: "prices" }), label: "Prices", count: openCategoryCount(board), current: view.section === "prices" },
          ]}
        />
      </div>

      {view.section === "claims" && claims !== null ? (
        <>
          <div className="mt-3">
            <FilterPills
              label="Filter claims"
              options={[
                { href: adsHref({ section: "claims", status: "pending", page: 1 }), label: "To call", count: counts.pending, current: view.status === "pending" },
                { href: adsHref({ section: "claims", status: "tagline", page: 1 }), label: "Ad lines", count: counts.tagline, current: view.status === "tagline" },
                { href: adsHref({ section: "claims", status: "approved", page: 1 }), label: "Approved", count: counts.approved, current: view.status === "approved" },
              ]}
            />
          </div>
          <ClaimsSection view={view} claims={claims.claims} places={claimPlaces} total={claims.total} webAddressCities={lists.webAddressCities} />
        </>
      ) : null}
      {view.section === "pictures" && pictures !== null ? (
        <>
          <div className="mt-3">
            <FilterPills
              label="Filter pictures"
              options={[
                { href: adsHref({ section: "pictures", status: "pending", page: 1 }), label: "To check", count: waitingPictures, current: view.status === "pending" },
                { href: adsHref({ section: "pictures", status: "approved", page: 1 }), label: "Approved", current: view.status === "approved" },
                { href: adsHref({ section: "pictures", status: "rejected", page: 1 }), label: "Refused", current: view.status === "rejected" },
              ]}
            />
          </div>
          <PicturesSection view={view} pictures={pictures.pictures} total={pictures.total} />
        </>
      ) : null}
      {view.section === "videos" && videos !== null ? <VideosSection view={view} videos={videos.videos} total={videos.total} /> : null}
      {view.section === "auctions" ? <AuctionsSection bids={auctionBids} now={now} /> : null}
      {view.section === "placed" ? <PlacedSection ads={staffAds} now={now} lists={lists} editId={view.edit} /> : null}
      {view.section === "prices" ? <PricesSection board={board} categories={lists.categories} /> : null}
    </>
  );
}
