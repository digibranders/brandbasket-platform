"use client";

import Link from "next/link";
import { useActionState, type ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { INPUT_CLASS } from "@/components/panel/blog-editor/parts";
import { createCategoryAction, type CategoryFormResult } from "../actions";

const initialState: CategoryFormResult = { ok: true };

/** A name is all it takes to start; the category's own page opens straight after for its description and search. */
export default function NewCategoryPage(): ReactElement {
  const [state, formAction] = useActionState(createCategoryAction, initialState);

  return (
    <div className="max-w-xl">
      <Link
        href="/content/categories"
        className="text-sm text-ink-soft transition-colors duration-200 ease-calm hover:text-ink"
      >
        ← Categories
      </Link>
      <h1 className="panel-title mt-2">New category</h1>
      <form action={formAction} className="mt-8">
        <label htmlFor="name" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
          Name <RequiredMark />
        </label>
        <input id="name" name="name" required maxLength={60} autoFocus placeholder="e.g. Back care" className={INPUT_CLASS} />
        {state.ok ? null : (
          <p role="alert" className="mt-2 text-sm text-accent-deep">
            {state.message}
          </p>
        )}
        <SubmitButton size="sm" pendingLabel="Creating…" className="mt-5">
          Create category
        </SubmitButton>
      </form>
    </div>
  );
}
