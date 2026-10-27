"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useActionState, type ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { RuleInput } from "@brandbasket/shared/ui/forms/rule-input";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { AUTHOR_NAME_MAX_LENGTH } from "@/lib/blog-author-fields";
import { INPUT_CLASS } from "@/components/panel/blog-editor/parts";
import { DARK_BUTTON_SHAPE } from "@/components/v2/classes";
import { PageSection } from "@/components/v2/page";
import { createAuthorAction, type AuthorFormResult } from "../actions";

const initialState: AuthorFormResult = { ok: true };

/** A name is all it takes to start; the author's own page opens straight after for the photo, role and links. */
export default function NewAuthorPage(): ReactElement {
  const [state, formAction] = useActionState(createAuthorAction, initialState);

  return (
    <PageSection
      id="new-author"
      title="New author"
      aside={
        <Link href="/content/authors" className="inline-flex items-center gap-1 font-semibold text-ink">
          <ArrowLeft size={14} aria-hidden="true" />
          Authors
        </Link>
      }
    >
      <form action={formAction} className="max-w-xl">
        <label htmlFor="name" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
          Name <RequiredMark />
        </label>
        <RuleInput
          rule="personName"
          id="name"
          name="name"
          required
          maxLength={AUTHOR_NAME_MAX_LENGTH}
          autoFocus
          placeholder="e.g. Asha Rao"
          autoComplete="off"
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
          Create author
        </SubmitButton>
      </form>
    </PageSection>
  );
}
