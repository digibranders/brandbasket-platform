"use client";

import { useId, useState, type ReactElement } from "react";
import { cn } from "@firstfold/shared/lib/cn";
import { dayModeField, WEEKDAYS } from "@firstfold/shared/lib/onboarding/business-fields";
import {
  closesNextDay,
  DAY_MODE_LABELS,
  DAY_MODES,
  isDayMode,
  NEXT_DAY_NOTE,
  type DayMode,
  type OpeningHours,
} from "@firstfold/shared/lib/onboarding/hours";
import { RequiredMark } from "@firstfold/shared/ui/forms/required-mark";
import { SelectField, type SelectOption } from "@firstfold/shared/ui/select-field";

interface DayState {
  readonly mode: DayMode;
  readonly opens: string;
  readonly closes: string;
}

interface HoursEditorProps {
  /** Saved hours. A day with no entry starts as "Not set", so nothing is saved for it unless the customer chooses. */
  readonly initial: readonly OpeningHours[];
  /** The form field an error is about, e.g. "hours.2.opens", so that input can be marked. */
  readonly invalidField: string | null;
  readonly errorId: string;
  /** Drops the legend, the helper paragraph and the surrounding border — for a page (like "Your details") that
   * already has its own heading for this editor and already keeps sections apart with hairlines rather than
   * boxes. Onboarding's business step keeps the full version. */
  readonly bare?: boolean;
}

const WEEKEND_START = 5;
const NOT_SET: DayState = { mode: "unset", opens: "", closes: "" };

function startingDays(initial: readonly OpeningHours[]): DayState[] {
  return WEEKDAYS.map((_, day) => {
    const saved = initial.find((entry) => entry.dayOfWeek === day);
    if (saved === undefined) return NOT_SET;
    if (saved.mode === "open") return { mode: "open", opens: saved.opensAt, closes: saved.closesAt };
    return { mode: saved.mode, opens: "", closes: "" };
  });
}

const CONTROL_CLASSES =
  "mt-1 block w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2 text-sm text-ink tabular-nums transition-colors duration-300 ease-calm focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-accent-deep";

/** The day-mode dropdown's trigger: the same box as the time fields beside it, without their top margin. */
const MODE_TRIGGER_CLASSES =
  "w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2 text-sm text-ink transition-colors duration-300 ease-calm focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-accent-deep";

const MODE_OPTIONS: readonly SelectOption[] = DAY_MODES.map((mode) => ({ value: mode, label: DAY_MODE_LABELS[mode] }));

/**
 * Opening hours for the week. Each day is Not set, Open, Closed or Open 24 hours; its two times are always shown but only
 * editable, and so sent, on an open day. A closing time earlier than opening is a day that closes after midnight, and says so.
 */
export function HoursEditor({ initial, invalidField, errorId, bare = false }: HoursEditorProps): ReactElement {
  const [days, setDays] = useState<DayState[]>(() => startingDays(initial));
  const idPrefix = useId();

  function update(day: number, patch: Partial<DayState>): void {
    setDays((current) => current.map((entry, index) => (index === day ? { ...entry, ...patch } : entry)));
  }

  function copyMondayToWeekdays(): void {
    setDays((current) => {
      const monday = current[0];
      if (monday === undefined) return current;
      return current.map((entry, index) => (index > 0 && index < WEEKEND_START ? { ...monday } : entry));
    });
  }

  function invalid(name: string): { readonly "aria-invalid"?: true; readonly "aria-describedby"?: string } {
    return invalidField === name ? { "aria-invalid": true, "aria-describedby": errorId } : {};
  }

  return (
    <fieldset>
      <div className={cn("flex flex-wrap items-baseline gap-3", bare ? "justify-end" : "justify-between")}>
        {bare ? null : (
          <legend className="text-sm font-medium">
            Opening hours <span className="font-normal text-ink-soft">(optional)</span>
          </legend>
        )}
        <button
          type="button"
          onClick={copyMondayToWeekdays}
          className="link-underline text-sm text-ink-soft transition-colors hover:text-ink"
        >
          Use Monday’s hours for every weekday
        </button>
      </div>
      {bare ? null : (
        <p className="mt-1 text-sm text-ink-soft">
          Leave a day as Not set if you’d rather not show its hours. If you close after midnight, pick the closing
          time as it reads on the clock.
        </p>
      )}

      <div className={cn("mt-3 divide-y divide-line", bare ? undefined : "rounded-control border border-line bg-paper/60")}>
        {WEEKDAYS.map((label, day) => {
          const state = days[day] ?? NOT_SET;
          const modeName = dayModeField(day);
          const modeId = `${idPrefix}-mode-${String(day)}`;
          const opensName = `hours.${day}.opens`;
          const closesName = `hours.${day}.closes`;
          const isOpen = state.mode === "open";
          const overnight =
            isOpen && state.opens !== "" && state.closes !== "" && closesNextDay(state.opens, state.closes);
          return (
            <div
              key={label}
              className="grid grid-cols-[6.5rem_1fr] items-end gap-3 px-4 py-3 sm:grid-cols-[7rem_11rem_1fr_1fr]"
            >
              <span className="self-center text-sm font-medium">{label}</span>
              <div className="text-xs text-ink-soft">
                <label htmlFor={modeId}>
                  <span className="sr-only">{label}: </span>
                  Hours
                </label>
                <SelectField
                  id={modeId}
                  name={modeName}
                  options={MODE_OPTIONS}
                  value={state.mode}
                  onChange={(mode) => {
                    if (isDayMode(mode)) update(day, { mode });
                  }}
                  searchable={false}
                  className={MODE_TRIGGER_CLASSES}
                  wrapperClassName="mt-1"
                  {...invalid(modeName)}
                />
              </div>
              <>
                  <label className="col-start-2 text-xs text-ink-soft sm:col-start-auto">
                    <span className="sr-only">{label}: </span>
                    Opens{isOpen ? <RequiredMark /> : null}
                    <input
                      type="time"
                      name={opensName}
                      value={state.opens}
                      required={isOpen}
                      disabled={!isOpen}
                      onChange={(event) => update(day, { opens: event.target.value })}
                      className={CONTROL_CLASSES}
                      {...invalid(opensName)}
                    />
                  </label>
                  <label className="col-start-2 text-xs text-ink-soft sm:col-start-auto">
                    <span className="sr-only">{label}: </span>
                    Closes{isOpen ? <RequiredMark /> : null}
                    {overnight ? <span className="text-ink"> {NEXT_DAY_NOTE}</span> : null}
                    <input
                      type="time"
                      name={closesName}
                      value={state.closes}
                      required={isOpen}
                      disabled={!isOpen}
                      onChange={(event) => update(day, { closes: event.target.value })}
                      className={CONTROL_CLASSES}
                      {...invalid(closesName)}
                    />
                  </label>
              </>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
