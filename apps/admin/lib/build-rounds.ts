/** True when the customer has asked for more rounds of changes than the build's plan includes. Display only. */
export function isPastIncludedRounds(granted: number, included: number): boolean {
  return granted > included;
}
