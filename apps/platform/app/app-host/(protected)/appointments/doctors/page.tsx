import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import {
  findBusinessTimeZone,
  getBusinessHours,
  listPractitionerHours,
  listPractitionerLeave,
  listPractitioners,
  withTenantScope,
} from "@fynix/db";
import { upcomingClosures } from "@fynix/shared/lib/business-facts/closures";
import { localDateIn } from "@fynix/shared/lib/calendar/local-date";
import { fromStoredHours, type OpeningHours } from "@fynix/shared/lib/onboarding/hours";
import { DoctorEditor } from "@/components/panel/appointments/doctor-editor";
import { DoctorsList, type DoctorSummary } from "@/components/panel/appointments/doctors-list";
import { requireAppointmentsModule } from "@/lib/server/business-modules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import {
  addDoctorAction,
  addDoctorLeaveAction,
  archiveDoctorAction,
  moveDoctorAction,
  removeDoctorLeaveAction,
  saveDoctorScheduleAction,
  updateDoctorAction,
} from "./actions";

export const metadata: Metadata = { title: "Doctors" };

interface DoctorsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The clinic's doctors: the list in website order, and one doctor at a time opened for editing through
 * `?doctor=<id>` -- the same "one open thing lives in the URL" pattern the week grid's `?booking=` uses, so an open
 * editor survives a save's revalidation and a reload, and closing it is a plain link. An id that names no active
 * doctor (archived since, another business's, or garbage) simply opens nothing.
 *
 * The open doctor's hours, leave and the business's "today" are read only when one is open, in the same
 * tenant-scoped transaction as the list. A doctor still on clinic hours has no rows of their own, so the editor
 * is seeded with the clinic's hours instead: choosing "Own hours" then starts from the week the clinic keeps.
 */
export default async function DoctorsPage({ searchParams }: DoctorsPageProps): Promise<ReactElement> {
  await requireAppointmentsModule();
  const { tenant } = await requireCustomerAccess({ plan: "premium" });

  const sp = await searchParams;
  const requestedId = typeof sp.doctor === "string" ? sp.doctor : null;

  const { doctors, open } = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const rows = await listPractitioners(tx, { includeArchived: false });
    const selected = rows.find((row) => row.id === requestedId) ?? null;
    if (selected === null) return { doctors: rows, open: null };

    const timeZone = await findBusinessTimeZone(tx, tenant.businessId);
    const hoursRows = selected.usesClinicHours ? await getBusinessHours(tx) : await listPractitionerHours(tx, selected.id);
    const leave = await listPractitionerLeave(tx, selected.id);
    return { doctors: rows, open: { id: selected.id, timeZone, hoursRows, leave } };
  });

  const summaries: DoctorSummary[] = doctors.map((doctor) => ({
    id: doctor.id,
    name: doctor.name,
    title: doctor.title,
    usesClinicHours: doctor.usesClinicHours,
  }));
  const openDoctor = open === null ? undefined : summaries.find((doctor) => doctor.id === open.id);

  let editor: ReactElement | null = null;
  if (open !== null && openDoctor !== undefined) {
    const today = localDateIn(open.timeZone ?? "UTC", new Date());
    const hours = open.hoursRows.map(fromStoredHours).filter((day): day is OpeningHours => day !== null);
    editor = (
      <DoctorEditor
        key={openDoctor.id}
        doctor={openDoctor}
        hours={hours}
        leave={upcomingClosures(open.leave, today)}
        today={today}
        updateAction={updateDoctorAction}
        scheduleAction={saveDoctorScheduleAction}
        addLeaveAction={addDoctorLeaveAction}
        removeLeaveAction={removeDoctorLeaveAction}
      />
    );
  }

  return (
    <>
      <Link href="/appointments/settings" className="text-sm text-ink-soft transition-colors duration-300 ease-calm hover:text-ink">
        ← Appointments settings
      </Link>
      <h1 className="panel-title mt-2">Doctors</h1>

      <div className="mt-8">
        <DoctorsList
          doctors={summaries}
          openId={openDoctor?.id ?? null}
          editor={editor}
          addAction={addDoctorAction}
          moveAction={moveDoctorAction}
          archiveAction={archiveDoctorAction}
        />
      </div>
    </>
  );
}
