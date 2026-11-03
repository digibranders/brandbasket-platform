"use client";

import { useActionState, useState } from "react";
import { Banner, Button, Checkbox, Field, Input } from "@/ui";
import { requestOwnDomainAction } from "../actions";

/** "I’ve got my own domain": the name and the ownership box. Ported from apps/platform components/panel/move-domain-form.tsx. */
export function MoveDomainForm() {
  const [state, send, pending] = useActionState(requestOwnDomainAction, null);
  const [domain, setDomain] = useState("");
  const failure = state !== null && !state.ok ? state : null;
  const domainError = failure?.fieldErrors?.domain;
  const ownerError = failure?.fieldErrors?.ownerConfirmed;
  return (
    <form action={send} noValidate className="flex max-w-reading flex-col gap-4">
      <Field label="Your domain" name="domain" hint="Paste it however you have it. We only need the name, for example yourbusiness.com." {...(domainError === undefined ? {} : { error: domainError })}>
        <Input
          name="domain"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          autoCapitalize="none"
          maxLength={300}
          required
          placeholder="yourbusiness.com"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
        />
      </Field>
      <div>
        <Checkbox name="ownerConfirmed" value="on" required label="I own this domain, or I can get into the account it’s registered with." />
        {ownerError === undefined ? null : <p className="mt-1 type-meta text-neg-text">{ownerError}</p>}
      </div>
      {failure !== null && domainError === undefined && ownerError === undefined ? <Banner tone="neg">{failure.message}</Banner> : null}
      <div>
        <Button type="submit" variant="primary" pending={pending}>
          Send to our team
        </Button>
      </div>
    </form>
  );
}
