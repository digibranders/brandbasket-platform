"use client";

import Link from "next/link";
import { useActionState, type ReactElement } from "react";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { RuleInput } from "@fynix/shared/ui/forms/rule-input";
import { SubmitButton } from "@fynix/shared/ui/panel/submit-button";
import { AUTHOR_NAME_MAX_LENGTH } from "@/lib/blog-author-fields";
import { INPUT_CLASS } from "@/components/panel/blog-editor/parts";
import { createAuthorAction, type AuthorFormResult } from "../actions";

const initialState: AuthorFormResult = { ok: true };

/** A name is all it takes to start; the author's own page opens straight after for the photo, role and links. */
export default function NewAuthorPage(): ReactElement {
  const [state, formAction] = useActionState(createAuthorAction, initialState);

  return (
    <div className="max-w-xl">
      <Link href="/content/authors" className="text-sm text-ink-soft transition-colors duration-200 ease-calm hover:text-ink">
        ← Authors
      </Link>
      <h1 className="panel-title mt-2">New author</h1>
      <form action={formAction} className="mt-8">
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
          className={INPUT_CLASS}
        />
        {state.ok ? null : (
          <p role="alert" className="mt-2 text-sm text-accent-deep">
            {state.message}
          </p>
        )}
        <SubmitButton size="sm" pendingLabel="Creating…" className="mt-5">
          Create author
        </SubmitButton>
      </form>
    </div>
  );
}
