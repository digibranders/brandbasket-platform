import { listAddOnsToContact, listClients, listLiveServiceLines, listOpenClosures, listPaymentsNeedingAttention } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { staffCan } from "@brandbasket/shared/lib/access";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { StatusChipVariant } from "@brandbasket/shared/ui/patterns";
import { ClientsDirectory, type DirectoryRow, type StageOption } from "@/components/clients/clients-directory";
import { FilterPills } from "@/components/console/filter-pills";
import { PageHeader } from "@/components/console/page-header";
import { SectionTabs } from "@/components/console/section-tabs";
import { CLIENT_ROW_STAGE_LABELS, CLIENT_ROW_STAGE_TONES, clientBuildStage, buildStageLabel, clientRowStage, servicesByBusiness, type ClientRowStage } from "@/lib/client-rows";
import { serviceStatuses } from "@/lib/client-services";
import { matchesClientSearch } from "@/lib/client-search";
import { parseClientsView } from "@/lib/clients-view";
import { previewLateReason } from "@/lib/client-next-step";
import { attentionBySubject, attentionItems } from "@/lib/pipeline";
import { parseProjectScope } from "@/lib/project-board";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { shortDate } from "@/lib/team-time";
import { clientsWaitingOnUs } from "@/lib/waiting-clients";
import { BuildsView } from "./builds-view";
import type { PillTone } from "@/components/console/status-pill";

export const metadata: Metadata = { title: "Clients" };

const ROW_STAGES: readonly ClientRowStage[] = ["not-paid", "setup", "building", "preview", "live", "paused", "leaving"];

function readStage(value: string | string[] | undefined): ClientRowStage | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (ROW_STAGES as readonly string[]).includes(raw ?? "") ? (raw as ClientRowStage) : null;
}

const CHIP_OF_TONE: Readonly<Record<PillTone, StatusChipVariant>> = { todo: "idle", wait: "waiting", progress: "next", done: "active", problem: "failed" };

/** Flagged payments and add-on purchases read for the Next column; far more than are ever open at once. */
const ATTENTION_READ_LIMIT = 100;

/** Clients, in two views: the List (default) and Builds, the board of website builds that used to be /projects. */
export default async function ClientsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user, staff } = await requireStaffAccess();
  const params = await searchParams;
  const view = parseClientsView(params.view);
  const now = new Date();
  const viewOptions = [
    { href: "/clients", label: "List", current: view === "list" },
    { href: "/clients?view=builds", label: "Builds", current: view === "builds" },
  ];

  if (view === "builds") {
    await logStaffAccess({ staffUserId: user.id, action: "projects.list", targetType: "projects" });
    const { meta, body } = await BuildsView({ scope: parseProjectScope(Array.isArray(params.show) ? params.show[0] : params.show), now });
    return (
      <>
        <PageHeader title="Clients" meta={meta} />
        <SectionTabs role={staff.role} page="/clients" />
        <div className="mt-6">
          <FilterPills label="View" options={viewOptions} />
        </div>
        <div className="mt-4">{body}</div>
      </>
    );
  }

  await logStaffAccess({ staffUserId: user.id, action: "clients.list", targetType: "clients" });
  const stage = readStage(params.stage);
  const rawSearch = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const search = rawSearch.toLowerCase();
  const db = getStaffDb();
  const [clients, closures, flagged, addOns] = await Promise.all([
    listClients(db, { include: ["paying", "not_paid", "leaving"] }),
    listOpenClosures(db),
    // Flagged payments are money: other roles do not see them, so the query is not run for them.
    staffCan(staff.role, "money") ? listPaymentsNeedingAttention(db, { limit: ATTENTION_READ_LIMIT }) : Promise.resolve([]),
    listAddOnsToContact(db, ATTENTION_READ_LIMIT),
  ]);
  const lines = await listLiveServiceLines(db, clients.map((client) => client.businessId));
  const services = servicesByBusiness(lines);
  const closing = new Map(closures.map((closure) => [closure.businessId, closure]));
  const attention = attentionBySubject(attentionItems({ flagged, addOns, waiting: clientsWaitingOnUs(clients, now), newLeads: [], now }));
  const toSetUp = new Set(addOns.filter((purchase) => purchase.kind !== "press-release").map((purchase) => `${purchase.businessId}:${purchase.addOn}`));

  const found = clients.filter((client) => matchesClientSearch(client, search)).map((client) => ({ client, stage: clientRowStage(client, closing.has(client.businessId)) }));
  const visible = found.filter((row) => stage === null || row.stage === stage);
  const stages: StageOption[] = [
    { id: "all", label: "All", count: found.length },
    ...ROW_STAGES.map((option) => ({ id: option, label: CLIENT_ROW_STAGE_LABELS[option], count: found.filter((row) => row.stage === option).length })),
  ];
  const paying = clients.filter((client) => client.billing.firstPayment !== null).length;

  const rows: DirectoryRow[] = visible.map(({ client, stage: rowStage }) => {
    const needs = attention.get(client.businessId);
    const closure = closing.get(client.businessId);
    const service = services.get(client.businessId);
    const paidThrough = client.billing.subscription?.paidThroughAt ?? null;
    const pastDue = client.billing.subscription?.status === "past_due";
    const websiteLate = previewLateReason(client.project, now) !== null;
    const next =
      closure !== undefined
        ? `Erased on ${shortDate(closure.eraseAfter)} unless restored`
        : needs !== undefined
          ? needs.kind === "add-on"
            ? "Add-on to set up"
            : needs.reason
          : pastDue
            ? "Renewal failed"
            : rowStage === "not-paid"
              ? "Follow up on sign-up"
              : null;
    return {
      id: client.businessId,
      name: client.businessName,
      ownerName: client.owner?.name ?? null,
      stageLabel: CLIENT_ROW_STAGE_LABELS[rowStage],
      stageVariant: CHIP_OF_TONE[CLIENT_ROW_STAGE_TONES[rowStage]],
      buildLabel: buildStageLabel(clientBuildStage(client)),
      services: serviceStatuses({
        lines: lines.filter((line) => line.businessId === client.businessId),
        project: client.project,
        websiteLate,
        toSetUp: new Set([...(service?.addOns ?? [])].filter((id) => toSetUp.has(`${client.businessId}:${id}`))),
      }),
      monthly:
        service === undefined || service.monthlyCents === 0
          ? "None"
          : `${formatMoney(service.monthlyCents, client.currency)}${client.billing.subscription?.billingInterval === "year" ? " a year" : ""}`,
      next,
      nextIsLate: pastDue || needs?.kind === "overdue" || needs?.kind === "payment",
      paidThroughIso: paidThrough === null ? null : paidThrough.toISOString(),
      late: pastDue || websiteLate || needs?.kind === "overdue" || needs?.kind === "payment",
    };
  });

  return (
    <>
      <PageHeader title="Clients" meta={`${paying} paying · ${clients.length - paying} signed up, not paid`} />
      <SectionTabs role={staff.role} page="/clients" />
      <div className="mt-6">
        <FilterPills label="View" options={viewOptions} />
      </div>
      <div className="mt-4">
        <ClientsDirectory rows={rows} stages={stages} stage={stage} search={rawSearch} emptyKind={clients.length === 0 ? "none" : "no-match"} />
      </div>
      {stage === "leaving" ? (
        <p className="mt-4 text-sm text-ink-2">
          <Link href="/leaving" className="font-semibold text-ink underline underline-offset-4">
            Why people leave
          </Link>
        </p>
      ) : null}
    </>
  );
}
