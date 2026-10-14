import {
  countDirectoryComments,
  countDirectoryEnquiries,
  countDirectoryReviews,
  countDirectoryTrusted,
  countDirectoryVerifications,
  countDirectoryVisitors,
  listDirectoryCommentsForStaff,
  listDirectoryEnquiriesForStaff,
  listDirectoryReviewsForStaff,
  listDirectoryVerifications,
  listDirectoryVisitorsForStaff,
  type StaffDirectoryComment,
  type StaffDirectoryEnquiry,
  type StaffDirectoryReview,
  type StaffDirectoryVerification,
  type StaffDirectoryVisitor,
} from "@firstfold/db";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactElement } from "react";
import { directoryHighlightLabel } from "@firstfold/shared/lib/directory-highlights";
import { phoneCountryOptions } from "@firstfold/shared/server/phone-countries";
import { visitorPhoneCountry } from "@firstfold/shared/server/phone-defaults";
import { displayPhone, maskPhone } from "@firstfold/shared/server/phone-display";
import { MaskedPhone } from "@/components/masked-phone";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@firstfold/shared/ui/forms/submit-gate";
import { SearchIcon } from "@firstfold/shared/ui/icons";
import { LocalDateTime } from "@firstfold/shared/ui/panel/local-date-time";
import { buttonDanger, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses } from "@/components/console/field-styles";
import { FilterPills } from "@/components/console/filter-pills";
import { Figures } from "@/components/console/figures";
import { EmptyLine } from "@/components/console/hairline-list";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { StatusDot } from "@/components/console/status-dot";
import { TagChips } from "@/components/directory-tag-marks";
import { VerifyBusinessForm } from "@/components/verify-business-form";
import {
  DIRECTORY_NOTICES,
  DIRECTORY_PAGE_SIZE,
  directoryHref,
  pageCount,
  parseDirectoryNotice,
  parseDirectoryView,
  type DirectoryView,
} from "@/lib/directory-view";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import {
  deleteVisitorAction,
  hideCommentAction,
  hideReviewAction,
  markEnquiryHandledAction,
  giveTrustedAction,
  removeTrustedAction,
  removeVerificationAction,
  restoreCommentAction,
  restoreReviewAction,
  verifyBusinessAction,
} from "./actions";

export const metadata: Metadata = { title: "Directory" };

type ViewOf<S extends DirectoryView["section"]> = Extract<DirectoryView, { readonly section: S }>;

const ROW_CLASSES =
  "grid gap-x-6 gap-y-3 border-b border-line py-5 pl-1 pr-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start";
const ROW_BUTTON = "px-4 py-1.5";

/** The view the row's form posts back, so its action redirects to the same list. */
function ViewFields({ view }: { readonly view: DirectoryView }): ReactElement {
  return (
    <>
      <input type="hidden" name="show" value={view.section} />
      {view.section === "verified" || view.section === "visitors" ? (
        <input type="hidden" name="q" value={view.search} />
      ) : (
        <input type="hidden" name="status" value={view.status} />
      )}
      <input type="hidden" name="page" value={view.page} />
    </>
  );
}

/** The search box above a searchable list: submits `q` back to the same section. */
function SectionSearch({
  section,
  search,
  label,
  placeholder,
}: {
  readonly section: "verified" | "visitors";
  readonly search: string;
  readonly label: string;
  readonly placeholder: string;
}): ReactElement {
  const id = `${section}-search`;
  return (
    <form action="/directory" role="search" className="w-full sm:w-80">
      <input type="hidden" name="show" value={section} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <input
          id={id}
          name="q"
          type="search"
          maxLength={200}
          defaultValue={search}
          placeholder={placeholder}
          className="block w-full rounded-full border border-ink-soft/65 bg-card py-2.5 pl-11 pr-4 text-sm text-ink transition-[border-color,box-shadow] duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
        />
      </div>
    </form>
  );
}

function PhoneLink({ phone }: { readonly phone: string | null }): ReactElement {
  if (phone === null) return <span className="text-ink-soft">Number erased</span>;
  const shown = displayPhone(phone);
  return shown.href === null ? (
    <span>{shown.text}</span>
  ) : (
    <a href={shown.href} className="link-underline tabular-nums">
      {shown.text}
    </a>
  );
}

function When({ at }: { readonly at: Date }): ReactElement {
  return (
    <span className="text-sm tabular-nums text-ink-soft">
      <LocalDateTime iso={at.toISOString()} variant="timestamp" />
    </span>
  );
}

function EnquiryRow({ enquiry, view }: { readonly enquiry: StaffDirectoryEnquiry; readonly view: DirectoryView }): ReactElement {
  const about =
    enquiry.kind === "business"
      ? { title: enquiry.businessName ?? "A business", sub: `${enquiry.serviceLabel} · ${enquiry.areaLabel}` }
      : { title: `Top ${enquiry.serviceLabel.toLowerCase()} in ${enquiry.areaLabel}`, sub: "Asked for the list" };
  return (
    <li className={ROW_CLASSES}>
      <div className="min-w-0">
        <p className="truncate text-[0.98rem] font-semibold">{about.title}</p>
        <p className="mt-0.5 truncate text-sm text-ink-soft">{about.sub}</p>
        <p className="mt-3 text-sm">
          {enquiry.name} · <PhoneLink phone={enquiry.phone} />
        </p>
        {enquiry.message === null ? null : <p className="mt-1 max-w-2xl whitespace-pre-wrap break-words">{enquiry.message}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:flex-col sm:items-end">
        <When at={enquiry.createdAt} />
        {enquiry.status === "new" ? (
          <form action={markEnquiryHandledAction}>
            <input type="hidden" name="id" value={enquiry.id} />
            <ViewFields view={view} />
            <button type="submit" className={`${buttonSecondary} ${ROW_BUTTON}`}>
              Mark handled
            </button>
          </form>
        ) : (
          <StatusDot tone="done" label="Handled" />
        )}
      </div>
    </li>
  );
}

function Stars({ rating }: { readonly rating: number }): ReactElement {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="text-base leading-none tracking-[0.1em]">
        <span className="text-accent">{"★".repeat(rating)}</span>
        <span className="text-ink-soft/65">{"★".repeat(Math.max(0, 5 - rating))}</span>
      </span>
      <span className="text-sm tabular-nums text-ink-soft">
        {rating}
        <span className="sr-only"> out of 5</span>
      </span>
    </span>
  );
}

function ReviewRow({ review, view }: { readonly review: StaffDirectoryReview; readonly view: DirectoryView }): ReactElement {
  const hidden = review.status === "hidden";
  return (
    <li className={ROW_CLASSES}>
      <div className="min-w-0">
        <p className="truncate text-[0.98rem] font-semibold">{review.businessName}</p>
        {/* A review left by place id has no address; staff see the business's permanent id instead. */}
        <p className="mt-0.5 truncate text-sm text-ink-soft">{review.listingKey ?? review.placeId}</p>
        <p className="mt-3">
          <Stars rating={review.rating} />
        </p>
        {review.text === null ? null : <p className="mt-1 max-w-2xl whitespace-pre-wrap break-words">{review.text}</p>}
        {review.highlights.length === 0 ? null : (
          <p className="mt-1 text-sm text-ink-soft">{review.highlights.map(directoryHighlightLabel).join(" · ")}</p>
        )}
        <p className="mt-2 text-sm">
          {review.reviewerName} · <MaskedPhone phone={review.phone} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:flex-col sm:items-end">
        <When at={review.createdAt} />
        <StatusDot tone={hidden ? "quiet" : "done"} label={hidden ? "Hidden" : "Published"} />
        <form action={hidden ? restoreReviewAction : hideReviewAction}>
          <input type="hidden" name="id" value={review.id} />
          <ViewFields view={view} />
          <button type="submit" className={`${hidden ? buttonSecondary : buttonDanger} ${ROW_BUTTON}`}>
            {hidden ? "Restore" : "Hide"}
          </button>
        </form>
      </div>
    </li>
  );
}

function CommentRow({ comment, view }: { readonly comment: StaffDirectoryComment; readonly view: DirectoryView }): ReactElement {
  const hidden = comment.status === "hidden";
  return (
    <li className={ROW_CLASSES}>
      <div className="min-w-0">
        <p className="whitespace-pre-wrap break-words">{comment.text}</p>
        <p className="mt-2 text-sm">
          {comment.authorKind === "owner" ? (
            // The business's own answer: a signed-in account, with no number to call.
            <>
              <b className="font-semibold text-accent-deep">Owner</b> · {comment.commenterName}
            </>
          ) : (
            <>
              {comment.commenterName}
              {comment.phone === null ? null : (
                <>
                  {" · "}
                  <MaskedPhone phone={comment.phone} />
                </>
              )}
            </>
          )}
        </p>
        {/* The review it answers, so a comment is read in its context. */}
        <p className="mt-3 truncate text-sm text-ink-soft">
          On {comment.reviewerName}&rsquo;s review of {comment.businessName}
          {comment.reviewText === null ? "" : `: “${comment.reviewText}”`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:flex-col sm:items-end">
        <When at={comment.createdAt} />
        <StatusDot tone={hidden ? "quiet" : "done"} label={hidden ? "Hidden" : "Published"} />
        <form action={hidden ? restoreCommentAction : hideCommentAction}>
          <input type="hidden" name="id" value={comment.id} />
          <ViewFields view={view} />
          <button type="submit" className={`${hidden ? buttonSecondary : buttonDanger} ${ROW_BUTTON}`}>
            {hidden ? "Restore" : "Hide"}
          </button>
        </form>
      </div>
    </li>
  );
}

/**
 * A verified business. Remove sits behind a disclosure with a required confirm box, since the website drops the tag
 * and the number straight away; it works without JavaScript.
 */
function VerificationRow({
  verification,
  view,
}: {
  readonly verification: StaffDirectoryVerification;
  readonly view: DirectoryView;
}): ReactElement {
  return (
    <li className={ROW_CLASSES}>
      <div className="min-w-0">
        <p className="truncate text-[0.98rem] font-semibold">{verification.businessName}</p>
        <p className="mt-0.5 break-all text-sm text-ink-soft">{verification.listingKey}</p>
        <TagChips verified trusted={verification.trusted} className="mt-3" />
        <p className="mt-2 text-sm">
          {verification.phone === null ? <span className="text-ink-soft">No number shown</span> : <PhoneLink phone={verification.phone} />}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:flex-col sm:items-end">
        <When at={verification.verifiedAt} />
        <span className="text-sm text-ink-soft">By {verification.verifiedByName}</span>
        <form action={verification.trusted ? removeTrustedAction : giveTrustedAction}>
          <input type="hidden" name="key" value={verification.listingKey} />
          <ViewFields view={view} />
          <button type="submit" className={`${buttonSecondary} ${ROW_BUTTON}`}>
            {verification.trusted ? "Take away Trusted" : "Give Trusted"}
          </button>
        </form>
        <details className="group sm:text-right">
          <summary className={`${buttonDanger} ${ROW_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <span className="group-open:hidden">Remove</span>
            <span className="hidden group-open:inline">Keep it</span>
          </summary>
          <form action={removeVerificationAction} className="mt-4 max-w-xs space-y-3 text-left">
            <input type="hidden" name="key" value={verification.listingKey} />
            <ViewFields view={view} />
            <label className="flex items-start gap-3 text-sm font-medium">
              <input type="checkbox" name="confirm" required className={checkboxClasses} />
              <span>
                Yes, remove {verification.businessName}&rsquo;s verification. The website stops showing its tag and number.
                <RequiredMark />
              </span>
            </label>
            <GatedSubmitButton className={`${buttonDanger} ${ROW_BUTTON}`}>Remove verification</GatedSubmitButton>
          </form>
        </details>
      </div>
    </li>
  );
}

function VerificationList({
  rows,
  view,
}: {
  readonly rows: readonly StaffDirectoryVerification[];
  readonly view: ViewOf<"verified">;
}): ReactElement {
  if (rows.length === 0) {
    return (
      <EmptyLine>
        {view.search === "" ? "Nothing verified yet. Paste a business's page above to verify it." : "No verified business matches this."}
      </EmptyLine>
    );
  }
  return (
    <ul aria-label="Verified businesses" className="mt-6 border-t border-line">
      {rows.map((verification) => (
        <VerificationRow key={verification.listingKey} verification={verification} view={view} />
      ))}
    </ul>
  );
}

/** Verify a business, then the verified ones, searchable by name. */
async function VerifiedSection({
  view,
  rows,
}: {
  readonly view: ViewOf<"verified">;
  readonly rows: readonly StaffDirectoryVerification[];
}): Promise<ReactElement> {
  const defaultPhoneCountry = visitorPhoneCountry(await headers());
  return (
    <>
      <section aria-labelledby="verify-heading" className="mt-10">
        <h2 id="verify-heading" className="font-serif text-xl">
          Verify a business
        </h2>
        <VerifyBusinessForm
          action={verifyBusinessAction}
          phoneCountries={phoneCountryOptions()}
          defaultPhoneCountry={defaultPhoneCountry}
        />
      </section>

      <section aria-labelledby="verified-heading" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <h2 id="verified-heading" className="font-serif text-xl">
            Verified businesses
          </h2>
          <SectionSearch section="verified" search={view.search} label="Search verified businesses" placeholder="Business name" />
        </div>
        {view.search === "" ? null : (
          <p className="mt-5 text-sm text-ink-soft">
            Matches for &ldquo;{view.search}&rdquo;.{" "}
            <Link href={directoryHref({ ...view, search: "", page: 1 })} className="link-underline">
              Clear
            </Link>
          </p>
        )}
        <VerificationList rows={rows} view={view} />
      </section>
    </>
  );
}

function VisitorRow({ visitor, view }: { readonly visitor: StaffDirectoryVisitor; readonly view: DirectoryView }): ReactElement {
  return (
    <li className={ROW_CLASSES}>
      <div className="min-w-0">
        <p className="truncate text-[0.98rem] font-semibold">{visitor.name}</p>
        <p className="mt-0.5 text-sm tabular-nums text-ink-soft">{maskPhone(visitor.phone)}</p>
      </div>
      <div className="flex flex-col gap-1 sm:items-end">
        <span className="text-sm text-ink-soft">
          Last seen <When at={visitor.lastSeenAt} />
        </span>
        <span className="text-sm text-ink-soft">
          Joined <When at={visitor.createdAt} />
        </span>
        <details className="group sm:text-right">
          <summary className={`${buttonDanger} ${ROW_BUTTON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <span className="group-open:hidden">Delete</span>
            <span className="hidden group-open:inline">Keep it</span>
          </summary>
          <form action={deleteVisitorAction} className="mt-4 max-w-xs space-y-3 text-left">
            <input type="hidden" name="id" value={visitor.id} />
            <ViewFields view={view} />
            <label className="flex items-start gap-3 text-sm font-medium">
              <input type="checkbox" name="confirm" required className={checkboxClasses} />
              <span>Yes, delete {visitor.name}&rsquo;s account. Reviews, comments and enquiries they sent stay until deleted from their own lists.<RequiredMark /></span>
            </label>
            <GatedSubmitButton className={`${buttonDanger} ${ROW_BUTTON}`}>Delete account</GatedSubmitButton>
          </form>
        </details>
      </div>
    </li>
  );
}

/** Website visitor accounts: who signed up with a number and a code. Numbers are masked: nobody here is to be called. */
function VisitorsSection({
  view,
  rows,
}: {
  readonly view: ViewOf<"visitors">;
  readonly rows: readonly StaffDirectoryVisitor[];
}): ReactElement {
  return (
    <section aria-labelledby="visitors-heading" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <h2 id="visitors-heading" className="font-serif text-xl">
          Website visitors
        </h2>
        <SectionSearch section="visitors" search={view.search} label="Search visitors" placeholder="Name or full number" />
      </div>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Visitors made an account by confirming a code, to review, comment or send an enquiry. Their numbers show only in
        part, as they have no reason to be called from here. Search a full number to find one account, and delete it if its owner
        asks. Accounts nobody has come back to for 24 months are deleted automatically.
      </p>
      {view.search === "" ? null : (
        <p className="mt-5 text-sm text-ink-soft">
          Matches for &ldquo;{view.search}&rdquo;.{" "}
          <Link href={directoryHref({ ...view, search: "", page: 1 })} className="link-underline">
            Clear
          </Link>
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyLine>{view.search === "" ? "No visitor has made an account yet." : "No visitor matches this."}</EmptyLine>
      ) : (
        <ul aria-label="Website visitors" className="mt-6 border-t border-line">
          {rows.map((visitor) => (
            <VisitorRow key={visitor.id} visitor={visitor} view={view} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EnquiryList({ rows, view }: { readonly rows: readonly StaffDirectoryEnquiry[]; readonly view: ViewOf<"enquiries"> }): ReactElement {
  if (rows.length === 0) return <EmptyLine>{view.status === "new" ? "No new enquiries." : "Nothing handled yet."}</EmptyLine>;
  return (
    <ul aria-label="Enquiries" className="mt-6 border-t border-line">
      {rows.map((enquiry) => (
        <EnquiryRow key={enquiry.id} enquiry={enquiry} view={view} />
      ))}
    </ul>
  );
}

function ReviewList({ rows, view }: { readonly rows: readonly StaffDirectoryReview[]; readonly view: ViewOf<"reviews"> }): ReactElement {
  if (rows.length === 0) return <EmptyLine>{view.status === "hidden" ? "No hidden reviews." : "No reviews yet."}</EmptyLine>;
  return (
    <ul aria-label="Reviews" className="mt-6 border-t border-line">
      {rows.map((review) => (
        <ReviewRow key={review.id} review={review} view={view} />
      ))}
    </ul>
  );
}

function CommentList({ rows, view }: { readonly rows: readonly StaffDirectoryComment[]; readonly view: ViewOf<"comments"> }): ReactElement {
  if (rows.length === 0) return <EmptyLine>{view.status === "hidden" ? "No hidden comments." : "No comments yet."}</EmptyLine>;
  return (
    <ul aria-label="Comments" className="mt-6 border-t border-line">
      {rows.map((comment) => (
        <CommentRow key={comment.id} comment={comment} view={view} />
      ))}
    </ul>
  );
}

function Pager({ view, pages }: { readonly view: DirectoryView; readonly pages: number }): ReactElement | null {
  if (pages <= 1) return null;
  const linkClasses = "link-underline text-sm font-semibold text-ink-soft hover:text-ink";
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-6 text-sm tabular-nums text-ink-soft">
      {view.page > 1 ? (
        <Link href={directoryHref({ ...view, page: view.page - 1 })} className={linkClasses}>
          ‹ Newer
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {view.page} of {pages}
      </span>
      {view.page < pages ? (
        <Link href={directoryHref({ ...view, page: view.page + 1 })} className={linkClasses}>
          Older ›
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** One page of the section `view` shows, with the view narrowed to that section for its list. */
type SectionList =
  | { readonly section: "enquiries"; readonly view: ViewOf<"enquiries">; readonly rows: readonly StaffDirectoryEnquiry[]; readonly total: number }
  | { readonly section: "reviews"; readonly view: ViewOf<"reviews">; readonly rows: readonly StaffDirectoryReview[]; readonly total: number }
  | { readonly section: "comments"; readonly view: ViewOf<"comments">; readonly rows: readonly StaffDirectoryComment[]; readonly total: number }
  | { readonly section: "verified"; readonly view: ViewOf<"verified">; readonly rows: readonly StaffDirectoryVerification[]; readonly total: number }
  | { readonly section: "visitors"; readonly view: ViewOf<"visitors">; readonly rows: readonly StaffDirectoryVisitor[]; readonly total: number };

async function listFor(view: DirectoryView): Promise<SectionList> {
  const db = getStaffDb();
  const page = { limit: DIRECTORY_PAGE_SIZE, offset: (view.page - 1) * DIRECTORY_PAGE_SIZE };
  switch (view.section) {
    case "enquiries":
      return { section: "enquiries", view, ...(await listDirectoryEnquiriesForStaff(db, { ...page, status: view.status })) };
    case "reviews":
      return { section: "reviews", view, ...(await listDirectoryReviewsForStaff(db, { ...page, status: view.status })) };
    case "comments":
      return { section: "comments", view, ...(await listDirectoryCommentsForStaff(db, { ...page, status: view.status })) };
    case "verified":
      return { section: "verified", view, ...(await listDirectoryVerifications(db, { ...page, search: view.search })) };
    case "visitors":
      return { section: "visitors", view, ...(await listDirectoryVisitorsForStaff(db, { ...page, search: view.search })) };
    default: {
      const unhandled: never = view;
      throw new Error(`Unhandled directory view: ${JSON.stringify(unhandled)}`);
    }
  }
}

function SectionBody({ list }: { readonly list: SectionList }): ReactElement {
  switch (list.section) {
    case "enquiries":
      return <EnquiryList rows={list.rows} view={list.view} />;
    case "reviews":
      return <ReviewList rows={list.rows} view={list.view} />;
    case "comments":
      return <CommentList rows={list.rows} view={list.view} />;
    case "verified":
      return <VerifiedSection rows={list.rows} view={list.view} />;
    case "visitors":
      return <VisitorsSection rows={list.rows} view={list.view} />;
    default: {
      const unhandled: never = list;
      throw new Error(`Unhandled directory section: ${JSON.stringify(unhandled)}`);
    }
  }
}

export default async function DirectoryPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "directory.view" });
  const params = await searchParams;
  const view = parseDirectoryView((name) => params[name]);
  const notice = parseDirectoryNotice(params.done);
  const db = getStaffDb();

  const [enquiryCounts, reviewCounts, commentCounts, verifiedCount, trustedCount, visitorCount, list] = await Promise.all([
    countDirectoryEnquiries(db),
    countDirectoryReviews(db),
    countDirectoryComments(db),
    countDirectoryVerifications(db),
    countDirectoryTrusted(db),
    countDirectoryVisitors(db),
    listFor(view),
  ]);
  const reviewTotal = reviewCounts.published + reviewCounts.hidden;
  const commentTotal = commentCounts.published + commentCounts.hidden;

  return (
    <>
      <PageHeader title="Directory" meta="Enquiries, reviews, verified and trusted businesses and visitor accounts in the local directory on the website." />

      <Figures
        items={[
          { value: enquiryCounts.new, label: "New enquiries", emphasis: enquiryCounts.new > 0 },
          { value: reviewCounts.published, label: "Reviews showing" },
          { value: reviewCounts.hidden, label: "Hidden" },
          { value: verifiedCount, label: "Verified" },
          { value: trustedCount, label: "Trusted" },
          { value: visitorCount, label: "Visitors" },
        ]}
      />

      <div className="mt-10">
        <FilterPills
          label="Section"
          options={[
            {
              href: directoryHref({ section: "enquiries", status: "new", page: 1 }),
              label: "Enquiries",
              count: enquiryCounts.new + enquiryCounts.handled,
              current: view.section === "enquiries",
            },
            {
              href: directoryHref({ section: "reviews", status: "all", page: 1 }),
              label: "Reviews",
              count: reviewTotal,
              current: view.section === "reviews",
            },
            {
              href: directoryHref({ section: "comments", status: "all", page: 1 }),
              label: "Comments",
              count: commentTotal,
              current: view.section === "comments",
            },
            {
              href: directoryHref({ section: "verified", search: "", page: 1 }),
              label: "Verified",
              count: verifiedCount,
              current: view.section === "verified",
            },
            {
              href: directoryHref({ section: "visitors", search: "", page: 1 }),
              label: "Visitors",
              count: visitorCount,
              current: view.section === "visitors",
            },
          ]}
        />
      </div>

      {view.section === "verified" || view.section === "visitors" ? null : (
        <div className="mt-3">
          {view.section === "enquiries" ? (
          <FilterPills
            label="Filter enquiries"
            options={[
              { href: directoryHref({ section: "enquiries", status: "new", page: 1 }), label: "New", count: enquiryCounts.new, current: view.status === "new" },
              {
                href: directoryHref({ section: "enquiries", status: "handled", page: 1 }),
                label: "Handled",
                count: enquiryCounts.handled,
                current: view.status === "handled",
              },
            ]}
          />
        ) : (
          <FilterPills
            label={view.section === "comments" ? "Filter comments" : "Filter reviews"}
            options={(view.section === "comments"
              ? [
                  { section: "comments" as const, label: "All", count: commentTotal, status: "all" as const },
                  { section: "comments" as const, label: "Showing", count: commentCounts.published, status: "published" as const },
                  { section: "comments" as const, label: "Hidden", count: commentCounts.hidden, status: "hidden" as const },
                ]
              : [
                  { section: "reviews" as const, label: "All", count: reviewTotal, status: "all" as const },
                  { section: "reviews" as const, label: "Showing", count: reviewCounts.published, status: "published" as const },
                  { section: "reviews" as const, label: "Hidden", count: reviewCounts.hidden, status: "hidden" as const },
                ]
            ).map((option) => ({
              href: directoryHref({ section: option.section, status: option.status, page: 1 }),
              label: option.label,
              count: option.count,
              current: view.status === option.status,
            }))}
          />
          )}
        </div>
      )}

      {notice === null ? null : (
        <Notice tone={DIRECTORY_NOTICES[notice].ok ? "ok" : "problem"} className="mt-6">
          {DIRECTORY_NOTICES[notice].text}
        </Notice>
      )}

      <SectionBody list={list} />

      <Pager view={view} pages={pageCount(list.total)} />
    </>
  );
}
