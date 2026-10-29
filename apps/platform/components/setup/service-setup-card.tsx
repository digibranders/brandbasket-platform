import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { SetupItemForm } from "@/components/todo/setup-item-form";
import { LIFT, SECTION_TITLE } from "@/components/v2/classes";
import { SETUP_CARD_ID, type SetupAsk } from "@/lib/setup-asks";

/**
 * The one card on a service page that asks the customer for what we cannot start without. Each question has its own small
 * form, and a saved one leaves the card. Nothing is shown when nothing is needed.
 */
export function ServiceSetupCard({ asks }: { readonly asks: readonly SetupAsk[] }): ReactElement | null {
  if (asks.length === 0) return null;
  return (
    <section id={SETUP_CARD_ID} aria-labelledby="setup-title" className={cn(LIFT, "scroll-mt-24 p-4 sm:p-5")}>
      <h2 id="setup-title" className={cn(SECTION_TITLE, "px-4")}>
        {asks.length === 1 ? "We need one thing from you" : "We need a few things from you"}
      </h2>
      <ul className="divide-y divide-line">
        {asks.map((ask) => (
          <li key={ask.key} className="pt-4 first:pt-2">
            <h3 className="px-4 text-[0.9375rem] font-semibold text-ink">{ask.label}</h3>
            <p className="px-4 pb-2 text-[0.8125rem] text-ink-2">{ask.hint}</p>
            <SetupItemForm setup={ask.setup} saved={ask.saved} />
          </li>
        ))}
      </ul>
    </section>
  );
}
