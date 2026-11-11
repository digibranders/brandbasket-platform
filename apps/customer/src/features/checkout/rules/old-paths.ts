/** Search params as a page receives them. */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * An old address's new home with its query carried over (plan 61, section 3: every old path keeps working). `/plan?services=a,b`
 * becomes `/checkout?services=a,b`; repeated parameters stay repeated.
 */
export function withQuery(path: string, params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const each of Array.isArray(value) ? value : [value]) query.append(key, each);
  }
  const text = query.toString().replaceAll("%2C", ",");
  return text === "" ? path : `${path}?${text}`;
}

/**
 * Where the old Check and send page goes. `?payment=received|failed` is Razorpay's live return for a website client's first
 * payment (and in emails), which now lands on the checkout; anything else is the setup checklist.
 */
export function onboardingReviewDestination(params: SearchParams): string {
  const payment = params.payment;
  return payment === "received" || payment === "failed" ? `/checkout?payment=${payment}` : "/checklist";
}
