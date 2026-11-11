import { redirect } from "next/navigation";
import { clientTabHrefWithQuery } from "@/lib/client-tabs";

/** The Delivery tab became the Website tab. Old links, with their notice query, land on the new address. */
export default async function LegacyProjectPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const { businessId } = await params;
  redirect(clientTabHrefWithQuery(businessId, "website", await searchParams));
}
