"use client";

import { useState, type ReactElement } from "react";
import { ItemForm } from "@/components/panel/business/item-form";
import { OptionList } from "@/components/panel/business/pick-steps";
import type { ItemFormState } from "@/lib/item-form-state";
import type { PickOption } from "@/lib/listing-address";

interface ExtraCategoriesProps {
  readonly action: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  /** Every category the business could also list in: all but its main one. */
  readonly options: readonly PickOption[];
  /** The slugs saved now, in order. */
  readonly saved: readonly string[];
  /** The main category's name, which the section says it is added to. */
  readonly mainLabel: string;
  readonly canChange: boolean;
  /** The most extra categories a business lists in. */
  readonly max: number;
}

/**
 * "Also list me in": the other categories the business shows under, up to three, besides its main one. Each shows as a
 * chip that takes it off; the list below adds more until the limit. Posts one `category` field per chip.
 */
export function ExtraCategories({ action, options, saved, mainLabel, canChange, max }: ExtraCategoriesProps): ReactElement {
  const byValue = new Map(options.map((option) => [option.value, option]));
  const [chosen, setChosen] = useState<readonly PickOption[]>(() =>
    saved.flatMap((slug) => {
      const option = byValue.get(slug);
      return option === undefined ? [] : [option];
    }),
  );
  const full = chosen.length >= max;
  const remaining = options.filter((option) => !chosen.some((pick) => pick.value === option.value));
  const unchanged = chosen.length === saved.length && chosen.every((pick, index) => pick.value === saved[index]);

  return (
    <section aria-labelledby="extra-categories-title" className="mt-12 max-w-3xl border-t border-line pt-8">
      <h2 id="extra-categories-title" className="panel-section">
        Also list me in
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Your main category is {mainLabel}. Show up under up to {max} more, and see which one brings you leads.
      </p>
      <div className="mt-5">
        <ItemForm action={action} submitLabel={unchanged ? "Saved" : "Save categories"}>
          {chosen.map((pick) => (
            <input key={pick.value} type="hidden" name="category" value={pick.value} />
          ))}
          <fieldset disabled={!canChange} className="space-y-5">
            {chosen.length === 0 ? null : (
              <ul aria-label="Your extra categories" className="flex flex-wrap gap-2">
                {chosen.map((pick) => (
                  <li key={pick.value}>
                    <button
                      type="button"
                      onClick={() => setChosen(chosen.filter((item) => item.value !== pick.value))}
                      className="inline-flex items-center gap-2 rounded-full border border-ink bg-ink px-4 py-2 text-sm font-medium text-paper"
                    >
                      {pick.label}
                      <span aria-hidden="true">×</span>
                      <span className="sr-only">Remove {pick.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {full ? (
              <p className="text-sm text-ink-soft">That is the most. Remove one to add another.</p>
            ) : (
              <OptionList
                noun="category"
                plural="categories"
                focusSearch={false}
                options={remaining}
                selected={null}
                onPick={(option) => setChosen([...chosen, option])}
              />
            )}
          </fieldset>
        </ItemForm>
      </div>
    </section>
  );
}
