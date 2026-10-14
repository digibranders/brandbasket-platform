import { BillingRangeError } from "./billing-range-error";

/** Spells an invoice total in words, as Rule 46 invoices print it. Indian grouping: crore, lakh, thousand. */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const ones = n % 10;
  return `${TENS[Math.floor(n / 10)] ?? ""}${ones ? ` ${ONES[ones] ?? ""}` : ""}`;
}

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds ? `${ONES[hundreds] ?? ""} Hundred` : "";
  return [head, rest ? below100(rest) : ""].filter(Boolean).join(" ");
}

function rupeeWords(rupees: number): string {
  if (rupees === 0) return "Zero";
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const rest = rupees % 1_000;
  return [
    crore ? `${rupeeWords(crore)} Crore` : "",
    lakh ? `${below100(lakh)} Lakh` : "",
    thousand ? `${below100(thousand)} Thousand` : "",
    rest ? below1000(rest) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * "Indian Rupees Six Thousand Six Hundred Seven and Six Paise Only", from whole paise. Crores keep counting past 99,
 * so a very large total reads "One Thousand Two Hundred Thirty Four Crore". Throws BillingRangeError for anything that is
 * not a whole, non-negative number of paise.
 */
export function amountInWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new BillingRangeError(`Not an amount in paise: ${paise}`);
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `Indian Rupees ${rupeeWords(rupees)}${rest ? ` and ${below100(rest)} Paise` : ""} Only`;
}
