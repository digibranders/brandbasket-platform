/** The heading over Check and send once the payment is in: it counts what the checklist still lacks. */
export function sentHeading(missingCount: number): string {
  if (missingCount === 0) return "Payment received";
  const lacking = missingCount === 1 ? "one thing is" : `${missingCount} things are`;
  return `Payment received, ${lacking} missing before we can start`;
}
