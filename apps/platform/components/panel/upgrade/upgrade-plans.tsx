"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@fynix/shared/lib/cn";
import { CrownIcon, TickIcon } from "@fynix/shared/ui/icons";
import { Button } from "@fynix/shared/ui/panel/button";
import type { MembershipTier } from "@/lib/membership";
import type { PaymentSummary } from "@/lib/upgrade-summary";

/** What one card says and can do. The server works out every figure and sentence; this only draws them. */
export interface PlanCardView {
  readonly tier: MembershipTier;
  readonly name: string;
  /** The monthly price before tax ("₹2,999") and what follows it ("a month + 18% GST"); null when no plan is on sale. */
  readonly price: { readonly amount: string; readonly terms: string; readonly inAll: string | null } | null;
  readonly pitch: string;
  readonly list: readonly string[];
  readonly action:
    /** The plan the customer is on: no button, a way to Billing. */
    | { readonly kind: "current"; readonly manageHref: string }
    /** A button that opens the "You pay today" summary, then the way to pay. */
    | {
        readonly kind: "buy";
        readonly label: string;
        /** What the summary's first line is for: "Care plan", or "Premium for the days left". */
        readonly summaryLabel: string;
        readonly summary: PaymentSummary;
        /** What follows the summary on the same card: the code, the invoice details and the Pay button. */
        readonly checkout: ReactNode;
        /** A line after the summary, e.g. what the next payment will be. */
        readonly afterwards?: ReactNode;
      }
    /** Words in place of a button: the plan is on its way, or cannot be bought from here yet. */
    | { readonly kind: "note"; readonly note: ReactNode };
}

interface UpgradePlansProps {
  readonly cards: readonly PlanCardView[];
}

/** Curved rectangles, not the pills the rest of the panel's buttons are. */
const BUTTON_SHAPE = "rounded-[0.625rem]! w-full";

function SummaryRow({ label, value, strong = false }: { readonly label: string; readonly value: string; readonly strong?: boolean }): ReactElement {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", strong ? "border-t border-line pt-3 font-semibold" : "text-ink-soft")}>
      <dt>{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/**
 * The plan cards, side by side and stacked on a phone. A card's button opens its "You pay today" summary below it,
 * with the way to pay, before anything is charged; only one card is open at a time.
 */
export function UpgradePlans({ cards }: UpgradePlansProps): ReactElement {
  const [open, setOpen] = useState<MembershipTier | null>(null);
  const summaryHeading = useRef<HTMLHeadingElement | null>(null);

  // Opening a summary puts the reader at its start, so a keyboard or screen-reader user is not left on the button above.
  useEffect(() => {
    if (open !== null) summaryHeading.current?.focus();
  }, [open]);

  return (
    // Level with each other until one opens its payment, which is far taller: then each keeps its own height.
    <div className={cn("grid gap-5 md:grid-cols-2", open !== null && "items-start")}>
      {cards.map((card) => {
        const premium = card.tier === "premium";
        const current = card.action.kind === "current";
        const isOpen = open === card.tier && card.action.kind === "buy";
        const panelId = `upgrade-summary-${card.tier}`;
        return (
          <section
            key={card.tier}
            aria-labelledby={`upgrade-plan-${card.tier}`}
            className={cn(
              "flex flex-col rounded-card border bg-card p-6 sm:p-7",
              current ? "border-2 border-ink" : premium ? "border-gold-deep/50" : "border-line",
            )}
          >
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {premium ? <CrownIcon className="size-5 fill-gold/45 text-gold-deep" /> : null}
              <h2 id={`upgrade-plan-${card.tier}`} className="font-serif text-xl">
                {card.name}
              </h2>
              {current ? (
                <span className="rounded-[0.375rem] bg-accent-pale px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-deep">
                  Your current plan
                </span>
              ) : null}
            </header>

            {card.price === null ? null : (
              <>
                <p className={cn("mt-5 font-serif text-5xl tabular-nums", premium ? "text-gold-deep" : "text-accent")}>{card.price.amount}</p>
                <p className="mt-1 text-sm text-ink-soft">{card.price.terms}</p>
                {card.price.inAll === null ? null : <p className="text-sm tabular-nums text-ink-soft">{card.price.inAll}</p>}
              </>
            )}

            <p className="mt-5 text-[0.9375rem] leading-relaxed">{card.pitch}</p>

            <ul className="mt-5 space-y-2.5">
              {card.list.map((line) => (
                <li key={line} className="flex items-baseline gap-3 text-[0.9375rem]">
                  <TickIcon className="size-4 shrink-0 translate-y-[0.2rem] text-success" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-7">
              {card.action.kind === "current" ? (
                <p className="text-sm text-ink-soft">
                  <Link href={card.action.manageHref} className="link-underline text-ink">
                    Manage in Billing
                  </Link>
                </p>
              ) : card.action.kind === "note" ? (
                <div className="text-sm leading-relaxed text-ink-soft">{card.action.note}</div>
              ) : (
                <>
                  <Button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : card.tier)}
                    className={cn(BUTTON_SHAPE, "group")}
                  >
                    {premium ? <CrownIcon className="size-4 shrink-0 fill-gold/40 text-gold" /> : null}
                    {card.action.label}
                  </Button>
                  {isOpen ? (
                    <div id={panelId} className="mt-6 border-t border-line pt-6">
                      <h3 ref={summaryHeading} tabIndex={-1} className="panel-section outline-none">
                        You pay today
                      </h3>
                      <dl className="mt-3 text-[0.9375rem]">
                        <SummaryRow label={card.action.summaryLabel} value={card.action.summary.price} />
                        {card.action.summary.discount === null ? null : <SummaryRow label="Your code" value={`−${card.action.summary.discount}`} />}
                        {card.action.summary.tax === null ? null : (
                          <SummaryRow label={card.action.summary.tax.label} value={card.action.summary.tax.amount} />
                        )}
                        <SummaryRow label="Total today" value={card.action.summary.total} strong />
                      </dl>
                      {card.action.afterwards === undefined ? null : (
                        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{card.action.afterwards}</p>
                      )}
                      <div className="mt-6">{card.action.checkout}</div>
                      <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(null)} className="mt-3">
                        Not now
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
