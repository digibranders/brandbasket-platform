/** An invoice number as issued: prefix, financial year and a six digit serial, such as FF/26-27/000001. */
const INVOICE_NUMBER = /FF\/\d{2}-\d{2}\/\d{6}/;

export interface TitlePart {
  readonly text: string;
  /** True for the invoice number, which must never break across lines: a narrow screen would split it at its hyphen. */
  readonly nowrap: boolean;
}

/**
 * A row title cut around its invoice number, so the number can be drawn on one line while the words around it wrap
 * as usual. The parts always join back into the title, which stays the string used for accessible names.
 */
export function splitInvoiceNumber(title: string): readonly TitlePart[] {
  if (title === "") return [];
  const match = INVOICE_NUMBER.exec(title);
  if (match === null) return [{ text: title, nowrap: false }];
  const before = title.slice(0, match.index);
  const after = title.slice(match.index + match[0].length);
  return [
    ...(before === "" ? [] : [{ text: before, nowrap: false }]),
    { text: match[0], nowrap: true },
    ...(after === "" ? [] : [{ text: after, nowrap: false }]),
  ];
}
