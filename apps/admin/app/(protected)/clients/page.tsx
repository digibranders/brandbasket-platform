import { listAddOnsToContact, listClients, listPaymentsNeedingAttention, type PlanTier } from "@fynix/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { clientPaymentState, type ClientPaymentState } from "@fynix/shared/lib/billing/client-payment";
import { PLAN_TIER_LABELS, readPlanTier } from "@fynix/shared/lib/billing/plan-tier";
import { BILLING_CURRENCY_LABELS } from "@fynix/shared/lib/currency";
import { PROJECT_STATUS_LABELS } from "@fynix/shared/lib/project-status";
import { SearchIcon } from "@fynix/shared/ui/icons";
import { Avatar, ringFor } from "@/components/console/avatar";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { MiniTrack } from "@/components/console/stage-track";
import { StatusDot, type StatusTone } from "@/components/console/status-dot";
import { matchesClientSearch } from "@/lib/client-search";
import { attentionBySubject, attentionItems, clientStage, JOURNEY_STAGE_LABELS, type JourneyStage } from "@/lib/pipeline";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { clientsWaitingOnUs } from "@/lib/waiting-clients";

export const metadata: Metadata = { title: "Clients" };

/** Leads are not clients yet, so the Clients filter starts at setting up. */
type ClientStage = Exclude<JourneyStage, "lead"> | "paused";
const CLIENT_STAGES: readonly ClientStage[] = ["setup", "building", "preview", "live", "paused"];

function readStage(value: string | string[] | undefined): ClientStage | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (CLIENT_STAGES as readonly string[]).includes(raw ?? "") ? (raw as ClientStage) : null;
}

/** An address that keeps the filters and the search already chosen when it changes one of them. */
function clientsHref(stage: ClientStage | null, plan: PlanTier | null, search: string): string {
  const query = new URLSearchParams();
  if (stage !== null) query.set("stage", stage);
  if (plan !== null) query.set("plan", plan);
  if (search !== "") query.set("q", search);
  const text = query.toString();
  return text === "" ? "/clients" : `/clients?${text}`;
}

function stageLabel(stage: ClientStage): string {
  return stage === "paused" ? "Paused" : JOURNEY_STAGE_LABELS[stage];
}

const PAYMENT_DOTS: Readonly<Record<ClientPaymentState["kind"], { readonly tone: StatusTone; readonly label: string }>> = {
  paid: { tone: "done", label: "Paid" },
  lapsed: { tone: "problem", label: "Lapsed" },
  "checkout-open": { tone: "waiting", label: "Checkout started" },
  "not-paid": { tone: "quiet", label: "Not paid" },
};

/** Flagged payments read to ring avatars; far more than are ever open at once. */
const FLAGGED_READ_LIMIT = 100;

/** Add-on purchases waiting for a first contact, read the same way. */
const ADD_ONS_READ_LIMIT = 100;

export default async function ClientsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireStaffAccess();
  const params = await searchParams;
  const stage = readStage(params.stage);
  const plan = readPlanTier(Array.isArray(params.plan) ? params.plan[0] : params.plan);
  const rawSearch = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const search = rawSearch.toLowerCase();
  const db = getStaffDb();
  const now = new Date();
  const [clients, flagged, addOns] = await Promise.all([
    listClients(db),
    listPaymentsNeedingAttention(db, { limit: FLAGGED_READ_LIMIT }),
    listAddOnsToContact(db, ADD_ONS_READ_LIMIT),
  ]);
  const attention = attentionBySubject(
    attentionItems({ flagged, addOns, waiting: clientsWaitingOnUs(clients, now), newLeads: [], now }),
  );

  const found = clients.filter((client) => matchesClientSearch(client, search));
  const onPlan = plan === null ? found : found.filter((client) => client.tier === plan);
  const visible = stage === null ? onPlan : onPlan.filter((client) => clientStage(client) === stage);
  const countOf = (option: ClientStage): number => onPlan.filter((client) => clientStage(client) === option).length;
  const countOnPlan = (option: PlanTier): number => found.filter((client) => client.tier === option).length;

  return (
    <>
      <PageHeader title="Clients" meta={`${clients.length} with a dashboard`} />

      <div className="mt-10 space-y-4">
        <form action="/clients" role="search" className="w-full sm:w-80">
          {stage === null ? null : <input type="hidden" name="stage" value={stage} />}
          {plan === null ? null : <input type="hidden" name="plan" value={plan} />}
          <label htmlFor="clients-search" className="sr-only">
            Search clients
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="clients-search"
              name="q"
              type="search"
              defaultValue={rawSearch}
              placeholder="Business, owner, email or phone"
              className="block w-full rounded-full border border-ink-soft/65 bg-card py-2.5 pl-11 pr-4 text-sm text-ink transition-[border-color,box-shadow] duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
            />
          </div>
        </form>
        <FilterPills
          label="Filter by plan"
          options={[
            { href: clientsHref(stage, null, rawSearch), label: "All plans", count: found.length, current: plan === null },
            ...(["care", "premium"] as const).map((option) => ({
              href: clientsHref(stage, option, rawSearch),
              label: PLAN_TIER_LABELS[option],
              count: countOnPlan(option),
              current: plan === option,
            })),
          ]}
        />
        <FilterPills
          label="Filter by stage"
          options={[
            { href: clientsHref(null, plan, rawSearch), label: "All", count: onPlan.length, current: stage === null },
            ...CLIENT_STAGES.map((option) => ({
              href: clientsHref(option, plan, rawSearch),
              label: stageLabel(option),
              count: countOf(option),
              current: stage === option,
            })),
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyLine>
          {clients.length === 0
            ? "No clients yet."
            : rawSearch !== "" && found.length === 0
              ? `No client matches “${rawSearch}”.`
              : stage === null
              ? "Nobody is on that plan yet."
              : `Nobody is at ${stageLabel(stage).toLowerCase()} right now.`}
        </EmptyLine>
      ) : (
        <HairlineList label="Clients">
          {visible.map((client) => {
            const needs = attention.get(client.businessId);
            const payment = PAYMENT_DOTS[clientPaymentState(client.billing, now).kind];
            return (
              <HairlineRow
                key={client.businessId}
                href={`/clients/${client.businessId}`}
                lead={<Avatar id={client.businessId} name={client.businessName} ring={ringFor(needs?.kind)} />}
                title={client.businessName}
                sub={[
                  client.owner?.name ?? "No owner",
                  PLAN_TIER_LABELS[client.tier],
                  client.project === null ? PROJECT_STATUS_LABELS.onboarding : PROJECT_STATUS_LABELS[client.project.status],
                  BILLING_CURRENCY_LABELS[client.currency],
                ].join(" · ")}
                meta={<MiniTrack stage={clientStage(client)} />}
                trail={
                  needs === undefined ? (
                    <StatusDot tone={payment.tone} label={payment.label} />
                  ) : (
                    <StatusDot
                      tone={needs.kind === "due" || needs.kind === "add-on" ? "waiting" : "problem"}
                      // The row's trail is one short line, so an add-on says the least that is useful here; the Journey gives the full reason.
                      label={needs.kind === "add-on" ? "Add-on to set up" : needs.reason}
                    />
                  )
                }
              />
            );
          })}
        </HairlineList>
      )}
    </>
  );
}
