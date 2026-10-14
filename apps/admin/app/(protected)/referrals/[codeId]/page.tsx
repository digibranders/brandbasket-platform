import { redirect } from "next/navigation";

/** A code's old address. Every code, coupon or affiliate's, now lives under /coupons. */
export default async function ReferralCodePage({
  params,
}: {
  readonly params: Promise<{ readonly codeId: string }>;
}): Promise<never> {
  const { codeId } = await params;
  redirect(`/coupons/${encodeURIComponent(codeId)}`);
}
