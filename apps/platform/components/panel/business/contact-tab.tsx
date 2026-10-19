import type { ReactElement } from "react";
import type { DirectoryProfile } from "@brandbasket/db";
import { ArrowIcon } from "@brandbasket/shared/ui/icons";
import { ButtonLink } from "@brandbasket/shared/ui/panel/button";
import { ItemForm } from "@/components/panel/business/item-form";
import { CONTACT_OPTION_LABELS, CONTACT_OPTION_NEEDS, CONTACT_OPTIONS, type ContactOption } from "@/lib/business-profile-fields";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";
import type { ItemFormState } from "@/lib/item-form-state";

interface ContactTabProps {
  /** The saved profile; null before the Identity is saved. */
  readonly profile: DirectoryProfile | null;
  readonly canChange: boolean;
  readonly saveAction: (state: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

/** Whether the profile has what a button needs; buttons that need nothing are always ready. */
function isReady(option: ContactOption, profile: DirectoryProfile): boolean {
  switch (option) {
    case "whatsapp":
      return profile.whatsapp !== null;
    case "directions":
      return profile.mapsUrl !== null;
    case "website":
      return profile.websiteUrl !== null;
    default:
      return true;
  }
}

/**
 * The Contact options tab (the sheet's Customer Conversion): which buttons visitors get on the business's page. A
 * button that needs something from Identity (a WhatsApp number, a Maps link, a website) says so while it is missing.
 */
export function ContactTab({ profile, canChange, saveAction, next }: ContactTabProps): ReactElement {
  if (profile === null) {
    return (
      <div className="mt-8 max-w-2xl space-y-4">
        <p className="text-sm text-ink-soft">Fill in your Identity first, then choose how visitors reach you.</p>
        <ButtonLink href={profileHref("details")} variant="secondary" size="sm">
          Go to Identity
        </ButtonLink>
      </div>
    );
  }
  const chosen = new Set<string>(profile.contactOptions);
  return (
    <div className="mt-8 max-w-2xl">
      <p className="text-sm text-ink-soft">Choose the buttons visitors see on your page.</p>
      <div className="mt-6">
        <ItemForm action={saveAction} submitLabel="Save">
          <fieldset disabled={!canChange} className="divide-y divide-line border-y border-line">
            <legend className="sr-only">Buttons on your page</legend>
            {CONTACT_OPTIONS.map((option) => {
              const need = CONTACT_OPTION_NEEDS[option];
              const missing = !isReady(option, profile);
              return (
                <label key={option} className="flex cursor-pointer items-start gap-3 py-4">
                  <input type="checkbox" name="option" value={option} defaultChecked={chosen.has(option)} className="mt-1 size-4 accent-accent" />
                  <span>
                    <span className="block text-[0.9375rem] font-medium">{CONTACT_OPTION_LABELS[option]}</span>
                    {missing && need !== null ? <span className="mt-0.5 block text-sm text-ink-soft">{need}</span> : null}
                  </span>
                </label>
              );
            })}
          </fieldset>
        </ItemForm>
      </div>

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
