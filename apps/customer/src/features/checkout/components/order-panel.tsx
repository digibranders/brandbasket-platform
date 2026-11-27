"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { LEGAL_LINKS } from "@/features/entry/rules/brand";
import { Banner, Checkbox, Icon } from "@/ui";
import type { BasketView } from "../rules/signup-basket";
import { PayButton } from "./pay-bar";

/*
 * Order Summary: the rows of the services ticked, what is due today, the Terms box, the Pay button on large screens and what
 * follows the first payment (docs/design/checkout-one-screen.html). Every figure arrives worked out in `view`.
 */

interface OrderPanelProps {
  readonly view: BasketView;
  readonly payLabel: string;
  readonly pending: boolean;
  readonly agreed: boolean;
  readonly onAgreedChange: (agreed: boolean) => void;
  /** The message at the Terms box, from the screen (Pay pressed unticked) or the server. */
  readonly agreeError: string | undefined;
  /** A refusal that belongs to no field: shown above Pay. */
  readonly failure: string | null;
  /** The robot check, kept beside Pay. */
  readonly children?: ReactNode;
  /** What closes the panel, below the renewal line: the code box. */
  readonly footer?: ReactNode;
}

export function OrderPanel({ view, payLabel, pending, agreed, onAgreedChange, agreeError, failure, children, footer }: OrderPanelProps) {
  const agreeMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (agreeError !== undefined) agreeMessage.current?.scrollIntoView?.({ block: "center" });
  }, [agreeError]);

  return (
    <article className="flex flex-col gap-4 rounded-overlay border border-border bg-surface p-5 shadow-hero md:p-7">
      <h2 className="type-section text-ink">Order Summary</h2>
      <div aria-live="polite" className="flex flex-col gap-1">
        <ul className="flex flex-col divide-y divide-border-subtle">
          {view.rows.length === 0 ? (
            <li className="py-2 type-body text-ink-3">Your basket is empty</li>
          ) : (
            view.rows.map((row) => (
              <li key={row.key} className="flex justify-between gap-4 py-2 type-body text-ink-2">
                <span className={row.tone === "save" ? "font-medium text-pos-text" : undefined}>
                  {row.note === null ? (
                    row.label
                  ) : (
                    <span className="flex flex-col">
                      <span>{row.label}</span>
                      <span className="type-meta">{row.note}</span>
                    </span>
                  )}
                </span>
                <span className={row.tone === "free" ? "font-medium text-pos-text" : row.tone === "save" ? "font-mono font-medium tabular-nums text-pos-text" : "font-mono tabular-nums text-ink"}>{row.amount}</span>
              </li>
            ))
          )}
        </ul>
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <span className="type-sub font-semibold text-ink">{view.dueLabel}</span>
          <span className="type-metric tabular-nums text-ink">{view.due}</span>
        </div>
        {view.gstLine === null ? null : <p className="mt-1 text-right font-sans text-xs text-ink-3">{view.gstLine}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <Checkbox
          checked={agreed}
          onCheckedChange={onAgreedChange}
          label={
            <>
              I agree to the{" "}
              <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer">
                Terms
              </a>{" "}
              and the{" "}
              <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer">
                Privacy Notice
              </a>
              .
            </>
          }
        />
        {agreeError === undefined ? null : (
          <p ref={agreeMessage} role="alert" className="flex items-start gap-1.5 type-meta text-neg-text">
            <Icon name="WarningCircle" size="sm" className="mt-0.5 shrink-0" />
            {agreeError}
          </p>
        )}
      </div>

      {failure === null ? null : <Banner tone="neg">{failure}</Banner>}
      {children}
      <PayButton label={payLabel} disabled={view.services.length === 0} pending={pending} className="max-lg:hidden w-full" />
      {view.advanceNote === null ? null : <p className="type-meta">{view.advanceNote}</p>}
      {view.renewal === null ? null : <p className="type-meta">{view.renewal}</p>}
      {footer}
    </article>
  );
}
