/**
 * `from` plus `months` calendar months, in UTC. The day is clamped to the end of a shorter month, so a payment on
 * 31 January is paid through 28 or 29 February rather than rolling into March and handing out free days.
 */
export function addMonthsUtc(from: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`Months must be a whole, non-negative number, received ${months}`);
  }
  if (!Number.isFinite(from.getTime())) throw new RangeError("Cannot add months to an invalid date");

  const targetMonthIndex = from.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(from.getUTCFullYear(), targetMonthIndex + 1, 0)).getUTCDate();
  const result = new Date(from.getTime());
  result.setUTCDate(1);
  result.setUTCMonth(targetMonthIndex);
  result.setUTCDate(Math.min(from.getUTCDate(), lastDayOfTarget));
  return result;
}
