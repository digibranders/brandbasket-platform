import type { ReactElement } from "react";
import type { DirectoryProfile } from "@brandbasket/db";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { INPUT_CLASSES } from "@/components/panel/business/catalog-parts";
import { ItemForm } from "@/components/panel/business/item-form";
import { LICENCE_MAX_LENGTH, LICENCES_MAX, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/business-profile-fields";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";
import type { ItemFormState } from "@/lib/item-form-state";

interface TrustTabProps {
  /** The saved profile; null before the Identity is saved. */
  readonly profile: DirectoryProfile | null;
  readonly canChange: boolean;
  readonly saveAction: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

/** The Trust tab (the sheet's Trust & Business Information): licences and certifications, and how the business takes payment. */
export function TrustTab({ profile, canChange, saveAction, next }: TrustTabProps): ReactElement {
  if (profile === null) {
    return (
      <div className="mt-8 max-w-2xl space-y-4">
        <p className="text-sm text-ink-soft">Fill in your Identity first, then add your licences and payment methods.</p>
        <ButtonLink href={profileHref("details")} variant="secondary" size="sm">
          Go to Identity
        </ButtonLink>
      </div>
    );
  }
  const paid = new Set<string>(profile.paymentMethods);
  return (
    <div className="mt-8 max-w-2xl">
      <ItemForm action={saveAction} submitLabel="Save">
        <fieldset disabled={!canChange} className="space-y-10">
          <section aria-labelledby="trust-licences-title">
            <h2 id="trust-licences-title" className="panel-section">
              Licences and certifications
            </h2>
            <label htmlFor="trust-licences" className="mt-1 block text-sm text-ink-soft">
              One per line, up to {LICENCES_MAX}, like &ldquo;Dental Council reg. 12345&rdquo;.
            </label>
            <textarea
              id="trust-licences"
              name="licences"
              rows={5}
              defaultValue={profile.licences.join("\n")}
              aria-describedby="trust-licences-limit"
              className={`${INPUT_CLASSES} resize-y`}
            />
            <p id="trust-licences-limit" className="mt-2 text-sm text-ink-soft">
              Up to {LICENCE_MAX_LENGTH} characters a line.
            </p>
          </section>

          <section aria-labelledby="trust-payment-title" className="border-t border-line pt-8">
            <h2 id="trust-payment-title" className="panel-section">
              Payment methods
            </h2>
            <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {PAYMENT_METHODS.map((method) => (
                <label key={method} className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" name="payment" value={method} defaultChecked={paid.has(method)} className="size-4 accent-accent" />
                  <span className="text-[0.9375rem]">{PAYMENT_METHOD_LABELS[method]}</span>
                </label>
              ))}
            </div>
          </section>
        </fieldset>
      </ItemForm>

      {next === null ? null : (
        <div className="mt-12">
          <ButtonLink href={profileHref(next.id)} variant="secondary">
            Next: {next.label}
            <ArrowIcon className="size-4" />
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
