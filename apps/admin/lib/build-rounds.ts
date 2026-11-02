/** True when the customer has asked for more rounds of changes than the build includes. The dashboard now stops at the allowance, so this is only a build that went over before then. */
export function isPastIncludedRounds(granted: number, included: number): boolean {
  return granted > included;
}
