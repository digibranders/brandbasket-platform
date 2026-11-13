import { permanentRedirect } from "next/navigation";
import { withQuery, type SearchParams } from "@/features/checkout/rules/old-paths";

/** The old Add-ons page (it went to /services) is the first tab of Plan & billing. `?charge=` (a paid add-on's return) and any other query come along. */
export default async function AddOnsRedirect({ searchParams }: { readonly searchParams: Promise<SearchParams> }): Promise<never> {
  permanentRedirect(withQuery("/billing", await searchParams));
}
