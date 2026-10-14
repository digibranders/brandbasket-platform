"use client";

import { useState, type ReactElement } from "react";
import { PAGE_TAB_LABEL_MAX_LENGTH, type RenamablePageTab } from "@fynix/shared/lib/directory/page-tabs";
import { INPUT_CLASSES } from "@/components/panel/business/catalog-parts";
import { pageTabLabelField } from "@/lib/contact-trust-form";

/** Names a business of that kind might give the tab; one tap fills the box. */
const SUGGESTIONS: Readonly<Record<RenamablePageTab, readonly string[]>> = {
  services: ["Menu", "Treatments", "Packages", "Classes"],
  products: ["Menu", "Medicines", "Shop", "Catalogue"],
};

interface TabNameFieldProps {
  readonly tab: RenamablePageTab;
  /** The usual word for the tab: shown when the box is empty. */
  readonly usual: string;
  /** The name saved now; empty when the owner kept the usual one. */
  readonly saved: string;
  readonly disabled: boolean;
}

/**
 * The box under a Services or Products tab on the Page tabs tab where the owner calls it something else: a restaurant's
 * "Menu", a clinic's "Treatments". Empty keeps the usual word. The box posts with the tab choices, as `label-services` /
 * `label-products`, and the live preview reads it from there.
 */
export function TabNameField({ tab, usual, saved, disabled }: TabNameFieldProps): ReactElement {
  const [value, setValue] = useState(saved);
  const id = `page-tab-label-${tab}`;
  return (
    <div className="pb-1 pl-7">
      <label htmlFor={id} className="block text-[0.8125rem] font-medium text-ink-soft">
        Name on your page<span className="sr-only"> for {usual}</span>
      </label>
      <input
        id={id}
        name={pageTabLabelField(tab)}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={PAGE_TAB_LABEL_MAX_LENGTH}
        placeholder={usual}
        autoComplete="off"
        disabled={disabled}
        className={`${INPUT_CLASSES} max-w-xs`}
      />
      {disabled ? null : (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-ink-soft">
          <span>Or pick</span>
          {SUGGESTIONS[tab].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setValue(name)}
              aria-pressed={value === name}
              className="rounded-full border border-line px-2.5 py-0.5 font-medium text-ink transition-colors duration-300 ease-calm hover:bg-paper-deep aria-pressed:border-accent aria-pressed:text-accent"
            >
              {name}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
