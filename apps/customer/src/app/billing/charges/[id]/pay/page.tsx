import { notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";

/** The old charge pay page: /checkout/charges/<id> now. Only an id that could be a charge is carried over. */
export default async function ChargePayRedirect({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<never> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  permanentRedirect(`/checkout/charges/${id}`);
}
