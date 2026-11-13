import Link from "next/link";
import { cx } from "./cx";
import { Icon } from "./icon";

export interface PaginationProps {
  /** 1-based. */
  readonly page: number;
  readonly pageCount: number;
  /** The address of a page, so the page is in the URL and the back button works. */
  readonly hrefFor: (page: number) => string;
  /** Already written for reading, such as "Page 2 of 5". */
  readonly status: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly className?: string;
}

const STEP =
  "inline-flex size-icon-button items-center justify-center rounded-control text-ink-3 no-underline hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Previous and next links with where you are. Shown only when there is more than one page. */
export function Pagination({ page, pageCount, hrefFor, status, previousLabel, nextLabel, className }: PaginationProps) {
  if (pageCount <= 1) return null;
  const hasPrevious = page > 1;
  const hasNext = page < pageCount;
  return (
    <nav aria-label={status} className={cx("flex items-center gap-1", className)}>
      {hasPrevious ? (
        <Link href={hrefFor(page - 1)} aria-label={previousLabel} className={STEP}>
          <Icon name="CaretLeft" size="sm" />
        </Link>
      ) : (
        <span aria-hidden className={cx(STEP, "text-ink-disabled hover:bg-transparent hover:text-ink-disabled")}>
          <Icon name="CaretLeft" size="sm" />
        </span>
      )}
      <span className="px-1 type-meta">{status}</span>
      {hasNext ? (
        <Link href={hrefFor(page + 1)} aria-label={nextLabel} className={STEP}>
          <Icon name="CaretRight" size="sm" />
        </Link>
      ) : (
        <span aria-hidden className={cx(STEP, "text-ink-disabled hover:bg-transparent hover:text-ink-disabled")}>
          <Icon name="CaretRight" size="sm" />
        </span>
      )}
    </nav>
  );
}
