import { permanentRedirect } from "next/navigation";

/** The old Razorpay pay page (RAZORPAY_PAY_PATH, the checkoutUrl of every Razorpay checkout): /checkout/pay now. */
export default function BillingPayRedirect(): never {
  permanentRedirect("/checkout/pay");
}
