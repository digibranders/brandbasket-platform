"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Checkbox, Input, Radio, RadioGroup } from "@/ui";
import { chooseFreeAddressAction, saveDomainItem } from "../actions";
import { FormField, ItemForm } from "./item-form";

export interface DomainFormProps {
  /** The saved address, if any. */
  readonly hostname: string | null;
  /** The domain free addresses are made on; null when none is offered (the deployment has none, or they are on a free address already). */
  readonly baseDomain: string | null;
  /** The saved address is a free one, not a domain of their own: the domain box starts empty. */
  readonly onFreeAddress: boolean;
  /** The name to offer first for a free address, or "". */
  readonly suggestedName: string;
  readonly readOnlyReason: string | null;
}

type Mode = "own" | "free";

/** Your web address: a domain the customer owns, or a free address to start on. Either one marks the item done. */
export function DomainForm({ hostname, baseDomain, onFreeAddress, suggestedName, readOnlyReason }: DomainFormProps) {
  const [mode, setMode] = useState<Mode>("own");
  const action = (formData: FormData): Promise<ActionResult> => (mode === "free" ? chooseFreeAddressAction(formData) : saveDomainItem(formData));
  const readOnly = readOnlyReason !== null;

  return (
    <ItemForm title="Your web address" action={action} readOnly={readOnly} {...(readOnly ? { readOnlyReason } : {})}>
      {baseDomain === null ? null : (
        <RadioGroup aria-label="Which address" value={mode} onValueChange={(next) => setMode(next === "free" ? "free" : "own")}>
          <Radio value="own" label="I have a domain" />
          <Radio value="free" label="Start with a free address" />
        </RadioGroup>
      )}
      {mode === "own" ? (
        <>
          <FormField name="domain" label="Your domain" hint="For example yourbusiness.com">
            <Input name="domain" defaultValue={onFreeAddress ? "" : (hostname ?? "")} autoComplete="off" />
          </FormField>
          <Checkbox name="ownerConfirmed" label="This domain is mine" defaultChecked={!onFreeAddress && hostname !== null} />
        </>
      ) : (
        <FormField name="name" label="Choose a name" hint={`Your address will be name.${baseDomain ?? ""}. You can move to your own domain later.`}>
          <Input name="name" defaultValue={suggestedName} autoComplete="off" />
        </FormField>
      )}
    </ItemForm>
  );
}
