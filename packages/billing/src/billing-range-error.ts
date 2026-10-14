/**
 * A RangeError from the invoice maths: an amount, count, rate or date that cannot be invoiced. Its messages hold
 * numbers and fixed wording only, never text a person typed, so billing logs may print them (see describeError in
 * @firstfold/shared). A subclass, so code that catches RangeError still catches it.
 */
export class BillingRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "BillingRangeError";
  }
}
