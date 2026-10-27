import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { Section } from "@/components/console/section";
import type { SystemLine, SystemState } from "@/lib/server/system-health";

const DOTS: Readonly<Record<SystemState, string>> = { ok: "bg-sage", warn: "bg-rattan", bad: "bg-error" };
/** The dot's meaning in words, for screen readers: colour is never the only sign. */
const SAID: Readonly<Record<SystemState, string>> = { ok: "working", warn: "needs a look", bad: "failing" };

export function Systems({ lines }: { readonly lines: readonly SystemLine[] }): ReactElement {
  return (
    <Section title="Systems">
      <ul>
        {lines.map((line) => (
          <li key={line.key} className="grid grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2 text-[0.84375rem]">
            <span aria-hidden="true" className={cn("size-[9px] rounded-full", DOTS[line.state])} />
            <span className="text-ink">
              {line.label}
              <span className="sr-only">, {SAID[line.state]}</span>
            </span>
            <span className="font-figure text-xs text-ink-2">{line.detail}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
