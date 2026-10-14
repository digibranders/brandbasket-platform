import { listAddOnsToContact, listClients, listPaymentsNeedingAttention, type PlanTier } from "@firstfold/db";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { clientPaymentState, type ClientPaymentState } from "@firstfold/shared/lib/billing/client-payment";
import { PLAN_TIER_LABELS, readPlanTier } from "@firstfold/shared/lib/billing/plan-tier";
import { BILLING_CURRENCY_LABELS } from "@firstfold/shared/lib/currency";
import { PROJECT_STATUS_LABELS } from "@firstfold/shared/lib/project-status";
import { Avatar, ringFor } from "@/components/console/avatar";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine, HairlineList, HairlineRow } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { MiniTrack } from "@/components/console/stage-track";
import { StatusDot, type StatusTone } from "@/components/console/status-dot";
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

/** An address that keeps the filters already chosen when it changes one of them. */
function clientsHref(stage: ClientStage | null, plan: PlanTier | null): string {
  const query = new URLSearchParams();
  if (stage !== null) query.set("stage", stage);
  if (plan !== null) query.set("plan", plan);
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

  const onPlan = plan === null ? clients : clients.filter((client) => client.tier === plan);
  const visible = stage === null ? onPlan : onPlan.filter((client) => clientStage(client) === stage);
  const countOf = (option: ClientStage): number => onPlan.filter((client) => clientStage(client) === option).length;
  const countOnPlan = (option: PlanTier): number => clients.filter((client) => client.tier === option).length;

  return (
    <>
      <PageHeader title="Clients" meta={`${clients.length} with a dashboard`} />

      <div className="mt-10 space-y-4">
        <FilterPills
          label="Filter by plan"
          options={[
            { href: clientsHref(stage, null), label: "All plans", count: clients.length, current: plan === null },
            ...(["care", "premium"] as const).map((option) => ({
              href: clientsHref(stage, option),
              label: PLAN_TIER_LABELS[option],
              count: countOnPlan(option),
              current: plan === option,
            })),
          ]}
        />
        <FilterPills
          label="Filter by stage"
          options={[
            { href: clientsHref(null, plan), label: "All", count: onPlan.length, current: stage === null },
            ...CLIENT_STAGES.map((option) => ({
              href: clientsHref(option, plan),
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
