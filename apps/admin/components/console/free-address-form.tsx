import type { ReactElement } from "react";
import { SUBDOMAIN_NAME_MAX } from "@brandbasket/shared/lib/onboarding/domain-form";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { changeFreeAddressAction, useFreeAddressAction } from "@/app/(protected)/clients/[businessId]/actions";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";

interface FreeAddressFormProps {
  readonly businessId: string;
  /** The domain free addresses are made on (CLIENT_SITE_BASE_DOMAIN). */
  readonly baseDomain: string;
}

interface ChangeFreeAddressFormProps extends FreeAddressFormProps {
  /** The name in front of the base domain now, which the box starts with. */
  readonly currentName: string;
}

/** The name box, with the base domain beside it so staff see the whole address they are choosing. */
function AddressNameField({ id, baseDomain, defaultValue }: { readonly id: string; readonly baseDomain: string; readonly defaultValue: string }): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <input
        id={id}
        name="name"
        type="text"
        required
        defaultValue={defaultValue}
        maxLength={SUBDOMAIN_NAME_MAX}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="business-name"
        className={`${fieldClasses} min-w-0 flex-1 basis-48 sm:max-w-xs`}
      />
      <span className="mt-2 text-base text-ink-soft">.{baseDomain}</span>
    </div>
  );
}

/** Gives a business with no domain of its own a free address, named by staff, so its build can go live. */
export function FreeAddressForm({ businessId, baseDomain }: FreeAddressFormProps): ReactElement {
  return (
    <form action={useFreeAddressAction} className="max-w-xl">
      <input type="hidden" name="businessId" value={businessId} />
      <p className="text-ink-soft">They have no website address yet. Choose a free one so you can go live.</p>
      <label htmlFor="free-address-name" className={`${labelClasses} mt-5`}>
        Free address
      </label>
      <AddressNameField id="free-address-name" baseDomain={baseDomain} defaultValue="" />
      <p className={hintClasses}>Letters, numbers and single hyphens. It can be changed until the website is live.</p>
      <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Saving…">
        Use this address
      </GatedSubmitButton>
    </form>
  );
}

/** Changes a free address that is already saved, while the website is not live on it. */
export function ChangeFreeAddressForm({ businessId, baseDomain, currentName }: ChangeFreeAddressFormProps): ReactElement {
  return (
    <form action={changeFreeAddressAction} className="mt-6 max-w-xl">
      <input type="hidden" name="businessId" value={businessId} />
      <label htmlFor="change-address-name" className={labelClasses}>
        Change address
      </label>
      <AddressNameField id="change-address-name" baseDomain={baseDomain} defaultValue={currentName} />
      <GatedSubmitButton className={`${buttonSecondary} mt-4`} pendingLabel="Saving…">
        Save address
      </GatedSubmitButton>
    </form>
  );
}
