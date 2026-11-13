"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Banner, Button, Dialog, DialogClose, EmptyState, Field, Input, Radio, RadioGroup, useToast } from "@/ui";
import type { ActionFailure } from "@/lib/action-result";
import { addClosureAction, deleteClosureAction } from "../actions";
import { CLOSURE_NOTE_MAX_LENGTH, toFormData, type Closure } from "../rules";
import { dayLabel } from "./announcement-section";
import { Section } from "./section";

export interface HolidaysSectionProps {
  /** Upcoming holidays only, soonest first. */
  readonly closures: readonly Closure[];
  /** Today where the business is (YYYY-MM-DD): the earliest last day the server accepts. */
  readonly today: string;
  readonly readOnly: boolean;
}

/** "3 Nov 2026" for a single day, "3 Nov 2026 to 5 Nov 2026" for a range. */
function rangeLabel(closure: Closure): string {
  return closure.startsOn === closure.endsOn ? dayLabel(closure.startsOn) : `${dayLabel(closure.startsOn)} to ${dayLabel(closure.endsOn)}`;
}

/** What the business does on these days: "Closed all day", or "Open 10:00 to 14:00" for a half day. */
function closureHours(closure: Closure): string {
  return typeof closure.opensAt === "string" && typeof closure.closesAt === "string" ? `Open ${closure.opensAt} to ${closure.closesAt}` : "Closed all day";
}

const BLANK: Readonly<Record<string, string>> = { startsOn: "", endsOn: "", note: "", kind: "closed", opensAt: "", closesAt: "" };

/** Days the website shows as closed, or open on different hours: the list of what is coming up, an add dialog and Remove on each row. */
export function HolidaysSection({ closures, today, readOnly }: HolidaysSectionProps) {
  const toast = useToast();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Readonly<Record<string, string>>>(BLANK);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const [adding, startAdding] = useTransition();
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);

  const set = (name: string, next: string) => setValues((previous) => ({ ...previous, [name]: next }));
  const errorOf = (name: string) => failure?.fieldErrors?.[name];

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setValues(BLANK);
      setFailure(null);
    }
  };

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startAdding(async () => {
      const result = await addClosureAction(toFormData(values));
      if (result.ok) {
        changeOpen(false);
        toast("Saved. Your website updates in about a minute.");
      } else {
        setFailure(result);
      }
    });
  };

  const remove = (closure: Closure) => {
    setRemoveError(undefined);
    startRemoving(async () => {
      const result = await deleteClosureAction(closure.id);
      if (result.ok) titleRef.current?.focus();
      else setRemoveError(result.message);
    });
  };

  return (
    <Section title="Holidays" where="Days your website shows you as closed, or open on different hours" titleRef={titleRef}>
      {removeError === undefined ? null : <Banner tone="neg">{removeError}</Banner>}
      {closures.length === 0 ? (
        <EmptyState icon="CalendarBlank" title="No holidays coming up" description="The holidays you add appear here until they have passed." />
      ) : (
        <ul className="divide-y divide-border-subtle rounded-control border border-border">
          {closures.map((closure) => (
            <li key={closure.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="type-sub">{rangeLabel(closure)}</p>
                {closure.note === null ? null : <p className="type-body text-ink-2">{closure.note}</p>}
                <p className="type-meta">{closureHours(closure)}</p>
              </div>
              {readOnly ? null : (
                <Button size="sm" disabled={removing} aria-label={`Remove holiday ${rangeLabel(closure)}`} onClick={() => remove(closure)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : (
        <div>
          <Button icon="Plus" onClick={() => changeOpen(true)}>
            Add a holiday
          </Button>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={changeOpen}
        title="Add a holiday"
        footer={
          <>
            <DialogClose>
              <Button>Cancel</Button>
            </DialogClose>
            <Button type="submit" form="business-holiday" variant="primary" pending={adding}>
              Add
            </Button>
          </>
        }
      >
        <form id="business-holiday" onSubmit={add} noValidate className="flex flex-col gap-4">
          {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day" name="startsOn" error={errorOf("startsOn")}>
              <Input type="date" value={values.startsOn ?? ""} min={today} onChange={(event) => set("startsOn", event.currentTarget.value)} />
            </Field>
            <Field label="Last day" name="endsOn" error={errorOf("endsOn")}>
              <Input type="date" value={values.endsOn ?? ""} min={today} onChange={(event) => set("endsOn", event.currentTarget.value)} />
            </Field>
          </div>
          <Field label="Reason (optional)" name="note" error={errorOf("note")}>
            <Input value={values.note ?? ""} maxLength={CLOSURE_NOTE_MAX_LENGTH} placeholder="Diwali" onChange={(event) => set("note", event.currentTarget.value)} />
          </Field>
          <div className="flex flex-col gap-2">
            <p id="business-holiday-kind" className="type-sub">
              On these days
            </p>
            <RadioGroup aria-labelledby="business-holiday-kind" value={values.kind ?? "closed"} onValueChange={(next) => set("kind", next)}>
              <Radio value="closed" label="Closed all day" />
              <Radio value="hours" label="Different hours, such as a half day" />
            </RadioGroup>
          </div>
          {values.kind === "hours" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens" name="opensAt" error={errorOf("opensAt")}>
                <Input type="time" value={values.opensAt ?? ""} onChange={(event) => set("opensAt", event.currentTarget.value)} />
              </Field>
              <Field label="Closes" name="closesAt" error={errorOf("closesAt")}>
                <Input type="time" value={values.closesAt ?? ""} onChange={(event) => set("closesAt", event.currentTarget.value)} />
              </Field>
            </div>
          ) : null}
        </form>
      </Dialog>
    </Section>
  );
}
