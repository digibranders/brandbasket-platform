import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import {
  findBusinessTimeZone,
  findPatient,
  listPatientAppointments,
  listPractitioners,
  withTenantScope,
  type AppointmentRow,
} from "@brandbasket/db";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { FALLBACK_PHONE_COUNTRY } from "@brandbasket/shared/lib/phone/fields";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { savedPhoneStart } from "@brandbasket/shared/server/phone-defaults";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { PatientDeleteForm } from "@/components/panel/patients/patient-delete-form";
import { PatientEditForm } from "@/components/panel/patients/patient-edit-form";
import { PatientBookingLink, PatientHistory } from "@/components/panel/patients/patient-history";
import { MergeConfirm, MergeLookupForm } from "@/components/panel/patients/patient-merge";
import { bookingDoctorName, type DoctorRef } from "@/lib/appointments/doctors-view";
import { requireAppointmentsModule } from "@/lib/server/business-modules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { erasePatientAction, lookupMergeAction, mergePatientsAction, updatePatientAction } from "../actions";
import { formatShortDate, patientFigures } from "../view";

export const metadata: Metadata = { title: "Patient" };

interface PatientPageProps {
  readonly params: Promise<{ readonly patientId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function Section({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }): ReactElement {
  return (
    <section aria-labelledby={id} className="mt-10 border-t border-line pt-6">
      <h2 id={id} className="panel-section">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Figure({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/**
 * One patient: who they are, their figures, their next appointment and whole history (each booking opening in
 * Appointments), and what the clinic can do with the record -- book again, edit, merge another record into it, or
 * delete it. A register, not a medical record: nothing here holds clinical detail.
 *
 * Merging is two steps across one navigation: the lookup form finds the other record by phone and comes back here
 * with `?merge=<its id>`, which this page reads afresh (so the confirm step always names the record as it is now,
 * and a foreign or stale id simply finds nothing).
 */
export default async function PatientPage({ params, searchParams }: PatientPageProps): Promise<ReactElement> {
  await requireAppointmentsModule();
  const { tenant } = await requireCustomerAccess({ plan: "premium" });

  const { patientId } = await params;
  const sp = await searchParams;
  const rawMerge = typeof sp.merge === "string" ? sp.merge : undefined;
  const justMerged = sp.merged === "1";

  const now = new Date();

  const data = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const patient = await findPatient(tx, patientId);
    if (patient === null) return null;

    const timeZone = (await findBusinessTimeZone(tx, tenant.businessId)) ?? "UTC";
    const history = await listPatientAppointments(tx, patient.id);
    // Archived doctors too: an old booking can still be with one, and still needs a name.
    const doctors = await listPractitioners(tx, { includeArchived: true });

    const mergeCandidate = rawMerge === undefined || rawMerge === patient.id ? null : await findPatient(tx, rawMerge);
    const merge =
      mergeCandidate === null
        ? null
        : { patient: mergeCandidate, bookingCount: (await listPatientAppointments(tx, mergeCandidate.id)).length };

    return { patient, timeZone, history, doctors, merge };
  });

  if (data === null) {
    return (
      <>
        <h1 className="panel-title">Patient not found.</h1>
        <Link href="/patients" className="link-underline mt-4 inline-block text-sm text-ink">
          Back to patients
        </Link>
      </>
    );
  }

  const { patient, timeZone, history, merge } = data;
  const today = localDateIn(timeZone, now);
  const currentYear = Number(today.slice(0, 4));
  const figures = patientFigures(history, now);

  const allDoctors: readonly DoctorRef[] = data.doctors.map((doctor) => ({ id: doctor.id, name: doctor.name }));
  const activeDoctors: readonly DoctorRef[] = data.doctors
    .filter((doctor) => doctor.archivedAt === null)
    .map((doctor) => ({ id: doctor.id, name: doctor.name }));
  const doctorNameOf = (appointment: AppointmentRow): string | null =>
    bookingDoctorName(appointment.practitionerId, activeDoctors, allDoctors);

  const mainPhone = savedPhoneStart(patient.phone);
  const altPhone = savedPhoneStart(patient.altPhone);
  // A second number is most likely from the same country as the first.
  const defaultPhoneCountry = mainPhone.country ?? FALLBACK_PHONE_COUNTRY;
  const phoneCountries = phoneCountryOptions();
  const profileHref = `/patients/${patient.id}`;

  return (
    <>
      <Link href="/patients" className="text-sm text-ink-soft transition-colors duration-300 ease-calm hover:text-ink">
        ← Patients
      </Link>
      <h1 className="panel-title mt-2">{patient.name}</h1>

      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
        <a href={`tel:${patient.phone}`} className="link-underline text-ink">
          {displayPhoneText(patient.phone) ?? patient.phone}
        </a>
        {patient.altPhone === null ? null : (
          <a href={`tel:${patient.altPhone}`} className="link-underline text-ink-soft" aria-label={`Second phone ${displayPhoneText(patient.altPhone) ?? patient.altPhone}`}>
            {displayPhoneText(patient.altPhone) ?? patient.altPhone}
          </a>
        )}
      </p>

      {patient.tags.length === 0 ? null : (
        <ul aria-label="Tags" className="mt-3 flex flex-wrap gap-1.5">
          {patient.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-paper-deep px-3 py-1 text-xs font-medium text-ink-soft">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {justMerged ? (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-ink">
          Records merged.
        </p>
      ) : null}

      <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-6">
        <Figure label="Visits">
          <span className="heading-display text-5xl tabular-nums text-ink">{figures.visits}</span>
        </Figure>
        <Figure label="No-shows">
          <span className="heading-display text-5xl tabular-nums text-ink">{figures.noShows}</span>
        </Figure>
        <Figure label="First seen">
          <span className="heading-display text-2xl tabular-nums text-ink">
            {formatShortDate(localDateIn(timeZone, patient.createdAt), currentYear)}
          </span>
        </Figure>
      </dl>

      <div className="mt-8">
        <ButtonLink href={`/appointments/new?patient=${patient.id}`} size="sm">
          Book again
        </ButtonLink>
      </div>

      <Section id="patient-next-heading" title="Next appointment">
        {figures.next === null ? (
          <p className="mt-3 text-sm text-ink-soft">Nothing booked.</p>
        ) : (
          <div className="mt-3">
            <PatientBookingLink appointment={figures.next} currentYear={currentYear} doctorName={doctorNameOf(figures.next)} />
          </div>
        )}
      </Section>

      <Section id="patient-history-heading" title="History">
        <PatientHistory appointments={history} currentYear={currentYear} doctorNameOf={doctorNameOf} />
      </Section>

      <Section id="patient-edit-heading" title="Edit">
        <div className="mt-4">
          <PatientEditForm
            patientId={patient.id}
            name={patient.name}
            altPhoneCountry={altPhone.country ?? ""}
            altPhoneNumber={altPhone.number}
            tags={patient.tags}
            phoneCountries={phoneCountries}
            defaultPhoneCountry={defaultPhoneCountry}
            action={updatePatientAction}
          />
        </div>
      </Section>

      <Section id="patient-merge-heading" title="Merge">
        <div className="mt-4">
          {merge === null ? (
            <>
              {rawMerge === undefined ? null : <p className="mb-3 text-sm text-ink-soft">That record could not be found.</p>}
              <MergeLookupForm
                keepId={patient.id}
                phoneCountries={phoneCountries}
                defaultPhoneCountry={defaultPhoneCountry}
                action={lookupMergeAction}
              />
            </>
          ) : (
            <MergeConfirm
              key={merge.patient.id}
              keepId={patient.id}
              keepName={patient.name}
              removeId={merge.patient.id}
              removeName={merge.patient.name}
              removePhoneText={displayPhoneText(merge.patient.phone) ?? merge.patient.phone}
              removeBookingCount={merge.bookingCount}
              cancelHref={profileHref}
              action={mergePatientsAction}
            />
          )}
        </div>
      </Section>

      <Section id="patient-delete-heading" title="Delete">
        <div className="mt-4">
          <PatientDeleteForm patientId={patient.id} name={patient.name} action={erasePatientAction} />
        </div>
      </Section>
    </>
  );
}
