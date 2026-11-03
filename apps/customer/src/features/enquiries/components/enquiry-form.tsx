"use client";

import { useActionState, useEffect } from "react";
import { STATUS_WORDS } from "@/components";
import { Banner, Button, Field, Select, Textarea, useToast } from "@/ui";
import { saveEnquiryAction } from "../actions";
import { NOTE_MAX, type EnquiryRow } from "../rules";

const STATUS_OPTIONS = (["new", "contacted", "won", "lost"] as const).map((value) => ({ value, label: STATUS_WORDS.enquiry[value].word }));

/** The status and the private note of one enquiry, saved by a guarded action. Shown to owners and editors only. */
export function EnquiryForm({ row }: { readonly row: EnquiryRow & { readonly status: "new" | "contacted" | "won" | "lost" } }) {
  const [state, action, pending] = useActionState(saveEnquiryAction, null);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok === true) toast("Enquiry updated");
  }, [state, toast]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={row.id} />
      {state?.ok === false ? <Banner tone="neg">{state.message}</Banner> : null}
      <Field label="Status" nativeLabel={false} {...(state?.ok === false && state.fieldErrors?.status !== undefined ? { error: state.fieldErrors.status } : {})}>
        <Select name="status" defaultValue={row.status} options={STATUS_OPTIONS} />
      </Field>
      <Field
        label="Private note"
        name="note"
        hint="Not shown to the enquirer."
        {...(state?.ok === false && state.fieldErrors?.note !== undefined ? { error: state.fieldErrors.note } : {})}
      >
        <Textarea name="note" defaultValue={row.note ?? ""} maxLength={NOTE_MAX} placeholder="Only you and your team can see this." />
      </Field>
      <div>
        <Button type="submit" variant="primary" pending={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
