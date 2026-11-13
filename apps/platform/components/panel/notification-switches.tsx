"use client";

import { useState, useTransition, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import type { NotificationChoiceState, NotificationRow } from "@/lib/settings/notifications";

interface NotificationSwitchesProps {
  readonly rows: readonly NotificationRow[];
  readonly action: (topic: string, email: boolean) => Promise<NotificationChoiceState>;
}

/** One email switch per kind of message, applied the moment it is flipped. A switch that could not be saved goes back and says so. */
export function NotificationSwitches({ rows, action }: NotificationSwitchesProps): ReactElement {
  const [choices, setChoices] = useState<Readonly<Record<string, boolean>>>(() => Object.fromEntries(rows.map((row) => [row.topic, row.email])));
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function change(topic: string, email: boolean): void {
    const before = choices[topic] ?? false;
    setMessage(null);
    setChoices((previous) => ({ ...previous, [topic]: email }));
    startTransition(async () => {
      let result: NotificationChoiceState;
      try {
        result = await action(topic, email);
      } catch {
        result = { status: "error", message: "We could not save that. Try again in a moment." };
      }
      if (result.status === "saved") return;
      setChoices((previous) => ({ ...previous, [topic]: before }));
      setMessage(result.message);
    });
  }

  return (
    <div>
      {message === null ? null : (
        <p role="alert" className="pb-3 text-[0.9375rem] font-semibold text-error">
          {message}
        </p>
      )}
      <ul aria-label="Email notifications" className="divide-y divide-line">
        {rows.map((row) => {
          const on = choices[row.topic] ?? false;
          return (
            <li key={row.topic} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <span id={`notify-${row.topic}`} className="text-base text-ink">
                {row.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`notify-${row.topic}`}
                onClick={() => change(row.topic, !on)}
                className="flex h-11 w-14 shrink-0 items-center justify-end rounded-[0.625rem] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-rattan-text"
              >
                <span className={cn("relative h-6 w-11 rounded-full border transition-colors duration-200", on ? "border-ok bg-ok" : "border-ink-2/65 bg-sunken")}>
                  <span
                    className={cn("absolute top-0.5 size-4.5 rounded-full transition-transform duration-200", on ? "translate-x-5.5 bg-surface" : "translate-x-0.5 bg-ink-2")}
                  />
                </span>
                <span className="sr-only">{on ? "On" : "Off"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
