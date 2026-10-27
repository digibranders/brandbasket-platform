"use client";

import { useActionState, type ReactElement } from "react";
import { SUPPORT_CATEGORIES } from "@brandbasket/shared/lib/support";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { SelectField, type SelectOption } from "@brandbasket/shared/ui/select-field";
import { buttonPrimary } from "@/components/console/buttons";
import { LIFT } from "@/components/console/classes";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { STAFF_SUPPORT_CATEGORY_LABELS, STAFF_SUPPORT_INITIAL_STATE } from "@/lib/support-admin-state";
import { openRequestForClient } from "./actions";

const CATEGORY_OPTIONS: readonly SelectOption[] = SUPPORT_CATEGORIES.map((value) => ({ value, label: STAFF_SUPPORT_CATEGORY_LABELS[value] }));

interface NewRequestFormProps {
  readonly clients: readonly SelectOption[];
  /** A client chosen by the link that opened this page (a client page's Requests tab), or "". */
  readonly preselected: string;
  readonly submissionKey: string;
}

export function NewRequestForm({ clients, preselected, submissionKey }: NewRequestFormProps): ReactElement {
  const [state, action, pending] = useActionState(openRequestForClient, STAFF_SUPPORT_INITIAL_STATE);
  const describedBy = state.kind === "idle" ? undefined : "new-request-result";
  return (
    <form action={action} aria-busy={pending} className={`${LIFT} grid gap-5 p-5`}>
      <input type="hidden" name="submissionKey" value={submissionKey} />
      <div>
        <label htmlFor="request-client" className={labelClasses}>
          Client
          <RequiredMark />
        </label>
        <SelectField
          id="request-client"
          name="businessId"
          required
          options={[{ value: "", label: "Choose a client" }, ...clients]}
          defaultValue={preselected}
          searchable
          className={fieldClasses}
          aria-invalid={state.field === "businessId" ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>
      <div>
        <label htmlFor="request-category" className={labelClasses}>
          Category
          <RequiredMark />
        </label>
        <SelectField id="request-category" name="category" required options={CATEGORY_OPTIONS} defaultValue="website_change" className={fieldClasses} aria-describedby={describedBy} />
      </div>
      <div>
        <label htmlFor="request-subject" className={labelClasses}>
          Subject
          <RequiredMark />
        </label>
        <input id="request-subject" name="subject" required minLength={3} maxLength={120} className={fieldClasses} aria-invalid={state.field === "subject" ? true : undefined} aria-describedby={describedBy} />
      </div>
      <div>
        <label htmlFor="request-body" className={labelClasses}>
          What they asked for
          <RequiredMark />
        </label>
        <textarea id="request-body" name="body" required minLength={10} maxLength={5000} rows={6} className={fieldClasses} aria-invalid={state.field === "body" ? true : undefined} aria-describedby={describedBy} />
      </div>
      {state.kind === "idle" ? null : (
        <p id="new-request-result" role={state.kind === "saved" ? "status" : "alert"} className={`text-sm ${state.kind === "saved" ? "text-ink-2" : "text-error"}`}>
          {state.message}
        </p>
      )}
      <div>
        <GatedSubmitButton className={buttonPrimary}>{pending ? "Opening…" : "Open the request"}</GatedSubmitButton>
      </div>
    </form>
  );
}
