import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { DirectoryDeal } from "@firstfold/db";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { SubmitButton } from "@firstfold/shared/ui/panel/submit-button";
import { LivePreviewLayout } from "@/components/panel/live-preview/live-preview-layout";
import { StatusLine, type StatusTone } from "@/components/panel/status-line";
import { WhereItShows } from "@/components/panel/where-it-shows";
import { DEAL_LIMITS, DEALS_NOTICES, dealState, readDealsNotice, type DealState } from "@/lib/deals";
import { LISTING_PAGE_PATH, requireCustomerAccess } from "@/lib/server/customer-access";
import { getDealsPage } from "@/lib/server/deals";
import { livePreviewBase, livePreviewSource } from "@/lib/server/live-preview";
import { editDealAction, postDealAction, removeDealAction } from "./actions";

export const metadata: Metadata = { title: "Deals" };

const INPUT =
  "mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-4 py-2.5 text-base text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";
const LABEL = "text-[0.8125rem] text-ink-soft";

interface DealsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

const STATE_LINES: Readonly<Record<DealState, { readonly tone: StatusTone; readonly text: string }>> = {
  on: { tone: "done", text: "On show" },
  upcoming: { tone: "waiting", text: "Starts soon" },
  ended: { tone: "quiet", text: "Ended" },
  "taken-down": { tone: "stopped", text: "Taken down" },
};

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function day(iso: string): string {
  return DATE.format(new Date(`${iso}T00:00:00Z`));
}

function Notice({ code }: { readonly code: string | string[] | undefined }): ReactElement | null {
  const notice = readDealsNotice(code);
  if (notice === null) return null;
  const { ok, text } = DEALS_NOTICES[notice];
  return (
    <p role="status" className={`mt-6 max-w-2xl rounded-control px-4 py-3 text-sm ${ok ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep"}`}>
      {text}
    </p>
  );
}

/** The five fields of a deal, filled in from `deal` when editing. */
function DealFields({ deal, today, idPrefix }: { readonly deal?: DirectoryDeal; readonly today: string; readonly idPrefix: string }): ReactElement {
  return (
    <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-title`} className={LABEL}>
          Offer <RequiredMark />
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          required
          maxLength={DEAL_LIMITS.title}
          defaultValue={deal?.title ?? ""}
          placeholder="20% off your first haircut"
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-badge`} className={LABEL}>
          Stamp <RequiredMark />
        </label>
        <input id={`${idPrefix}-badge`} name="badge" required maxLength={DEAL_LIMITS.badge} defaultValue={deal?.badge ?? ""} placeholder="20% off" className={INPUT} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-terms`} className={LABEL}>
          Small print <RequiredMark />
        </label>
        <input id={`${idPrefix}-terms`} name="terms" required maxLength={DEAL_LIMITS.terms} defaultValue={deal?.terms ?? ""} placeholder="Weekdays before 5 pm" className={INPUT} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-starts`} className={LABEL}>
          From
        </label>
        <input id={`${idPrefix}-starts`} name="startsOn" type="date" defaultValue={deal?.startsOn ?? today} className={INPUT} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-ends`} className={LABEL}>
          Until
        </label>
        <input id={`${idPrefix}-ends`} name="endsOn" type="date" min={today} defaultValue={deal?.endsOn ?? ""} className={INPUT} />
      </div>
    </div>
  );
}

function DealRow({ deal, today }: { readonly deal: DirectoryDeal; readonly today: string }): ReactElement {
  const state = dealState(deal, today);
  const line = STATE_LINES[state];
  const editable = deal.status === "live";
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full bg-accent-pale px-2.5 py-0.5 text-[0.75rem] font-semibold text-accent-deep">{deal.badge}</span>
            <span className="font-serif text-xl">{deal.title}</span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {deal.terms} · <span className="tabular-nums">{day(deal.startsOn)}</span> to <span className="tabular-nums">{day(deal.endsOn)}</span>
          </p>
        </div>
        <StatusLine tone={line.tone}>{line.text}</StatusLine>
      </div>
      {deal.status === "taken_down" && deal.takenDownReason !== null ? (
        <p className="mt-3 max-w-2xl text-sm text-accent-deep">We took this down: {deal.takenDownReason}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        {editable ? (
          <details className="group w-full">
            <summary className="link-underline w-fit cursor-pointer list-none text-sm text-ink">Edit</summary>
            <form action={editDealAction} className="mt-4 grid gap-4">
              <input type="hidden" name="dealId" value={deal.id} />
              <DealFields deal={deal} today={today} idPrefix={`deal-${deal.id}`} />
              <div>
                <SubmitButton size="sm" variant="secondary">
                  Save
                </SubmitButton>
              </div>
            </form>
          </details>
        ) : null}
        <form action={removeDealAction}>
          <input type="hidden" name="dealId" value={deal.id} />
          <button type="submit" className="link-underline text-sm text-ink-soft">
            Remove
          </button>
        </form>
      </div>
    </li>
  );
}

/**
 * The owner's deals: post a new one, and edit, end or remove the ones they have. A deal is on show from its first day
 * to its last on the home page for the area, the business's own page and its card on the list pages.
 */
export default async function DealsPage({ searchParams }: DealsPageProps): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const [page, params] = await Promise.all([getDealsPage(customer, new Date()), searchParams]);

  if (page.claim === null || page.claim.status === "rejected") {
    return (
      <>
        <h1 className="panel-title">Deals</h1>
        <p className="mt-6 max-w-prose text-sm text-ink-soft">Add your business first, and then you can post deals.</p>
        <div className="mt-6">
          <ButtonLink href={LISTING_PAGE_PATH} size="sm" variant="secondary">
            Go to Business profile
          </ButtonLink>
        </div>
      </>
    );
  }

  const running = page.deals.filter((deal) => deal.status === "live" && deal.endsOn >= page.today).length;
  // The business's page beside the forms, once it has one: with the offers on show as our database has them now, and a deal
  // being typed added to them.
  const now = new Date();
  const placeId = page.claim.placeId;
  const previewSource = livePreviewSource(placeId, now);
  const previewBase = previewSource === null || placeId === null ? null : await livePreviewBase({ businessId: customer.tenant.businessId, placeId, now });
  return (
    <LivePreviewLayout source={previewSource} base={previewBase} section="offers">
      <h1 className="panel-title">Deals</h1>
      <Notice code={params.notice} />
      {page.claim.status === "pending" ? (
        <div className="mt-6">
          <StatusLine tone="waiting">Deals show once we&rsquo;ve confirmed the business is yours.</StatusLine>
        </div>
      ) : null}
      <section aria-labelledby="new-deal-title" className="mt-10 border-t border-line pt-6">
        <h2 id="new-deal-title" className="panel-section">
          New deal
        </h2>
        <div className="mt-1">
          <WhereItShows spot="offers" caption="Your deals show as cards in the Offers section of your page." />
        </div>
        {running >= DEAL_LIMITS.liveMax ? (
          <p className="mt-4 text-sm text-ink-soft">You have {DEAL_LIMITS.liveMax} running. End one to add another.</p>
        ) : (
          <form action={postDealAction} className="mt-4 grid gap-4">
            <DealFields today={page.today} idPrefix="new-deal" />
            <div>
              <SubmitButton size="sm">Put it up</SubmitButton>
            </div>
          </form>
        )}
      </section>
      <section aria-labelledby="your-deals-title" className="mt-10 border-t border-line pt-6">
        <h2 id="your-deals-title" className="panel-section">
          Your deals
        </h2>
        {page.deals.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">None yet.</p>
        ) : (
          <ul className="mt-2 max-w-3xl divide-y divide-line">
            {page.deals.map((deal) => (
              <DealRow key={deal.id} deal={deal} today={page.today} />
            ))}
          </ul>
        )}
      </section>
    </LivePreviewLayout>
  );
}
