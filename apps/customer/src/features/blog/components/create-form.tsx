"use client";

import { useActionState } from "react";
import { Panel } from "@/components";
import type { ActionResult } from "@/lib/action-result";
import { Banner, Button, Field, Input } from "@/ui";

export interface CreateFormProps {
  readonly title: string;
  /** One field is all it takes to start: a post's title, an author's or a category's name. The rest is filled in after. */
  readonly field: { readonly name: string; readonly label: string; readonly hint: string; readonly maxLength: number };
  readonly submitLabel: string;
  /** Opens the new item on success (a redirect), or answers why not. */
  readonly action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}

/** A short form with one primary button (plan 60, section 14): the name of the new thing, then its own page opens. */
export function CreateForm({ title, field, submitLabel, action }: CreateFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const failed = state !== null && !state.ok ? state : null;
  return (
    <Panel title={title}>
      <form action={formAction} className="flex max-w-xl flex-col gap-4">
        {failed === null || failed.fieldErrors?.[field.name] !== undefined ? null : <Banner tone="neg">{failed.message}</Banner>}
        <Field label={field.label} name={field.name} hint={field.hint} error={failed?.fieldErrors?.[field.name]}>
          <Input name={field.name} required maxLength={field.maxLength} autoFocus />
        </Field>
        <div>
          <Button type="submit" variant="primary" pending={pending}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
