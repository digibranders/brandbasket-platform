"use client";

import { useState } from "react";
import { WEEKDAYS } from "@brandbasket/shared/lib/onboarding/business-fields";
import { DAY_MODE_LABELS, DAY_MODES, type DayMode, type OpeningHours } from "@brandbasket/shared/lib/onboarding/hours";
import { Input, Select } from "@/ui";

const MODE_OPTIONS = DAY_MODES.map((mode) => ({ value: mode, label: DAY_MODE_LABELS[mode] }));

function DayRow({ day, saved }: { readonly day: number; readonly saved: OpeningHours | undefined }) {
  const [mode, setMode] = useState<DayMode>(saved?.mode ?? "unset");
  const name = WEEKDAYS[day] ?? "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 type-body">{name}</span>
      <Select
        aria-label={`${name}: how this day works`}
        name={`hours.${day}.mode`}
        options={MODE_OPTIONS}
        value={mode}
        onValueChange={(next) => setMode(DAY_MODES.find((candidate) => candidate === next) ?? "unset")}
        className="w-40"
      />
      {mode === "open" ? (
        <>
          <Input
            type="time"
            aria-label={`${name}: opens`}
            name={`hours.${day}.opens`}
            defaultValue={saved?.mode === "open" ? saved.opensAt : ""}
            className="w-32"
          />
          <Input
            type="time"
            aria-label={`${name}: closes`}
            name={`hours.${day}.closes`}
            defaultValue={saved?.mode === "open" ? saved.closesAt : ""}
            className="w-32"
          />
        </>
      ) : null}
    </div>
  );
}

/** Seven days, Monday first. A day left "Not set" saves nothing. The field names are the ones parseBusinessForm reads. */
export function HoursEditor({ hours }: { readonly hours: readonly OpeningHours[] }) {
  return (
    <div className="flex flex-col gap-2">
      {WEEKDAYS.map((_, day) => (
        <DayRow key={day} day={day} saved={hours.find((entry) => entry.dayOfWeek === day)} />
      ))}
    </div>
  );
}
