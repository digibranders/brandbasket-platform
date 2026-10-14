import { redirect } from "next/navigation";

/** Referral codes became coupons and affiliates (2026-10-06); old links land on the coupons. */
export default function ReferralsPage(): never {
  redirect("/coupons");
}
