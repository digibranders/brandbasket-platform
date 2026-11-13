import "server-only";

/** The paid conversion events (plan 59), from the conversions feature. Re-exported so payment code names one module. */
export { reportFirstPaymentToAds } from "@/features/conversions/server";
