"use client";

import { useActionState, type ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { SubmitButton } from "@brandbasket/shared/ui/panel/submit-button";
import { createBlogPostAction, type BlogFormResult } from "../actions";

const initialState: BlogFormResult = { ok: true };

/** Title only — the body, excerpt and cover image are all filled in afterwards on the edit page (see
 * blog/actions.ts's `createBlogPostAction` doc comment). A client component because `useActionState` needs one,
 * and `createBlogPostAction` redirects on success: called through `useActionState`, that redirect navigates the
 * browser without this component needing to do anything extra. */
export default function NewBlogPostPage(): ReactElement {
  const [state, formAction] = useActionState(createBlogPostAction, initialState);

  return (
    <>
      <h1 className="panel-title">New post</h1>
      <form action={formAction} className="mt-8 max-w-xl rounded-card border border-line bg-card p-6 sm:p-8">
        <label htmlFor="title" className="text-sm font-medium">
          Title <RequiredMark />
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          className="mt-1.5 block w-full rounded-control border border-ink-soft/65 bg-paper px-3 py-2.5 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent"
        />
        {state.ok ? null : (
          <p role="alert" className="mt-2 text-sm text-accent-deep">
            {state.message}
          </p>
        )}
        <SubmitButton size="sm" pendingLabel="Creating…" className="mt-4">
          Create post
        </SubmitButton>
      </form>
    </>
  );
}
