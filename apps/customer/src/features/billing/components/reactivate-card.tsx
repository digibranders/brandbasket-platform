"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Panel } from "@/components";
import { Banner, Button, Icon } from "@/ui";
import { useOpeningPayment } from "../../checkout/rules/opening-payment";
import { reactivateAction } from "../actions";
import type { ReactivationCardView } from "../loader";

/*
 * Plan & billing for a lapsed plan, ported from apps/platform components/panel/billing/reactivate-plan.tsx and
 * service-picker.tsx: what restarting costs a month and the one button that does it. A customer who cancelled themselves
 * chooses their services first; each choice is a link (`?services=`), so the price shown is always the one charged. The
 * button is held from the press until the payment opens, so a double press opens one payment.
 */
export function ReactivateCard({ view, canManage }: { readonly view: ReactivationCardView; readonly canManage: boolean }) {
  const [state, action, pending] = useActionState(reactivateAction, null);
  const opening = useOpeningPayment(pending, state);
  const failure = state !== null && !state.ok && !pending ? state : null;
  return (
    <Panel title="Your plan has ended">
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink-3">Your website and content are safe. Reactivate to bring them back from today. The months you were away aren’t charged.</p>
        {view.picker === null ? null : (
          <div className="flex flex-col gap-2">
            <h3 className="type-sub text-ink">Choose your services</h3>
            <ul className="flex flex-col gap-1">
              {view.picker.map((item) => (
                <li key={item.addOn}>
                  <Link href={item.href} replace scroll={false} className="flex items-center gap-2 py-1 no-underline">
                    <Icon name={item.selected ? "CheckCircle" : "Circle"} size="sm" />
                    <span className="flex-1 text-ink">
                      <span className="sr-only">{item.selected ? "Chosen: " : "Not chosen: "}</span>
                      {item.name}
                    </span>
                    <span className="tabular-nums text-ink-3">{item.price}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="type-meta">
          {view.planName}: {view.monthlyAmount} a month.
        </p>
        {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
        {canManage ? (
          <form action={action}>
            {view.chosen?.map((service) => <input key={service} type="hidden" name="service" value={service} />)}
            <Button type="submit" variant="primary" pending={opening}>
              {`Reactivate for ${view.monthlyAmount}`}
            </Button>
          </form>
        ) : null}
      </div>
    </Panel>
  );
}
