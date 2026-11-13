import { headers } from "next/headers";
import { slugify } from "@brandbasket/db";
import { clientSiteBaseDomain, isTemporarySubdomain, suggestSubdomainName } from "@brandbasket/shared/lib/onboarding/domain-form";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { savedPhoneStart, visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import type { CustomerContext } from "@/lib/guards";
import type { ChecklistState } from "../loader";
import { definitionOf, VIEWER_MESSAGE, type ChecklistKey } from "../rules-items";
import { ONBOARDING_LOCKED_MESSAGE, type OnboardingSnapshot } from "../rules-snapshot";
import { setupFieldsFor, SETUP_SERVICE } from "../setup-rules";
import { BrandForm } from "./brand-form";
import { BusinessForm } from "./business-form";
import { DomainForm } from "./domain-form";
import { SetupForm } from "./setup-form";
import { ServicesForm } from "./services-form";

/** Why an item cannot be changed: the project has left onboarding, or the person is a viewer. Null when they may save. */
function readOnlyReasonFor(snapshot: OnboardingSnapshot | null, customer: CustomerContext): string | null {
  if (snapshot?.locked === true) return ONBOARDING_LOCKED_MESSAGE;
  return customer.role === "viewer" ? VIEWER_MESSAGE : null;
}

function imageOf(asset: OnboardingSnapshot["photos"][number]) {
  return { id: asset.id, width: asset.width, height: asset.height, altText: asset.altText, originalFilename: asset.originalFilename };
}

/** The sheet for one item, drawn from what is stored. Server only: it reads the visitor's country and the phone list. */
export async function ItemView({ itemKey, state, customer }: { readonly itemKey: ChecklistKey; readonly state: ChecklistState; readonly customer: CustomerContext }) {
  const { snapshot } = state;
  const item = definitionOf(itemKey);

  if (item.setup !== null) {
    const service = SETUP_SERVICE[item.setup];
    const saved = state.answers[service];
    const fields = setupFieldsFor(item.setup, customer.currency);
    const values = Object.fromEntries(fields.map((field) => [field.name, String(saved?.[field.name] ?? "")]));
    return (
      <SetupForm
        itemKey={item.setup}
        title={item.label}
        fields={fields}
        values={values}
        readOnlyReason={customer.role === "viewer" ? VIEWER_MESSAGE : null}
      />
    );
  }
  if (snapshot === null) return null;
  const readOnlyReason = readOnlyReasonFor(snapshot, customer);

  switch (itemKey) {
    case "business": {
      const profile = snapshot.profile;
      const phone = savedPhoneStart(profile?.phone ?? null);
      const countries = phoneCountryOptions().map((country) => ({ value: country.code, label: `${country.name} (${country.dialCode})` }));
      return (
        <BusinessForm
          values={{
            displayName: profile?.displayName ?? customer.businessName,
            tagline: profile?.tagline ?? "",
            description: profile?.description ?? "",
            email: profile?.email ?? "",
            addressLine1: profile?.addressLine1 ?? "",
            addressLine2: profile?.addressLine2 ?? "",
            city: profile?.city ?? "",
            region: profile?.region ?? "",
            postalCode: profile?.postalCode ?? "",
            country: profile?.country ?? "",
            serviceAreas: profile?.serviceAreas ?? "",
            googleBusinessUrl: profile?.googleBusinessUrl ?? "",
          }}
          phone={{ country: phone.country ?? visitorPhoneCountry(await headers()), number: phone.number }}
          countries={countries}
          hours={snapshot.hours}
          readOnlyReason={readOnlyReason}
        />
      );
    }
    case "services":
      return (
        <ServicesForm
          services={snapshot.services.map((service) => ({ id: service.id, name: service.name, summary: service.summary ?? "", price: service.priceText ?? "" }))}
          notesForBuilder={snapshot.brief?.notesForBuilder ?? ""}
          styleLikes={snapshot.brief?.styleLikes ?? ""}
          referenceUrls={snapshot.brief?.referenceUrls ?? []}
          readOnlyReason={readOnlyReason}
        />
      );
    case "brand":
      return <BrandForm logo={snapshot.logo === null ? null : imageOf(snapshot.logo)} photos={snapshot.photos.map(imageOf)} readOnlyReason={readOnlyReason} />;
    case "domain": {
      const hostname = snapshot.domain?.hostname ?? null;
      const onFreeAddress = hostname !== null && isTemporarySubdomain(hostname);
      return (
        <DomainForm
          hostname={hostname}
          // Not offered when the deployment names no base domain, or they are on a free address already.
          baseDomain={onFreeAddress ? null : clientSiteBaseDomain()}
          onFreeAddress={onFreeAddress}
          suggestedName={suggestSubdomainName(slugify(customer.businessName))}
          readOnlyReason={readOnlyReason}
        />
      );
    }
    default:
      return null;
  }
}
