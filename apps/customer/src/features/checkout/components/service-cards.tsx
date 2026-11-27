"use client";

import type { BillingInterval } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { useId } from "react";
import { formatMoney } from "@/lib/format";
import { Badge, Icon } from "@/ui";
import { cx } from "@/ui/cx";
import type { WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { CHECKOUT_PLAN_COPY } from "../rules/plans";
import { canTick, cardBadge, type SignupBasketService, type SignupBasketTable } from "../rules/signup-basket";

/*
 * One card per service on sale, straight on the page (docs/design/checkout-one-screen.html). A ticked card has the ink edge and
 * the filled tick. Monitoring watches over plans, so its card waits until one is ticked. Prices arrive worked out: this only
 * shows them.
 */

const MARK: Readonly<Partial<Record<MonthlyAddOnId, string>>> = { "managed-website": "bg-svc-site", "social-media": "bg-svc-social" };

const CARD =
  "flex cursor-pointer flex-col gap-2 rounded-panel border border-border bg-surface p-4 shadow-card transition-colors duration-100 hover:border-border-button-hover has-data-checked:border-primary has-data-checked:ring-1 has-data-checked:ring-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-disabled:cursor-not-allowed has-disabled:bg-surface-disabled md:p-5";
const BOX =
  "mt-px flex size-4.5 shrink-0 items-center justify-center rounded-badge border border-border-control bg-surface text-on-primary transition-colors duration-100 data-checked:border-primary data-checked:bg-primary";

interface ServiceCardsProps {
  readonly table: SignupBasketTable;
  /** What is bought now, as purchasableServices says it. */
  readonly services: readonly MonthlyAddOnId[];
  readonly interval: BillingInterval;
  readonly onToggle: (id: MonthlyAddOnId, ticked: boolean) => void;
  /** The kind of website, which sets the website card's price (plan 65). */
  readonly kind: WebsiteKind;
  /** A staff payment link decided the services: they cannot be ticked or unticked. */
  readonly locked?: boolean;
  /** The balance of a built website is being paid (plan 66): the cards carry no build-fee badge. */
  readonly balance?: boolean;
}

export function ServiceCards({ table, services, interval, onToggle, kind, locked = false, balance = false }: ServiceCardsProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 className="sr-only" id={headingId}>
        Your services
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        {table.services.map((service) => (
          <ServiceCard key={service.id} service={service} table={table} ticked={services.includes(service.id)} enabled={canTick(service.id, services)} interval={interval} onToggle={onToggle} kind={kind} locked={locked} balance={balance} />
        ))}
      </div>
    </section>
  );
}

interface ServiceCardProps {
  readonly service: SignupBasketService;
  readonly table: SignupBasketTable;
  readonly ticked: boolean;
  readonly enabled: boolean;
  readonly interval: BillingInterval;
  readonly onToggle: (id: MonthlyAddOnId, ticked: boolean) => void;
  readonly kind: WebsiteKind;
  readonly locked: boolean;
  readonly balance: boolean;
}

function ServiceCard({ service, table, ticked, enabled, interval, onToggle, kind, locked, balance }: ServiceCardProps) {
  const badge = cardBadge(service, table, interval, balance);
  // The website's price follows the kind of site chosen; every other service has one price.
  const monthlyCents = service.id === "managed-website" ? table.website.kinds[kind].monthlyCents : service.monthlyCents;
  const blurb = service.id === "managed-website" ? CHECKOUT_PLAN_COPY["managed-website"].blurb(formatMoney(monthlyCents, table.currency)) : service.blurb;
  return (
    <label className={CARD}>
      <span className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 type-sub text-ink">
          <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-mark", MARK[service.id] ?? "bg-ink")} />
          {service.title}
        </span>
        <input type="checkbox" className="sr-only" checked={ticked} disabled={locked || (!enabled && !ticked)} onChange={(event) => onToggle(service.id, event.target.checked)} />
        <span aria-hidden="true" data-checked={ticked ? "" : undefined} className={BOX}>
          {ticked ? <Icon name="Check" size="sm" className="size-3.5" /> : null}
        </span>
      </span>
      <span className="hidden type-meta md:block">{blurb}</span>
      <span className="mt-auto flex flex-wrap items-center gap-2">
        <span className="font-mono tabular-nums type-body text-ink">{formatMoney(monthlyCents, table.currency)}</span>
        <span className="type-meta">a month</span>
        {badge === null ? null : <Badge tone="pos">{badge}</Badge>}
      </span>
    </label>
  );
}
