"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Banner, Button, Field, Sheet, useToast, type FieldProps } from "@/ui";

const FieldErrors = createContext<Readonly<Record<string, string>>>({});

/** Field for a form inside ItemForm: the message the action returned for this field's name shows under it. */
export function FormField({ name, ...rest }: FieldProps & { readonly name: string }) {
  const errors = useContext(FieldErrors);
  const error = errors[name];
  return <Field {...rest} name={name} {...(error === undefined ? {} : { error })} />;
}

export interface ItemFormProps {
  readonly title: string;
  readonly description?: string;
  readonly action: (formData: FormData) => Promise<ActionResult>;
  /** Locked or view-only: the answers show, nothing saves. `readOnlyReason` says why. */
  readonly readOnly?: boolean;
  readonly readOnlyReason?: string;
  readonly children: ReactNode;
}

/**
 * One checklist item in a right-hand sheet. It saves on its own and closes; a refused save keeps everything typed, because the
 * form is submitted by hand and never reset. The sheet is open whenever `?item=` names it, so closing goes back to /checklist.
 */
export function ItemForm({ title, description, action, readOnly = false, readOnlyReason, children }: ItemFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ readonly message: string; readonly fields: Readonly<Record<string, string>> } | null>(null);
  const formId = `item-${title.replace(/\s+/g, "-").toLowerCase()}`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(data);
      if (result.ok) {
        toast("Saved");
        router.replace("/checklist");
        return;
      }
      setFailure({ message: result.message, fields: result.fieldErrors ?? {} });
    });
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.replace("/checklist");
      }}
      title={title}
      {...(description === undefined ? {} : { description })}
      footer={
        readOnly ? undefined : (
          <Button type="submit" form={formId} variant="primary" pending={pending}>
            Save
          </Button>
        )
      }
    >
      {readOnly && readOnlyReason !== undefined ? <Banner tone="info">{readOnlyReason}</Banner> : null}
      {failure === null ? null : <Banner tone="neg">{failure.message}</Banner>}
      <FieldErrors.Provider value={failure?.fields ?? {}}>
        <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
            {children}
          </fieldset>
        </form>
      </FieldErrors.Provider>
    </Sheet>
  );
}
