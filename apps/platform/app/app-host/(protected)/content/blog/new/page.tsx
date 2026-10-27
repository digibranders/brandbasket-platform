"use client";

import { useActionState, type ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { INPUT_CLASS } from "@/components/panel/blog-editor/parts";
import { DARK_BUTTON_SHAPE } from "@/components/v2/classes";
import { PageSection } from "@/components/v2/page";
import { createBlogPostAction, type BlogFormResult } from "../actions";

const initialState: BlogFormResult = { ok: true };

/** Title only — the body, excerpt and cover image are all filled in afterwards on the edit page (see
 * blog/actions.ts's `createBlogPostAction` doc comment). A client component because `useActionState` needs one,
 * and `createBlogPostAction` redirects on success: called through `useActionState`, that redirect navigates the
 * browser without this component needing to do anything extra. */
export default function NewBlogPostPage(): ReactElement {
  const [state, formAction] = useActionState(createBlogPostAction, initialState);

  return (
    <PageSection id="new-post" title="New post">
      <form action={formAction} className="max-w-xl">
        <label htmlFor="title" className="mb-1.5 block text-[0.8125rem] font-semibold text-ink">
          Title <RequiredMark />
        </label>
        <input id="title" name="title" required maxLength={200} aria-invalid={state.ok ? undefined : true} aria-describedby={state.ok ? undefined : "title-error"} className={INPUT_CLASS} />
        {state.ok ? null : (
          <p id="title-error" role="alert" className="mt-2 text-sm text-error">
            {state.message}
          </p>
        )}
        <SubmitButton pendingLabel="Creating…" className={`${DARK_BUTTON_SHAPE} mt-5`}>
          Create post
        </SubmitButton>
      </form>
    </PageSection>
  );
}
