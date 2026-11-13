import { permanentRedirect } from "next/navigation";
import { withQuery, type SearchParams } from "@/features/checkout/rules/old-paths";

/** The old questions page: /start now, keeping `services` and `q`. */
export default async function PersonalizeRedirect({ searchParams }: { readonly searchParams: Promise<SearchParams> }): Promise<never> {
  permanentRedirect(withQuery("/start", await searchParams));
}
