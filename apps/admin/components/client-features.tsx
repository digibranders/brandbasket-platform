import type { ReactElement } from "react";
import type { AppointmentCounts } from "@fynix/db";
import { BUSINESS_MODULE_NOTICES, type BusinessModuleNotice } from "@fynix/shared/lib/business-module-notices";
import { BUSINESS_MODULE_LABELS, type BusinessModule } from "@fynix/shared/lib/business-modules";
import { canonicalTimeZone, TIME_ZONE_OPTIONS } from "@fynix/shared/lib/calendar/local-date";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@fynix/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@fynix/shared/ui/select-field";
import { setModuleAction, setTimeZoneAction } from "@/app/(protected)/clients/[businessId]/actions";
import { buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { StatusDot } from "@/components/console/status-dot";
import { appointmentCountsLine } from "@/lib/appointment-counts";

interface ClientFeaturesProps {
  readonly businessId: string;
  /** The business's own IANA time zone, or null when it hasn't been set yet. */
  readonly timeZone: string | null;
  readonly enabledModules: readonly BusinessModule[];
  /** Always computed, whether or not appointments are on: counting unconditionally is simpler than threading a
   * conditional through the page's data loading, and an idle count costs nothing to show. */
  readonly appointmentCounts: AppointmentCounts;
  readonly notice: BusinessModuleNotice | null;
}


/** Asia/Kolkata under whatever name this runtime's ICU build canonically resolves it to. */
const KOLKATA = canonicalTimeZone("Asia/Kolkata") ?? "Asia/Kolkata";

/** Zones staff pick often enough to want at the top of the list, ahead of the full alphabetical set. */
const COMMON_TIME_ZONES: readonly string[] = [
  KOLKATA,
  "UTC",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

const COMMON_TIME_ZONE_SET = new Set(COMMON_TIME_ZONES);
const OTHER_TIME_ZONES = TIME_ZONE_OPTIONS.filter((zone) => !COMMON_TIME_ZONE_SET.has(zone));

/**
 * The value Save would actually submit for `timeZone`: canonicalised when this runtime recognises it, otherwise
 * the raw stored value kept as-is (never null) so an unrecognised zone isn't quietly treated as unset. Null only
 * when nothing is stored at all.
 */
function resolvedTimeZone(timeZone: string | null): string | null {
  if (timeZone === null) return null;
  return canonicalTimeZone(timeZone) ?? timeZone;
}

/**
 * A business's time zone and the modules switched on for it. The time zone comes first because switching a
 * module on needs it set, and it's also what closures and the announcement use.
 */
function TimeZoneForm({ businessId, timeZone }: { readonly businessId: string; readonly timeZone: string | null }): ReactElement {
  const resolved = resolvedTimeZone(timeZone);
  // A stored value this runtime doesn't recognise (a stale alias, a typo saved before validation existed, ...)
  // must still appear as its own selected option: otherwise the dropdown would default to "Not set", and an
  // unchanged Save would silently clear a time zone that is, in fact, still set to something.
  const unrecognised = timeZone !== null && canonicalTimeZone(timeZone) === null ? timeZone : null;
  const options: readonly SelectOption[] = [
    { value: "", label: "Not set" },
    ...(unrecognised === null ? [] : [{ value: unrecognised, label: `${unrecognised} (unrecognised)` }]),
    ...COMMON_TIME_ZONES.map((zone) => ({ value: zone, label: zone === KOLKATA ? "Asia/Kolkata (India)" : zone, group: "Common" })),
    ...OTHER_TIME_ZONES.map((zone) => ({ value: zone, label: zone, group: "All" })),
  ];
  return (
    <form action={setTimeZoneAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <label htmlFor="time-zone" className={labelClasses}>
        Time zone
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          id="time-zone"
          name="timeZone"
          options={options}
          defaultValue={resolved ?? ""}
          className={fieldClasses}
          wrapperClassName="max-w-sm flex-1"
        />
        <GatedSubmitButton className={buttonSecondary}>Save</GatedSubmitButton>
      </div>
      <p className={hintClasses}>Needed before Appointments, and used for closures and the announcement.</p>
    </form>
  );
}

/** Switching Appointments on, once a time zone is set. */
function SwitchOnForm({ businessId, timeZone }: { readonly businessId: string; readonly timeZone: string | null }): ReactElement {
  const canEnable = resolvedTimeZone(timeZone) !== null;
  return (
    <form action={setModuleAction} className="mt-3">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="module" value="appointments" />
      <input type="hidden" name="enabled" value="on" />
      <button type="submit" disabled={!canEnable} className={buttonSecondary}>
        {canEnable ? "Switch on" : "Set a time zone first"}
      </button>
    </form>
  );
}

/** Switching Appointments off, with the required acknowledgement that requests stop coming in. */
function SwitchOffForm({
  businessId,
  counts,
}: {
  readonly businessId: string;
  readonly counts: AppointmentCounts;
}): ReactElement {
  return (
    <>
      <p className="mt-1 text-sm text-ink-soft">{appointmentCountsLine(counts)}</p>
      <form action={setModuleAction} className="mt-3">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="module" value="appointments" />
        <input type="hidden" name="enabled" value="off" />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="confirmOff" value="yes" required className={checkboxClasses} />
          <span>
            I understand their booking form stops taking requests
            <RequiredMark />
          </span>
        </label>
        <GatedSubmitButton className={`${buttonSecondary} mt-4`}>Switch off</GatedSubmitButton>
      </form>
    </>
  );
}

/** The Features section on a client's page: their time zone, and the modules switched on for their business. */
export function ClientFeatures({ businessId, timeZone, enabledModules, appointmentCounts, notice }: ClientFeaturesProps): ReactElement {
  const appointmentsOn = enabledModules.includes("appointments");
  return (
    <div>
      <TimeZoneForm businessId={businessId} timeZone={timeZone} />

      <div className="mt-8">
        <p className="flex flex-wrap items-center gap-3">
          <span className={labelClasses}>{BUSINESS_MODULE_LABELS.appointments}</span>
          <StatusDot tone={appointmentsOn ? "done" : "quiet"} label={appointmentsOn ? "On" : "Off"} />
        </p>
        {appointmentsOn ? (
          <SwitchOffForm businessId={businessId} counts={appointmentCounts} />
        ) : (
          <SwitchOnForm businessId={businessId} timeZone={timeZone} />
        )}
      </div>

      {notice === null ? null : (
        <Notice tone={BUSINESS_MODULE_NOTICES[notice].ok ? "ok" : "problem"} className="mt-6">
          {BUSINESS_MODULE_NOTICES[notice].text}
        </Notice>
      )}
    </div>
  );
}
