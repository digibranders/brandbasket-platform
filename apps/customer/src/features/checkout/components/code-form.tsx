"use client";

import { MAX_REFERRAL_CODE_LENGTH } from "@brandbasket/billing/referral";
import { useActionState } from "react";
import { Banner, Button, Field, Input } from "@/ui";
import { applyCodeAction, removeCodeAction } from "../actions";

/*
 * "Have a code?" before paying, ported from apps/platform components/panel/referral-code-form.tsx. Applying one is its own
 * step, so the Pay button beside it shows the discounted price. Nothing here decides anything: the server validates the code
 * and works out what it is worth.
 */

interface CodeFormProps {
  /** The basket the page shows, posted so the code is priced against it. */
  readonly services: readonly string[];
  readonly code: { readonly code: string; readonly worth: string | null } | null;
  /** A code applied earlier that has since stopped working, so the form says why the full price applies. */
  readonly lapsedCode: string | null;
}

export function CodeForm({ services, code, lapsedCode }: CodeFormProps) {
  return code === null ? <ApplyCode services={services} lapsedCode={lapsedCode} /> : <RemoveCode code={code} />;
}

function ApplyCode({ services, lapsedCode }: { readonly services: readonly string[]; readonly lapsedCode: string | null }) {
  const [state, action, pending] = useActionState(applyCodeAction, null);
  const error = state !== null && !state.ok && !pending ? state : null;
  return (
    <form action={action} className="flex flex-col gap-3">
      {lapsedCode === null ? null : (
        <Banner tone="info">
          Code <span className="type-mono">{lapsedCode}</span> can’t be used any more, so the full price applies. You can try another code.
        </Banner>
      )}
      {services.map((service) => (
        <input key={service} type="hidden" name="service" value={service} />
      ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Code" name="referralCode" error={error?.fieldErrors?.referralCode} className="flex-1">
          <Input name="referralCode" maxLength={MAX_REFERRAL_CODE_LENGTH} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="e.g. FRIEND15" required />
        </Field>
        <Button type="submit" size="md" pending={pending}>
          Apply
        </Button>
      </div>
      {error !== null && error.fieldErrors?.referralCode === undefined ? <Banner tone="neg">{error.message}</Banner> : null}
    </form>
  );
}

function RemoveCode({ code }: { readonly code: { readonly code: string; readonly worth: string | null } }) {
  const [state, action, pending] = useActionState(removeCodeAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Banner
        tone="pos"
        action={
          <Button type="submit" variant="ghost" size="sm" pending={pending}>
            Remove
          </Button>
        }
      >
        Code <span className="type-mono">{code.code}</span> applied{code.worth === null ? "." : `. ${code.worth}.`}
      </Banner>
      {state !== null && !state.ok && !pending ? <Banner tone="neg">{state.message}</Banner> : null}
    </form>
  );
}
