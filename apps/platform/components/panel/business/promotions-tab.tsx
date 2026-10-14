import type { ReactElement } from "react";
import { ArrowIcon } from "@firstfold/shared/ui/icons";
import { ButtonLink } from "@firstfold/shared/ui/panel/button";
import { brandText } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";

interface PromotionsTabProps {
  /** The Advertise page, where the homepage's promotions are run. */
  readonly advertiseHref: string;
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

/**
 * The Promotions tab (the sheet's Promotions & Engagement): offers, coupons, events and announcements are shown in the
 * promotions section of the Firstfold Local homepage, which is run from the Advertise page. This tab points there.
 */
export async function PromotionsTab({ advertiseHref, next }: PromotionsTabProps): Promise<ReactElement> {
  const brand = await requestBrand();
  return (
    <div className="mt-8 max-w-2xl">
      <p className="text-[0.9375rem]">{brandText("Offers, coupons, events and announcements go in the promotions section of the Firstfold Local homepage.", brand)}</p>
      <p className="mt-2 text-sm text-ink-soft">You run it from Advertise: pick what you are promoting and when.</p>
      <div className="mt-6">
        <ButtonLink href={advertiseHref} variant="secondary">
          Open Advertise
          <ArrowIcon className="size-4" />
        </ButtonLink>
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
