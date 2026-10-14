import Link from "next/link";
import type { ReactElement } from "react";
import { ArrowIcon, CardIcon, CheckCircleIcon } from "@firstfold/shared/ui/icons";
import type { BillingBannerModel } from "@firstfold/shared/lib/billing/payment-step";
import { cn } from "@firstfold/shared/lib/cn";

interface BillingBannerProps {
  /** What to say and where the button goes. See billingBanner. */
  readonly banner: BillingBannerModel;
  readonly className?: string;
}

const EYEBROW: Readonly<Record<BillingBannerModel["kind"], string>> = {
  pay: "Action required",
  retrying: "Payment issue",
  reactivate: "Plan ended",
  notice: "Payment received",
};

const BUTTON_CLASS =
  "group inline-flex shrink-0 items-center justify-center gap-3 rounded-full bg-highlight-soft px-6 py-3.5 text-sm font-semibold text-ink shadow-[0_10px_30px_-18px_rgba(0,0,0,0.6)] transition-colors duration-300 ease-calm hover:bg-paper";
const ARROW_CLASS = "size-4 transition-transform duration-300 ease-calm group-hover:translate-x-1";

function BannerIcon({ kind }: { readonly kind: BillingBannerModel["kind"] }): ReactElement {
  const icon = kind === "notice" ? <CheckCircleIcon className="size-6" /> : <CardIcon className="size-6" />;
  return (
    <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-paper/10">
      {icon}
    </span>
  );
}

/**
 * The payment banner, shown while the customer has no paid period. It is an invitation or a status, not an error,
 * so it wears the brand's colours rather than a warning's, and it cannot be dismissed.
 *
 * The line above the title ("Action required") says what state the account is in, so it is read, not decoration:
 * sentence case at 13px, paper at 80% (8.9:1 on dark-surface). It was a 10px uppercase eyebrow at 60%.
 */
export function BillingBanner({ banner, className }: BillingBannerProps): ReactElement {
  return (
    <section
      aria-label="Payment"
      data-surface="dark"
      className={cn(
        "flex flex-col gap-5 rounded-card bg-dark-surface px-6 py-5 text-paper shadow-[0_24px_60px_-40px_rgba(42,13,16,0.9)] md:flex-row md:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <BannerIcon kind={banner.kind} />
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-paper/80">{EYEBROW[banner.kind]}</p>
          <p className="mt-1 font-serif text-xl leading-tight">{banner.title}</p>
          {banner.message === undefined ? null : (
            <p className="mt-1 text-sm leading-relaxed text-paper/80">{banner.message}</p>
          )}
        </div>
      </div>

      {banner.kind === "pay" ? (
        <div className="flex flex-wrap items-center gap-5 md:flex-nowrap">
          {banner.price === null ? null : (
            <p className="md:border-l md:border-paper/20 md:pl-6">
              <span className="block font-serif text-2xl leading-none tabular-nums">{banner.price.amount}</span>
              <span className="mt-1 block whitespace-nowrap text-xs text-paper/80">{banner.price.term}</span>
            </p>
          )}
          <Link href={banner.action.href} className={BUTTON_CLASS}>
            {banner.action.label}
            <ArrowIcon className={ARROW_CLASS} />
          </Link>
        </div>
      ) : banner.kind === "reactivate" || banner.kind === "retrying" ? (
        <Link href={banner.action.href} className={BUTTON_CLASS}>
          {banner.action.label}
          <ArrowIcon className={ARROW_CLASS} />
        </Link>
      ) : null}
    </section>
  );
}
