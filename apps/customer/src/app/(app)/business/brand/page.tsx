import type { Metadata } from "next";
import { BrandKit } from "@/features/business/components/brand-kit";
import { BusinessHeader } from "@/features/business/components/business-header";
import { loadBrand } from "@/features/business/loader";
import { Panel, PanelError } from "@/components";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Brand kit" };

/** Business profile, Brand kit tab: the logo and photos. A failed read is an error panel, never an empty library. */
export default async function BrandPage() {
  const customer = await requirePaid();
  const brand = await loadBrand(customer);
  return (
    <>
      <BusinessHeader current="/business/brand" />
      {brand.ok ? (
        <BrandKit logo={brand.data.logo} photos={brand.data.photos} readOnly={customer.role === "viewer"} />
      ) : (
        <Panel title="Logo and photos">
          <PanelError failure={brand.error} what="your logo and photos" />
        </Panel>
      )}
    </>
  );
}
