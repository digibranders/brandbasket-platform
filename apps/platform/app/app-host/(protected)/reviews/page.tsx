import type { Metadata } from "next";
import { brandText } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { listReviewsForOwner } from "@firstfold/db";
import { ArrowIcon } from "@firstfold/shared/ui/icons";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { ReviewsList } from "@/components/panel/reviews/reviews-list";
import { leadsPaging, requestedLeadsPage, type LeadsPaging } from "@/lib/leads";
import { REVIEWS_PATH, REVIEWS_PER_PAGE, requestedReviewFilter } from "@/lib/owner-replies";
import { LISTING_PAGE_PATH, requireCustomerAccess } from "@/lib/server/customer-access";
import { getStaffDb } from "@/lib/server/db";
import { getOwnedDirectoryBusiness } from "@/lib/server/owner-business";
import { editReplyAction, postReplyAction, removeReplyAction } from "./actions";

export const metadata: Metadata = { title: "Reviews" };

interface ReviewsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** What the page says while the free account's business can't have reviews to answer yet. */
const WAITING = {
  "no-business": { text: "Add your business, and the reviews people leave for it show up here.", action: "Add your business" },
  pending: { text: "Your reviews show up here once your business is live on Firstfold Local.", action: "Go to Business profile" },
  rejected: { text: "We couldn't confirm your business, so it has no page for reviews to come from.", action: "Go to Business profile" },
} as const;

function reviewsHref(page: number, filter: "all" | "unanswered"): string {
  const query = new URLSearchParams();
  if (filter === "unanswered") query.set("filter", "unanswered");
  if (page !== 1) query.set("page", String(page));
  const text = query.toString();
  return text === "" ? REVIEWS_PATH : `${REVIEWS_PATH}?${text}`;
}

function Pager({ paging, filter }: { readonly paging: LeadsPaging; readonly filter: "all" | "unanswered" }): ReactElement | null {
  if (paging.pageCount === 1) return null;
  return (
    <nav aria-label="Pages of reviews" className="mt-6 flex items-center justify-between gap-4 text-sm">
      {paging.newerPage === null ? (
        <span />
      ) : (
        <a href={reviewsHref(paging.newerPage, filter)} className="group inline-flex items-center gap-2 font-semibold text-accent">
          <ArrowIcon className="size-4 rotate-180 transition-transform duration-300 ease-calm group-hover:-translate-x-1" />
          Newer
        </a>
      )}
      <span className="tabular-nums text-ink-soft">
        Page {paging.page} of {paging.pageCount}
      </span>
      {paging.olderPage === null ? (
        <span />
      ) : (
        <a href={reviewsHref(paging.olderPage, filter)} className="group inline-flex items-center gap-2 font-semibold text-accent">
          Older
          <ArrowIcon className="size-4 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
        </a>
      )}
    </nav>
  );
}

/**
 * The reviews visitors left on the business's page in the directory, with the owner's answers under them. Free for every
 * verified owner on any plan. A review nobody has answered is marked and has its reply box open; the owner's answers
 * wear an "Owner" tag here and on the public page. An account whose business isn't confirmed yet is told where it
 * stands, as on Leads.
 */
export default async function ReviewsPage({ searchParams }: ReviewsPageProps): Promise<ReactElement> {
  await requireCustomerAccess({ listingAccount: "allow" });
  const owner = await getOwnedDirectoryBusiness();
  if (owner.kind === "signed_out") notFound();
  if (owner.kind === "not_owner") {
    if (owner.waiting === null) notFound();
    const brand = await requestBrand();
    const waiting = WAITING[owner.waiting];
    return (
      <>
        <h1 className="panel-title">Reviews</h1>
        <p className="mt-6 max-w-prose text-sm text-ink-soft">{brandText(waiting.text, brand)}</p>
        <div className="mt-6">
          <ButtonLink href={LISTING_PAGE_PATH} size="sm" variant="secondary">
            {waiting.action}
          </ButtonLink>
        </div>
      </>
    );
  }

  const params = await searchParams;
  const filter = requestedReviewFilter(params.filter);
  const requested = requestedLeadsPage(params.page);
  const read = (offset: number): ReturnType<typeof listReviewsForOwner> =>
    listReviewsForOwner(getStaffDb(), owner.business, { filter, limit: REVIEWS_PER_PAGE, offset });
  let page = await read((requested - 1) * REVIEWS_PER_PAGE);
  const paging = leadsPaging(page.total, requested, REVIEWS_PER_PAGE);
  // A page past the end (only a hand-typed address) shows the last page instead.
  if (paging.page !== requested) page = await read(paging.offset);

  const figures = [
    { label: "Need a reply", value: page.unanswered },
    { label: "All reviews", value: page.all },
  ];
  return (
    <>
      <h1 className="panel-title">Reviews</h1>
      <dl className="mt-8 flex flex-wrap gap-x-14 gap-y-6">
        {figures.map((figure) => (
          <div key={figure.label} className="flex flex-col-reverse gap-1">
            <dt className="text-sm text-ink-soft">{figure.label}</dt>
            <dd className="heading-display text-5xl tabular-nums text-ink">{figure.value.toLocaleString("en-IN")}</dd>
          </div>
        ))}
      </dl>

      {page.all === 0 ? (
        <p className="mt-10 max-w-3xl border-t border-line pt-6 text-sm text-ink-soft">
          None yet. When someone rates your business on its page, their review shows up here and you can answer it.
        </p>
      ) : (
        <section aria-label="Your reviews" className="mt-10 max-w-3xl">
          <nav aria-label="Which reviews" className="mb-5 flex gap-6 text-sm">
            <a href={reviewsHref(1, "all")} aria-current={filter === "all" ? "true" : undefined} className={filter === "all" ? "font-semibold text-accent" : "text-ink-soft hover:text-ink"}>
              All
            </a>
            <a
              href={reviewsHref(1, "unanswered")}
              aria-current={filter === "unanswered" ? "true" : undefined}
              className={filter === "unanswered" ? "font-semibold text-accent" : "text-ink-soft hover:text-ink"}
            >
              Need a reply
            </a>
          </nav>
          {page.reviews.length === 0 ? (
            <p className="border-t border-line pt-6 text-sm text-ink-soft">You have answered every review.</p>
          ) : (
            <>
              <ReviewsList reviews={page.reviews} postAction={postReplyAction} editAction={editReplyAction} removeAction={removeReplyAction} />
              <Pager paging={paging} filter={filter} />
            </>
          )}
        </section>
      )}
    </>
  );
}
