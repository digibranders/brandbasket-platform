"use client";

import { useActionState, type ReactElement } from "react";
import { saveSetupItemAction } from "@/app/app-host/(protected)/todo/actions";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { initialSetupFormState, SETUP_FIELDS, type SetupFormState, type SetupKey } from "@/lib/service-setup";

const INPUT =
  "mt-1.5 block w-full rounded-control border border-ink-2/65 bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-2/80 focus:border-ink";

interface SetupItemFormProps {
  readonly setup: SetupKey;
  /** What was saved before, to start the fields with. */
  readonly saved: Readonly<Record<string, unknown>> | undefined;
}

/** The small form under one Social or Search item. Saved answers are only ever put in field values, never as HTML. */
export function SetupItemForm({ setup, saved }: SetupItemFormProps): ReactElement {
  const [state, action, pending] = useActionState<SetupFormState, FormData>(saveSetupItemAction, initialSetupFormState);
  const mine = state.status !== "idle" && state.key === setup ? state : null;
  const startValue = (name: string): string => {
    if (mine?.status === "error") return mine.values[name] ?? "";
    const value = saved?.[name];
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  };
  return (
    <form action={action} className="grid gap-4 px-4 pb-4 pt-1">
      <input type="hidden" name="key" value={setup} />
      {SETUP_FIELDS[setup].map((field) => {
        const id = `${setup}-${field.name}`;
        const problem = mine?.status === "error" && mine.field === field.name ? mine.message : null;
        const described = problem === null ? undefined : `${id}-error`;
        return (
          <div key={field.name}>
            <label htmlFor={id} className="block text-[0.8125rem] font-semibold text-ink">
              {field.label}
            </label>
            {field.kind === "textarea" ? (
              <textarea
                id={id}
                name={field.name}
                rows={3}
                defaultValue={startValue(field.name)}
                placeholder={field.placeholder}
                aria-invalid={problem !== null}
                aria-describedby={described}
                className={INPUT}
              />
            ) : field.kind === "select" ? (
              <select
                id={id}
                name={field.name}
                defaultValue={startValue(field.name) || field.options?.[0]?.value}
                aria-invalid={problem !== null}
                aria-describedby={described}
                className={INPUT}
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={field.name}
                type="text"
                inputMode={field.inputMode}
                autoComplete="off"
                defaultValue={startValue(field.name)}
                placeholder={field.placeholder}
                aria-invalid={problem !== null}
                aria-describedby={described}
                className={INPUT}
              />
            )}
            {field.hint === undefined ? null : <p className="mt-1 text-xs text-ink-2">{field.hint}</p>}
            {problem === null ? null : (
              <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-semibold text-error">
                {problem}
              </p>
            )}
          </div>
        );
      })}
      {mine?.status === "error" && mine.field === "" ? (
        <p role="alert" className="text-xs font-semibold text-error">
          {mine.message}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={SOFT_BUTTON}>
          {pending ? "Saving..." : "Save"}
        </button>
        {/* Always in the page, so a screen reader announces the text when it appears. */}
        <p role="status" className="text-xs font-semibold text-sage-deep">
          {mine?.status === "saved" ? "Saved." : ""}
        </p>
      </div>
    </form>
  );
}
