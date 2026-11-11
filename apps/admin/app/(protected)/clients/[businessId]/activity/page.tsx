import { redirect } from "next/navigation";
import { clientTabHrefWithQuery } from "@/lib/client-tabs";

/** The Activity tab became a fold on Messages. Old links land on the fold. */
export default async function LegacyActivityPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const { businessId } = await params;
  redirect(`${clientTabHrefWithQuery(businessId, "requests", await searchParams)}#activity`);
}
