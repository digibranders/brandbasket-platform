"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useActionState, type ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { INPUT_CLASS } from "@/components/panel/blog-editor/parts";
import { DARK_BUTTON_SHAPE } from "@/components/v2/classes";
import { PageSection } from "@/components/v2/page";
import { createCategoryAction, type CategoryFormResult } from "../actions";

const initialState: CategoryFormResult = { ok: true };

/** A name is all it takes to start; the category's own page opens straight after for its description and search. */
export default function NewCategoryPage(): ReactElement {
  const [state, formAction] = useActionState(createCategoryAction, initialState);

  return (
    <PageSection
      id="new-category"
      title="New category"
      aside={
        <Link href="/content/categories" className="inline-flex items-center gap-1 font-semibold text-ink">
          <ArrowLeft size={14} aria-hidden="true" />
          Categories
        </Link>
      }
    >
      <form action={formAction} className="max-w-xl">
        <label htmlFor="name" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
          Name <RequiredMark />
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={60}
          autoFocus
          placeholder="e.g. Back care"
          aria-invalid={state.ok ? undefined : true}
          aria-describedby={state.ok ? undefined : "name-error"}
          className={INPUT_CLASS}
        />
        {state.ok ? null : (
          <p id="name-error" role="alert" className="mt-2 text-sm text-error">
            {state.message}
          </p>
        )}
        <SubmitButton pendingLabel="Creating…" className={`${DARK_BUTTON_SHAPE} mt-5`}>
          Create category
        </SubmitButton>
      </form>
    </PageSection>
  );
}
