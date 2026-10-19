import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { countPatients, findBusinessTimeZone, listPatients, withTenantScope } from "@brandbasket/db";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { cn } from "@brandbasket/shared/lib/cn";
import { parsePatientSearch } from "@brandbasket/shared/lib/patients/patient-form";
import { PatientSearchForm } from "@/components/panel/patients/patient-search-form";
import { PatientsPagination } from "@/components/panel/patients/patients-pagination";
import { PatientsList } from "@/components/panel/patients/patients-list";
import { requireAppointmentsModule } from "@/lib/server/business-modules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import {
  emptyListLabel,
  pageCount,
  pageRangeLabel,
  parsePageParam,
  parsePatientFilter,
  PATIENT_FILTER_LABELS,
  PATIENT_FILTERS,
  PATIENT_PAGE_SIZE,
  patientsHref,
} from "./view";

export const metadata: Metadata = { title: "Patients" };

interface PatientsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The clinic's patient register: one row per person, built from their bookings (the link trigger in migration 0050
 * creates a patient the first time a number books). The big number is the whole register; the filters and the
 * search narrow the list below it, shown PATIENT_PAGE_SIZE at a time with page numbers underneath. Only there while the Appointments module is
 * on, like every Appointments page -- and the register's row-level security enforces the same.
 */
export default async function PatientsPage({ searchParams }: PatientsPageProps): Promise<ReactElement> {
  await requireAppointmentsModule();
  const { tenant } = await requireCustomerAccess({ plan: "premium" });

  const sp = await searchParams;
  const filter = parsePatientFilter(sp.filter);
  const search = parsePatientSearch(typeof sp.q === "string" ? sp.q : undefined);
  const page = parsePageParam(sp.page);
  const justDeleted = sp.deleted === "1";

  const now = new Date();

  const data = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const timeZone = await findBusinessTimeZone(tx, tenant.businessId);
    // "New this month" and "not seen in 6 months" are the business's own calendar, not the server's.
    const today = localDateIn(timeZone ?? "UTC", now);
    const count = await countPatients(tx);
    const list = await listPatients(tx, { filter, search, now, today, limit: PATIENT_PAGE_SIZE, offset: (page - 1) * PATIENT_PAGE_SIZE });
    return { today, count, list };
  });

  const { list } = data;
  // A page past the end (a stale link after deletions, a hand-typed number) has no rows -- and so, being a window
  // count, no total either. Start that list again from its first page rather than show an empty one.
  if (page > 1 && list.rows.length === 0) redirect(patientsHref(filter, search));

  const currentYear = Number(data.today.slice(0, 4));
  const pages = pageCount(list.total);

  return (
    <>
      <h1 className="panel-title">Patients</h1>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="heading-display text-5xl tabular-nums text-ink">{data.count}</span>
        <span className="text-sm text-ink-soft">{data.count === 1 ? "patient" : "patients"}</span>
      </p>

      {justDeleted ? (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-ink">
          Patient deleted.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <nav aria-label="Filter" className="flex flex-wrap gap-1">
          {PATIENT_FILTERS.map((candidate) => (
            <Link
              key={candidate}
              href={patientsHref(candidate, search)}
              aria-current={candidate === filter ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ease-calm",
                candidate === filter ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink",
              )}
            >
              {PATIENT_FILTER_LABELS[candidate]}
            </Link>
          ))}
        </nav>
        <Link href="/patients/reports" className="link-underline text-sm font-medium text-ink">
          Reports
        </Link>
      </div>

      <div className="mt-6">
        <PatientSearchForm search={search} filter={filter} />
      </div>

      {list.rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">{emptyListLabel(filter, search)}</p>
      ) : (
        <>
          {pages > 1 ? <p className="mt-6 text-sm tabular-nums text-ink-soft">{pageRangeLabel(page, list.rows.length, list.total)}</p> : null}
          <div className="mt-4">
            <PatientsList rows={list.rows} firstNumber={(page - 1) * PATIENT_PAGE_SIZE + 1} total={list.total} currentYear={currentYear} />
          </div>
          {pages > 1 ? <PatientsPagination page={page} pages={pages} filter={filter} search={search} /> : null}
        </>
      )}
    </>
  );
}
