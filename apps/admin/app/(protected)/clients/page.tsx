import { listAddOnsToContact, listClients, listLiveServiceLines, listOpenClosures, listPaymentsNeedingAttention } from "@brandbasket/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { SearchIcon } from "@brandbasket/shared/ui/icons";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { FilterPills } from "@/components/console/filter-pills";
import { EmptyLine } from "@/components/console/hairline-list";
import { PageHeader } from "@/components/console/page-header";
import { StatusPill } from "@/components/console/status-pill";
import { TABLE, TD, TD_NUM, TD_TIME, TH } from "@/components/console/table";
import { ServiceTags } from "@/components/service-tags";
import { CLIENT_ROW_STAGE_LABELS, CLIENT_ROW_STAGE_TONES, clientRowStage, servicesByBusiness, type ClientRowStage } from "@/lib/client-rows";
import { matchesClientSearch } from "@/lib/client-search";
import { attentionBySubject, attentionItems } from "@/lib/pipeline";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { clientsWaitingOnUs } from "@/lib/waiting-clients";

export const metadata: Metadata = { title: "Clients" };

const ROW_STAGES: readonly ClientRowStage[] = ["not-paid", "setup", "building", "preview", "live", "paused", "leaving"];

function readStage(value: string | string[] | undefined): ClientRowStage | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (ROW_STAGES as readonly string[]).includes(raw ?? "") ? (raw as ClientRowStage) : null;
}

/** An address that keeps the filter and the search already chosen when it changes one of them. */
function clientsHref(stage: ClientRowStage | null, search: string): string {
  const query = new URLSearchParams();
  if (stage !== null) query.set("stage", stage);
  if (search !== "") query.set("q", search);
  const text = query.toString();
  return text === "" ? "/clients" : `/clients?${text}`;
}

/** Flagged payments and add-on purchases read for the Next column; far more than are ever open at once. */
const ATTENTION_READ_LIMIT = 100;

export default async function ClientsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireStaffAccess();
  const params = await searchParams;
  const stage = readStage(params.stage);
  const rawSearch = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const search = rawSearch.toLowerCase();
  const db = getStaffDb();
  const now = new Date();
  const [clients, closures, flagged, addOns] = await Promise.all([
    listClients(db, { include: ["paying", "not_paid", "leaving"] }),
    listOpenClosures(db),
    listPaymentsNeedingAttention(db, { limit: ATTENTION_READ_LIMIT }),
    listAddOnsToContact(db, ATTENTION_READ_LIMIT),
  ]);
  const services = servicesByBusiness(await listLiveServiceLines(db, clients.map((client) => client.businessId)));
  const closing = new Map(closures.map((closure) => [closure.businessId, closure]));
  const attention = attentionBySubject(attentionItems({ flagged, addOns, waiting: clientsWaitingOnUs(clients, now), newLeads: [], now }));

  const rows = clients.map((client) => ({ client, stage: clientRowStage(client, closing.has(client.businessId)) }));
  const found = rows.filter((row) => matchesClientSearch(row.client, search));
  const visible = stage === null ? found : found.filter((row) => row.stage === stage);
  const countOf = (option: ClientRowStage): number => found.filter((row) => row.stage === option).length;
  const paying = rows.filter((row) => row.client.billing.firstPayment !== null).length;

  return (
    <>
      <PageHeader title="Clients" meta={`${paying} paying · ${rows.length - paying} signed up, not paid`} />

      <div className="mt-8 space-y-4">
        <form action="/clients" role="search" className="w-full sm:w-80">
          {stage === null ? null : <input type="hidden" name="stage" value={stage} />}
          <label htmlFor="clients-search" className="sr-only">
            Search clients
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
            <input
              id="clients-search"
              name="q"
              type="search"
              defaultValue={rawSearch}
              placeholder="Business, owner, email or phone"
              className="block w-full rounded-lg border border-ink-2/65 bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder:text-ink-2"
            />
          </div>
        </form>
        <FilterPills
          label="Filter by stage"
          options={[
            { href: clientsHref(null, rawSearch), label: "All", count: found.length, current: stage === null },
            ...ROW_STAGES.map((option) => ({
              href: clientsHref(option, rawSearch),
              label: CLIENT_ROW_STAGE_LABELS[option],
              count: countOf(option),
              current: stage === option,
            })),
          ]}
        />
        {stage === "leaving" ? (
          <p className="text-sm text-ink-2">
            <Link href="/leaving" className="font-semibold text-ink underline underline-offset-4">
              Why people leave
            </Link>
          </p>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyLine>
          {clients.length === 0
            ? "No clients yet."
            : rawSearch !== "" && found.length === 0
              ? `No client matches “${rawSearch}”.`
              : "Nobody here right now."}
        </EmptyLine>
      ) : (
        <table className={`${TABLE} mt-6`}>
          <thead>
            <tr>
              <th className={TH}>Business</th>
              <th className={TH}>Services</th>
              <th className={TH}>Stage</th>
              <th className={`${TH} text-right`}>Monthly</th>
              <th className={TH}>Next</th>
              <th className={TH}>Paid through</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ client, stage: rowStage }) => {
              const needs = attention.get(client.businessId);
              const service = services.get(client.businessId);
              const closure = closing.get(client.businessId);
              const paidThrough = client.billing.subscription?.paidThroughAt ?? null;
              return (
                <tr key={client.businessId}>
                  <td className={TD}>
                    <Link href={`/clients/${client.businessId}`} className="font-semibold hover:underline">
                      {client.businessName}
                    </Link>
                    <small className="block text-xs text-ink-2">{client.owner?.name ?? "No owner"}</small>
                  </td>
                  <td className={TD}>
                    <ServiceTags addOns={service?.addOns ?? []} />
                  </td>
                  <td className={TD}>
                    <StatusPill tone={CLIENT_ROW_STAGE_TONES[rowStage]}>{CLIENT_ROW_STAGE_LABELS[rowStage]}</StatusPill>
                  </td>
                  <td className={TD_NUM}>{service === undefined || service.monthlyCents === 0 ? "None" : formatMoney(service.monthlyCents, client.currency)}</td>
                  <td className={TD}>
                    {closure !== undefined ? (
                      <>
                        Erased on <LocalDate iso={closure.eraseAfter.toISOString()} /> unless restored
                      </>
                    ) : needs !== undefined ? (
                      <b className="font-semibold">{needs.kind === "add-on" ? "Add-on to set up" : needs.reason}</b>
                    ) : rowStage === "not-paid" ? (
                      <span className="text-ink-2">Follow up on sign-up</span>
                    ) : (
                      <span className="text-ink-2">None</span>
                    )}
                  </td>
                  <td className={TD_TIME}>{paidThrough === null ? "None" : <LocalDate iso={paidThrough.toISOString()} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
