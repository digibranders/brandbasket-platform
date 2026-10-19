import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { findAppointmentSettings, listAppointmentServices, withTenantScope } from "@brandbasket/db";
import { BookingSettingsPanel } from "@/components/panel/appointments/booking-settings-panel";
import { ServicesPanel } from "@/components/panel/appointments/services-panel";
import { SlotSettingsPanel } from "@/components/panel/appointments/slot-settings-panel";
import { requireAppointmentsModule } from "@/lib/server/business-modules";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { addServiceAction, renameServiceAction, saveBookingSettingsAction, saveSlotSettingsAction, setServiceArchivedAction } from "./actions";

export const metadata: Metadata = { title: "Appointments settings" };

export default async function AppointmentsSettingsPage(): Promise<ReactElement> {
  await requireAppointmentsModule();
  const { tenant } = await requireCustomerAccess({ plan: "premium" });

  const { settings, services } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    settings: await findAppointmentSettings(tx),
    services: await listAppointmentServices(tx, { includeArchived: true }),
  }));

  return (
    <>
      <Link href="/appointments" className="text-sm text-ink-soft transition-colors duration-300 ease-calm hover:text-ink">
        ← Appointments
      </Link>
      <h1 className="panel-title mt-2">Appointments settings</h1>
      <Link href="/appointments/doctors" className="link-underline mt-4 inline-block text-sm text-ink-soft">
        Doctors →
      </Link>

      <div className="mt-8">
        <h2 className="panel-section">Booking slots</h2>
        <div className="mt-5">
          <SlotSettingsPanel settings={settings} action={saveSlotSettingsAction} />
        </div>
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <h2 className="panel-section">Online booking</h2>
        <div className="mt-5">
          <BookingSettingsPanel settings={settings} action={saveBookingSettingsAction} />
        </div>
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <h2 className="panel-section">Services</h2>
        <div className="mt-5">
          <ServicesPanel
            services={services}
            addAction={addServiceAction}
            renameAction={renameServiceAction}
            archiveAction={setServiceArchivedAction}
          />
        </div>
      </div>
    </>
  );
}
