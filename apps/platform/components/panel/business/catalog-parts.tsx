import type { ReactElement, ReactNode } from "react";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";

export const INPUT_CLASSES =
  "mt-1 block w-full rounded-control border border-ink-soft/50 bg-white px-3 py-1.5 text-sm text-ink transition-colors duration-300 ease-calm placeholder:text-ink-soft/80 focus:border-accent";
const LABEL_CLASSES = "block text-[0.8125rem] font-medium text-ink-soft";

interface LabelledProps {
  readonly id: string;
  readonly label: string;
  /** The server refuses this field blank, so the label carries the asterisk. */
  readonly required?: boolean;
  readonly children: ReactNode;
}

/** A label above a control, in the Business profile's form style. */
export function Labelled({ id, label, required = false, children }: LabelledProps): ReactElement {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASSES}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {children}
    </div>
  );
}

const RUPEES = new Intl.NumberFormat("en-IN");

/** A price in whole rupees as the page shows it; "On request" when there is none. */
export function priceText(priceInr: number | null): string {
  return priceInr === null ? "On request" : `₹${RUPEES.format(priceInr)}`;
}

interface ItemRowProps {
  readonly title: string;
  readonly facts: readonly string[];
  /** The edit form, opened by "Edit"; null hides Edit (a business staff took down). */
  readonly editForm: ReactNode;
  /** The remove form, or null. */
  readonly removeForm: ReactNode;
  /** A small picture of the item, before its name, or null. */
  readonly lead?: ReactNode;
}

/** One saved service or product: its name and facts on a line, with Edit opening its form below and Remove beside it. */
export function ItemRow({ title, facts, editForm, removeForm, lead = null }: ItemRowProps): ReactElement {
  return (
    <li className="py-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-6 gap-y-1 [&::-webkit-details-marker]:hidden">
          {lead}
          <span className="min-w-0 flex-1">
            <span className="font-medium">{title}</span>
            {facts.length === 0 ? null : <span className="ml-3 text-sm text-ink-soft">{facts.join(" · ")}</span>}
          </span>
          {editForm === null ? null : (
            <span className="link-underline text-sm text-ink-soft group-open:hidden">
              Edit<span className="sr-only"> {title}</span>
            </span>
          )}
        </summary>
        {editForm === null ? null : <div className="mt-5 max-w-xl">{editForm}</div>}
      </details>
      {removeForm === null ? null : <div className="mt-1">{removeForm}</div>}
    </li>
  );
}

interface RemoveButtonProps {
  readonly action: (formData: FormData) => Promise<void>;
  readonly id: string;
  readonly name: string;
}

/** The Remove button for one item: a form that posts only its id. */
export function RemoveButton({ action, id, name }: RemoveButtonProps): ReactElement {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-sm text-ink-soft transition-colors duration-300 ease-calm hover:text-accent-deep">
        Remove<span className="sr-only"> {name}</span>
      </button>
    </form>
  );
}
