import type { ReactElement } from "react";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { useFreeAddressAction } from "@/app/(protected)/clients/[businessId]/actions";
import { buttonPrimary } from "@/components/console/buttons";

/** Gives a business with no domain of its own a free address, so its build can go live. */
export function FreeAddressForm({ businessId }: { readonly businessId: string }): ReactElement {
  return (
    <form action={useFreeAddressAction}>
      <p className="max-w-xl text-ink-soft">They have no website address yet. This gives them a free one so you can go live.</p>
      <input type="hidden" name="businessId" value={businessId} />
      <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Setting up…">
        Use their free address
      </GatedSubmitButton>
    </form>
  );
}
