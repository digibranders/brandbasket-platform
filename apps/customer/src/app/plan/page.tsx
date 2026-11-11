import { permanentRedirect } from "next/navigation";
import { withQuery, type SearchParams } from "@/features/checkout/rules/old-paths";

/** The old plan page: /checkout now, keeping `services` and `payment` (Razorpay returns and emails still name /plan). */
export default async function PlanRedirect({ searchParams }: { readonly searchParams: Promise<SearchParams> }): Promise<never> {
  permanentRedirect(withQuery("/checkout", await searchParams));
}
