import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { onboardingStepHref, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import { SERVICE_NAMES, type ServiceKey } from "@/lib/first-look";
import { readyItemsFor, readyRows, type ReadyRow } from "@/lib/ready-items";
import { LIFT, SECTION_TITLE, SERVICE_DOT, SOFT_BUTTON } from "@/components/v2/classes";

/** Open items shown before the rest fold away. */
const OPEN_SHOWN = 4;
const UPLOADS = new Set(["brand"]);

function ServiceTag({ service }: { readonly service: ServiceKey }): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-[7px] rounded-[2px]", SERVICE_DOT[service])} />
      {SERVICE_NAMES[service]}
    </span>
  );
}

/** Before booking: what to have ready, to read while picking a time. No buttons. */
export function ReadyPreview({ services }: { readonly services: readonly ServiceKey[] }): ReactElement {
  const groups = services.map((service) => ({ service, items: readyItemsFor([service]) })).filter((group) => group.items.length > 0);
  return (
    <section aria-labelledby="ready-preview-title">
      <h2 id="ready-preview-title" className={SECTION_TITLE}>
        Have these ready for the call
      </h2>
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">No need to have everything. Bring what you have and we fill in the rest together.</p>
      <div className="mt-3 grid gap-3">
        {groups.map((group) => (
          <div key={group.service}>
            <p className="text-xs font-semibold text-ink-2">
              <ServiceTag service={group.service} />
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm leading-7 text-ink">
              {group.items.map((item) => (
                <li key={item.key}>{item.label}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReadyRowItem({ row }: { readonly row: ReadyRow }): ReactElement {
  const { item, done } = row;
  const action = done ? "Edit" : UPLOADS.has(item.key) ? "Upload" : "Add";
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line px-4 py-3 first:border-t-0">
      <span>
        {done ? (
          <CheckCircle size={18} weight="fill" aria-hidden="true" className="text-sage" />
        ) : (
          <Circle size={18} aria-hidden="true" className="text-ink-2" />
        )}
        <span className="sr-only">{done ? "Done" : "To do"}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[0.84375rem] font-semibold text-ink">{item.label}</span>
        <span className="block text-xs text-ink-2">
          <ServiceTag service={item.service} /> · {item.hint}
        </span>
      </span>
      {item.step === null ? (
        <span className="text-xs text-ink-2">Bring to the call</span>
      ) : (
        <Link href={onboardingStepHref(item.step)} aria-label={`${action} ${item.label}`} className={SOFT_BUTTON}>
          {action}
        </Link>
      )}
    </li>
  );
}

/** After booking: the same list as the task, open items first, the rest behind Show all. */
export function ReadyTask({ services, doneSteps }: { readonly services: readonly ServiceKey[]; readonly doneSteps: readonly OnboardingStepKey[] }): ReactElement {
  const rows = readyRows(services, doneSteps);
  const open = rows.filter((row) => !row.done);
  const doneCount = rows.length - open.length;
  const rest = [...open.slice(OPEN_SHOWN), ...rows.filter((row) => row.done)];
  const moreOpen = Math.max(open.length - OPEN_SHOWN, 0);
  const summary = [moreOpen > 0 ? `${moreOpen} more` : null, doneCount > 0 ? `${doneCount} done` : null].filter((part) => part !== null).join(", ");
  return (
    <section aria-labelledby="ready-task-title" className={LIFT}>
      <h2 id="ready-task-title" className="flex items-baseline gap-2 border-b border-line px-4 py-3 font-display text-[0.9375rem] font-semibold text-ink">
        Have these ready for the call
        <span className="font-figure text-xs font-medium text-ink-2">
          {doneCount} of {rows.length}
        </span>
      </h2>
      {open.length === 0 ? (
        <p className="px-4 py-3 text-[0.8125rem] text-ink-2">All set. Anything you add later is saved as you go.</p>
      ) : (
        <ul>
          {open.slice(0, OPEN_SHOWN).map((row) => (
            <ReadyRowItem key={row.item.key} row={row} />
          ))}
        </ul>
      )}
      {rest.length === 0 ? null : (
        <details className="group border-t border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[0.8125rem] text-ink-2">
            {summary}
            <span className="font-semibold text-ink group-open:hidden">Show all</span>
            <span className="hidden font-semibold text-ink group-open:inline">Hide</span>
          </summary>
          <ul className="border-t border-line">
            {rest.map((row) => (
              <ReadyRowItem key={row.item.key} row={row} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
