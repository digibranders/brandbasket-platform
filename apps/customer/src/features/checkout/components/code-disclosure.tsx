"use client";

import { MAX_REFERRAL_CODE_LENGTH } from "@brandbasket/billing/referral";
import { Field, Input } from "@/ui";

/*
 * "Have a code? (optional)" under the order summary (docs/design/checkout-one-screen.html). It has no Apply button and shows no
 * discount: the code is applied when Pay is pressed, and the checkout page that follows shows what it is worth. The field is
 * always in the form, open or not, so a typed code is sent whether or not the box is showing.
 */

interface CodeDisclosureProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Why the code was refused, shown under the field. */
  readonly error: string | undefined;
}

export function CodeDisclosure({ open, onOpenChange, error }: CodeDisclosureProps) {
  return (
    <details className="border-t border-border pt-3" open={open}>
      <summary
        className="cursor-pointer type-sub font-medium text-ink"
        onClick={(event) => {
          event.preventDefault();
          onOpenChange(!open);
        }}
      >
        Have a code? (optional)
      </summary>
      <div className="pt-3">
        <Field label="Code" name="referralCode" error={error}>
          <Input name="referralCode" maxLength={MAX_REFERRAL_CODE_LENGTH} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="e.g. FRIEND15" />
        </Field>
      </div>
    </details>
  );
}
