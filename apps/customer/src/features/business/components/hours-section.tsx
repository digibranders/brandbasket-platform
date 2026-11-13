"use client";

import { Banner, Input, Select } from "@/ui";
import { saveHoursAction } from "../actions";
import { closesNextDay, DAY_MODE_LABELS, DAY_MODES, formSnapshot, hoursField, NEXT_DAY_NOTE, WEEKDAYS } from "../rules";
import { Section } from "./section";
import { useSectionForm, type SectionForm } from "./use-section-form";

const MODE_OPTIONS = DAY_MODES.map((mode) => ({ value: mode, label: DAY_MODE_LABELS[mode] }));

export interface HoursSectionProps {
  /** The stored week as form values (`hours.{day}.mode|opens|closes`). */
  readonly hours: Readonly<Record<string, string>>;
  readonly readOnly: boolean;
}

/** The week's opening hours, one row a day: not set, open between two times, closed or open 24 hours. Saved on its own. */
export function HoursSection(props: HoursSectionProps) {
  return <HoursFields key={formSnapshot(Object.entries(props.hours))} {...props} />;
}

function HoursFields({ hours, readOnly }: HoursSectionProps) {
  const form = useSectionForm({ id: "business-hours", initial: hours, action: saveHoursAction, saved: "Saved. Your website updates in about a minute." });
  return (
    <form id="business-hours" onSubmit={form.submit} noValidate>
      {form.message === undefined ? null : <Banner tone="neg" className="m-4 mb-0">{form.message}</Banner>}
      <Section title="Opening hours" where="Updates your website in about a minute">
        <div className="flex flex-col gap-3">
          {WEEKDAYS.map((day, index) => (
            <DayRow key={day} day={day} index={index} form={form} readOnly={readOnly} />
          ))}
        </div>
      </Section>
    </form>
  );
}

function DayRow({ day, index, form, readOnly }: { readonly day: string; readonly index: number; readonly form: SectionForm; readonly readOnly: boolean }) {
  const mode = form.values[hoursField(index, "mode")] ?? "unset";
  const opens = form.values[hoursField(index, "opens")] ?? "";
  const closes = form.values[hoursField(index, "closes")] ?? "";
  const error = form.errorOf(hoursField(index, "mode")) ?? form.errorOf(hoursField(index, "opens")) ?? form.errorOf(hoursField(index, "closes"));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-28 type-sub">{day}</span>
        <Select
          aria-label={`${day} hours`}
          options={MODE_OPTIONS}
          value={mode}
          onValueChange={(next) => next !== null && form.set(hoursField(index, "mode"), next)}
          disabled={readOnly}
          className="w-40"
        />
        {mode === "open" ? (
          <>
            <Input type="time" aria-label={`${day} opens`} value={opens} onChange={(event) => form.set(hoursField(index, "opens"), event.currentTarget.value)} disabled={readOnly} className="w-32" />
            <span className="type-body">to</span>
            <Input type="time" aria-label={`${day} closes`} value={closes} onChange={(event) => form.set(hoursField(index, "closes"), event.currentTarget.value)} disabled={readOnly} className="w-32" />
            {opens !== "" && closes !== "" && closesNextDay(opens, closes) ? <span className="type-meta">{NEXT_DAY_NOTE}</span> : null}
          </>
        ) : null}
      </div>
      {error === undefined ? null : (
        <p role="alert" className="type-meta text-neg-text">
          {error}
        </p>
      )}
    </div>
  );
}
