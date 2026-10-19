import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { amountInWords } from "@brandbasket/billing/amount-in-words";
import { gstStateCodeOf } from "@brandbasket/billing/gst-states";
import type { TaxInvoice, TaxInvoiceLineRecord, TaxInvoicePartyRecord } from "@brandbasket/db";
import { stateName } from "@brandbasket/db/india-states";
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { deploymentBrandName } from "../lib/deployment-brand";
import { businessDetails } from "../lib/site-config";
import { BRANDBASKET_LETTERHEAD } from "./brandbasket-letterhead";
import { HANKEN_BOLD, HANKEN_REGULAR, HANKEN_SEMIBOLD, RUPEE_ADVANCE, RUPEE_PATH, RUPEE_UNITS_PER_EM } from "./tax-invoice-fonts.generated";

/**
 * Tax invoices as A4 PDFs in the approved design (invoice-design/invoice-template.html and the CA samples), drawn from
 * the stored snapshot only, so a PDF made years later says exactly what the invoice said when it was issued (D2, D10).
 * Positions are the template's CSS converted to points (1 mm = 2.8346 pt) and checked against the samples PDF.
 */

const MM = 2.8346;
const PAGE = { width: 595.28, height: 841.89 } as const;
const LEFT = 14 * MM;
const RIGHT = PAGE.width - 14 * MM;
const TOP = PAGE.height - 13 * MM;
const BOTTOM = 11 * MM;
/** Every rule in the template is a 1 px border: 0.75 pt. */
const HAIRLINE = 0.75;
/** The declaration and the footer line: 8 pt in the template, 7.95 pt where the browser's PDF measures. */
const FINE_PRINT = 7.95;
/** The shared right-hand column (74 mm): Amount paid, Billed to and the totals all start here. */
const RIGHT_COLUMN = RIGHT - 74 * MM;
/** The facts row's three columns: the template's grid of 1.3fr 1fr 1.2fr with 4 mm gaps, left of the right column. */
const FACT_FR = (RIGHT_COLUMN - LEFT - 8 * MM) / 3.5;
const FACT_COLUMNS = [LEFT, LEFT + 1.3 * FACT_FR + 4 * MM, LEFT + 2.3 * FACT_FR + 8 * MM] as const;
/** Where the declaration starts: nothing else may be drawn below this line. */
const FOOTER_TOP = BOTTOM + 86;

const INK = rgb(0x2a / 255, 0x0d / 255, 0x10 / 255);
const INK_SOFT = rgb(0x5e / 255, 0x3a / 255, 0x40 / 255);
const ACCENT = rgb(0x63 / 255, 0x00 / 255, 0x1e / 255);
const RULE = rgb(0xe2 / 255, 0xd2 / 255, 0xc1 / 255);
const TINT = rgb(0xfa / 255, 0xf5 / 255, 0xef / 255);

/** Gate 5: the CA confirms this wording. */
export const DECLARATION_LINES = [
  "Tax is not payable on reverse charge.",
  "The subscription renews monthly until cancelled. A refund is issued against a credit note that quotes this invoice number.",
  "This is a computer generated invoice and does not need a signature.",
] as const;

interface Fonts {
  readonly regular: PDFFont;
  readonly semibold: PDFFont;
  readonly bold: PDFFont;
}

type Align = "left" | "right";

const AMOUNT = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// en-US parts put together by hand: en-GB writes September as "Sept", and the template writes "Sep".
const DATE_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/** 660706 paise as "6,607.06", grouped the Indian way (1,23,456.00). */
function money(cents: number): string {
  return AMOUNT.format(cents / 100);
}

/** "2026-10-09" as "09 Oct 2026". The stored dates are already Indian calendar dates. */
function longDate(isoDate: string): string {
  const parts = Object.fromEntries(DATE_PARTS.formatToParts(new Date(`${isoDate}T00:00:00Z`)).map((part) => [part.type, part.value]));
  return `${parts.day ?? ""} ${parts.month ?? ""} ${parts.year ?? ""}`;
}

/** "Maharashtra (27)": the place of supply as Rule 46 asks for it, the state's name and its GST code. */
function stateWithCode(stateCode: string): string {
  return `${stateName(stateCode) ?? stateCode} (${gstStateCodeOf(stateCode)})`;
}

/** 1800 basis points as "18", 900 as "9", 1250 as "12.5". */
function percent(basisPoints: number): string {
  const hundredths = basisPoints % 100;
  const whole = Math.floor(basisPoints / 100);
  return hundredths === 0 ? String(whole) : `${whole}.${String(hundredths).padStart(2, "0").replace(/0$/, "")}`;
}

/**
 * Text the font can draw. Billing details are printable ASCII only (parseBillingDetails), but a business name from
 * onboarding or a charge description staff typed may hold anything; a character the font lacks prints as "?" rather
 * than as an empty box.
 */
function printable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && supported.has(codePoint) ? character : "?";
  }).join("");
}

/** Draws one line of text and returns its width. `x` is the right edge when `align` is "right". */
function text(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, color: RGB = INK, align: Align = "left"): number {
  const safe = printable(value, font);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: align === "right" ? x - width : x, y, size, font, color });
  return width;
}

/**
 * Letter-spaced capitals (the template's labels), drawn one character at a time, `tracking` in em. A browser adds the
 * spacing after the last letter too, so right-aligned text ends one spacing before `x`. Returns the width of the ink.
 */
function spaced(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, tracking: number, color: RGB, align: Align = "left"): number {
  const characters = Array.from(value.toUpperCase());
  const gap = size * tracking;
  const width = characters.reduce((sum, character) => sum + font.widthOfTextAtSize(character, size) + gap, -gap);
  let cursor = align === "right" ? x - width - gap : x;
  for (const character of characters) {
    page.drawText(character, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(character, size) + gap;
  }
  return width;
}

function label(page: PDFPage, value: string, x: number, y: number, fonts: Fonts, align: Align = "left"): number {
  return spaced(page, value, x, y, fonts.semibold, 7.4, 0.08, INK_SOFT, align);
}

/**
 * Breaks text into lines no wider than `maxWidth`: on spaces, and inside a word only when the word alone is too wide
 * (a long legal name or a reference with no spaces), so nothing ever runs past its column.
 */
function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of printable(value, font).split(/\s+/).filter((part) => part !== "")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== "") lines.push(current);
    let rest = word;
    while (rest.length > 1 && font.widthOfTextAtSize(rest, size) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current !== "") lines.push(current);
  return lines;
}

/** "₹6,607.06" with its right edge at x: the figure in Hanken Grotesk, the sign as a vector path from Noto Sans. */
function rupees(page: PDFPage, cents: number, x: number, y: number, font: PDFFont, size: number, color: RGB = ACCENT): void {
  const figure = money(cents);
  const figureWidth = font.widthOfTextAtSize(figure, size);
  const scale = size / RUPEE_UNITS_PER_EM;
  page.drawText(figure, { x: x - figureWidth, y, size, font, color });
  page.drawSvgPath(RUPEE_PATH, { x: x - figureWidth - RUPEE_ADVANCE * scale, y, scale, color });
}

/** A clickable area over text already drawn: `mailto:` or a web address. */
function link(doc: PDFDocument, page: PDFPage, uri: string, x: number, y: number, width: number, size: number): void {
  const annotation = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y - size * 0.25, x + width, y + size],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(uri) },
    }),
  );
  page.node.addAnnot(annotation);
}

/** A rectangle with rounded corners as SVG path data, its top-left corner at the origin (drawSvgPath's y runs down). */
function roundedRect(width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return `M${r} 0H${width - r}Q${width} 0 ${width} ${r}V${height - r}Q${width} ${height} ${width - r} ${height}H${r}Q0 ${height} 0 ${height - r}V${r}Q0 0 ${r} 0Z`;
}

/** A "#rrggbb" colour as pdf-lib wants it. */
function hexColor(hex: string): ReturnType<typeof rgb> {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`Not a #rrggbb colour: ${hex}`);
  return rgb(Number.parseInt(match[1] ?? "0", 16) / 255, Number.parseInt(match[2] ?? "0", 16) / 255, Number.parseInt(match[3] ?? "0", 16) / 255);
}

/** The letterhead: the wordmark on the left, "TAX INVOICE" on the right, both resting on one line. Returns the y below. */
function header(page: PDFPage, fonts: Fonts, continued: boolean, options: TaxInvoiceRenderOptions): number {
  const logoHeight = 9.5 * MM;
  const headBottom = TOP - 34;
  const letterhead = options.letterhead ?? BRANDBASKET_LETTERHEAD;
  const scale = logoHeight / letterhead.height;
  const color = hexColor(letterhead.colorHex);
  for (const path of letterhead.paths) page.drawSvgPath(path, { x: LEFT, y: headBottom + logoHeight, scale, color });
  spaced(page, "Tax invoice", RIGHT, TOP - 15.5, fonts.bold, 19, 0.04, ACCENT, "right");
  spaced(page, continued ? "Continued" : "Original for recipient", RIGHT, TOP - 31, fonts.regular, 7.6, 0.1, INK_SOFT, "right");
  return headBottom - 6 * MM - 1;
}

/** Invoice number, date and place of supply, with the amount paid in the tinted right column. Returns the y below. */
function facts(page: PDFPage, invoice: TaxInvoice, top: number, fonts: Fonts): number {
  const height = 63.9;
  page.drawRectangle({ x: RIGHT_COLUMN, y: top - height, width: RIGHT - RIGHT_COLUMN, height, color: TINT });
  page.drawLine({ start: { x: RIGHT_COLUMN, y: top }, end: { x: RIGHT_COLUMN, y: top - height }, thickness: HAIRLINE, color: RULE });
  page.drawLine({ start: { x: LEFT, y: top }, end: { x: RIGHT, y: top }, thickness: HAIRLINE, color: ACCENT });
  page.drawLine({ start: { x: LEFT, y: top - height }, end: { x: RIGHT, y: top - height }, thickness: HAIRLINE, color: RULE });
  const entries = [
    ["Invoice number", invoice.number],
    ["Invoice date", longDate(invoice.issuedOn)],
    ["Place of supply", stateWithCode(invoice.placeOfSupplyStateCode)],
  ] as const;
  entries.forEach(([name, value], index) => {
    const x = FACT_COLUMNS[index] ?? LEFT;
    label(page, name, x, top - 16, fonts);
    text(page, value, x, top - 31.7, fonts.semibold, 9.6);
  });

  const inner = RIGHT - 3 * MM;
  const badgeText = "PAID";
  const badgeTracking = 7 * 0.12;
  // Browsers also space out after the last letter, so the template's badge is one tracking wider than the ink.
  const badgeTextWidth = Array.from(badgeText).reduce((sum, character) => sum + fonts.bold.widthOfTextAtSize(character, 7) + badgeTracking, 0);
  const badge = { width: badgeTextWidth + 3.6 * MM, height: 12.7, border: 0.75 };
  const badgeLeft = inner - 0.5 - badge.width;
  // The stroke is centred on the path, so the path is drawn half a border inside the badge's outer edge.
  page.drawSvgPath(roundedRect(badge.width - badge.border, badge.height - badge.border, 1 * MM), {
    x: badgeLeft + badge.border / 2,
    y: top - 8.6 - badge.border / 2,
    borderColor: ACCENT,
    borderWidth: badge.border,
  });
  spaced(page, badgeText, badgeLeft + 1.8 * MM, top - 16.7, fonts.bold, 7, 0.12, ACCENT);
  label(page, "Amount paid", badgeLeft - 6.3, top - 17.6, fonts, "right");
  rupees(page, invoice.totalCents, inner, top - 37.4, fonts.bold, 15);
  // "Visa credit card ending 4366, 09 Oct 2026", or just the date when a long bank reference would not fit the column.
  const via = `${invoice.paymentLabel}, ${longDate(invoice.paidOn)}`;
  const viaWidth = fonts.regular.widthOfTextAtSize(printable(via, fonts.regular), 7.8);
  text(page, viaWidth <= inner - RIGHT_COLUMN - 5 * MM ? via : `Paid ${longDate(invoice.paidOn)}`, inner, top - 50.5, fonts.regular, 7.8, INK_SOFT, "right");
  return top - height;
}

/** What a render may add that an invoice's stored snapshot deliberately does not hold. */
export interface TaxInvoiceRenderOptions {
  /** The name the PDF files itself under (its title and creator): "Brandbasket" unless the caller names another. */
  readonly brandName?: string;
  /**
   * A letterhead to draw in place of Brandbasket's own: the logo's SVG paths, the height of the viewBox they are
   * drawn in, and the colour to fill them (a hex like "#0C1E2E"). The company on the invoice (name, GSTIN, address) is
   * the stored snapshot's and never changes; this is only the name the customer knows it by.
   */
  readonly letterhead?: { readonly paths: readonly string[]; readonly height: number; readonly colorHex: string };
  /** The address and site the footer sends questions to: `businessDetails` when unset. */
  readonly contact?: { readonly email: string; readonly website: string };
  /**
   * The customer's own mobile number as people read it ("+91 90000 00002"), read from their account when the PDF is
   * drawn. It is never stored on the invoice: an invoice is insert only and the database refuses a phone on a recipient,
   * so a number frozen into it could never be erased with the account. Printed under "Billed to" only where the invoice
   * says nothing else about who it is to (recipientPhoneToPrint).
   */
  readonly recipientPhone?: string | null;
}

/**
 * The mobile to print under "Billed to", or null. An invoice with an address or a GSTIN already says who it is to; one
 * with only a name (the customer gave no billing details and the business has no address on file) gets the account's
 * mobile, so the name is not all there is.
 */
export function recipientPhoneToPrint(recipient: TaxInvoicePartyRecord, phone: string | null | undefined): string | null {
  const printed = phone?.trim() ?? "";
  if (printed === "") return null;
  return recipient.gstin === null && recipient.addressLines.length === 0 ? printed : null;
}

/** Supplier on the left, the customer in the right column. Returns the y below the taller of the two. */
function parties(page: PDFPage, doc: PDFDocument, invoice: TaxInvoice, top: number, fonts: Fonts, options: TaxInvoiceRenderOptions): number {
  const supplier = invoice.supplier;
  const leftWidth = RIGHT_COLUMN - 6 * MM - LEFT;
  let left = top - 23.8;
  label(page, "Supplier", LEFT, left, fonts);
  left -= 16.5;
  for (const part of wrap(supplier.legalName, fonts.bold, 10.2, leftWidth)) {
    text(page, part, LEFT, left, fonts.bold, 10.2);
    left -= 14.4;
  }
  if (supplier.tradeName !== null) {
    text(page, `Trading as ${supplier.tradeName}`, LEFT, left, fonts.semibold, 9, ACCENT);
    left -= 15.9;
  }
  for (const line of supplier.addressLines) {
    for (const part of wrap(line, fonts.regular, 9, leftWidth)) {
      text(page, part, LEFT, left, fonts.regular, 9);
      left -= 13;
    }
  }
  left -= 3.6;
  for (const [name, value] of [["GSTIN", supplier.gstin], ["CIN", supplier.cin]] as const) {
    if (value === null) continue;
    const width = text(page, name, LEFT, left, fonts.semibold, 9);
    text(page, value, LEFT + width + 3, left, fonts.regular, 9);
    left -= 14.4;
  }
  const email = supplier.email ?? businessDetails.email;
  const emailWidth = text(page, email, LEFT, left, fonts.regular, 9, INK_SOFT);
  link(doc, page, `mailto:${email}`, LEFT, left, emailWidth, 9);
  if (supplier.phone !== null) text(page, supplier.phone, LEFT + emailWidth + 6.6, left, fonts.regular, 9, INK_SOFT);

  const recipient = invoice.recipient;
  const rightWidth = RIGHT - RIGHT_COLUMN;
  let right = top - 23.8;
  label(page, "Billed to", RIGHT_COLUMN, right, fonts);
  right -= 16.5;
  for (const part of wrap(recipient.legalName, fonts.bold, 10.2, rightWidth)) {
    text(page, part, RIGHT_COLUMN, right, fonts.bold, 10.2);
    right -= 15.2;
  }
  const state = recipient.stateCode === null ? [] : [`${stateName(recipient.stateCode) ?? recipient.stateCode}, India`];
  for (const line of [...recipient.addressLines, ...state]) {
    for (const part of wrap(line, fonts.regular, 9, rightWidth)) {
      text(page, part, RIGHT_COLUMN, right, fonts.regular, 9);
      right -= 13;
    }
  }
  if (recipient.gstin !== null) {
    right -= 3.5;
    const width = text(page, "GSTIN", RIGHT_COLUMN, right, fonts.semibold, 9);
    text(page, recipient.gstin, RIGHT_COLUMN + width + 3, right, fonts.regular, 9);
    right -= 13;
  }
  const phone = recipientPhoneToPrint(recipient, options.recipientPhone);
  if (phone !== null) {
    const width = text(page, "Mobile", RIGHT_COLUMN, right, fonts.semibold, 9);
    text(page, phone, RIGHT_COLUMN + width + 3, right, fonts.regular, 9);
    right -= 13;
  }
  // `left` is the baseline of the supplier's last line; `right` is already one line below the customer's last.
  return Math.min(left, right + 13) - 21;
}

interface Column {
  readonly head: string;
  readonly width: number;
  readonly numeric: boolean;
  readonly bold: boolean;
  readonly value: (line: TaxInvoiceLineRecord) => string;
}

/** The line items' columns. Discount only when a line has one, as in the approved samples. */
function columnsFor(invoice: TaxInvoice): { readonly columns: readonly Column[]; readonly descriptionWidth: number } {
  const showDiscount = invoice.lines.some((line) => line.discountAmountCents > 0);
  const columns: Column[] = [
    { head: "SAC", width: 16 * MM, numeric: false, bold: false, value: (line) => line.sac },
    { head: "Qty", width: 9 * MM, numeric: true, bold: false, value: (line) => String(line.quantity) },
    { head: "Rate", width: 20 * MM, numeric: true, bold: false, value: (line) => money(line.unitAmountCents) },
    ...(showDiscount
      ? [{ head: "Discount", width: 20 * MM, numeric: true, bold: false, value: (line: TaxInvoiceLineRecord) => money(line.discountAmountCents) }]
      : []),
    { head: "Taxable value", width: 23 * MM, numeric: true, bold: true, value: (line) => money(line.taxableCents) },
    { head: "GST", width: 11 * MM, numeric: true, bold: false, value: (line) => `${percent(line.taxRateBasisPoints)}%` },
    { head: "Tax", width: 20 * MM, numeric: true, bold: false, value: (line) => money(line.taxCents) },
  ];
  return { columns, descriptionWidth: RIGHT - LEFT - columns.reduce((sum, column) => sum + column.width, 0) };
}

/** One line item's text, wrapped to the description column, and the height its row takes. */
interface RowLayout {
  readonly line: TaxInvoiceLineRecord;
  readonly description: readonly string[];
  readonly detail: readonly string[];
  readonly note: readonly string[];
  readonly height: number;
}

function rowLayout(line: TaxInvoiceLineRecord, descriptionWidth: number, fonts: Fonts): RowLayout {
  const description = wrap(line.description, fonts.bold, 9.6, descriptionWidth);
  const detail = line.detail === null ? [] : wrap(line.detail, fonts.regular, 8.7, descriptionWidth);
  const note = line.note === null ? [] : wrap(line.note, fonts.regular, 8.7, descriptionWidth);
  const height = 18.7 + (description.length - 1) * 13 + detail.length * 15.1 + note.length * 14.4 + 13.7;
  return { line, description, detail, note, height };
}

const TABLE_HEAD_HEIGHT = 8.7;

/** The column headings and the ink rule under them. Returns the y of that rule. */
function tableHead(page: PDFPage, columns: readonly Column[], top: number, fonts: Fonts): number {
  const baseline = top - 7;
  text(page, "Description", LEFT, baseline, fonts.semibold, 7.6, INK_SOFT);
  let edge = RIGHT - columns.reduce((sum, column) => sum + column.width, 0);
  for (const column of columns) {
    edge += column.width;
    if (column.numeric) text(page, column.head, edge, baseline, fonts.semibold, 7.6, INK_SOFT, "right");
    else text(page, column.head, edge - column.width + 7, baseline, fonts.semibold, 7.6, INK_SOFT);
  }
  const ruleY = baseline - TABLE_HEAD_HEIGHT;
  page.drawLine({ start: { x: LEFT, y: ruleY }, end: { x: RIGHT, y: ruleY }, thickness: HAIRLINE, color: INK });
  return ruleY;
}

/** One line item below the rule at `top`. Returns the y of the rule under it. */
function tableRow(page: PDFPage, row: RowLayout, columns: readonly Column[], top: number, fonts: Fonts): number {
  let y = top - 18.7;
  const firstBaseline = y;
  row.description.forEach((part, index) => {
    if (index > 0) y -= 13;
    text(page, part, LEFT, y, fonts.bold, 9.6);
  });
  for (const part of row.detail) {
    y -= 15.1;
    text(page, part, LEFT, y, fonts.regular, 8.7);
  }
  for (const part of row.note) {
    y -= 14.4;
    text(page, part, LEFT, y, fonts.regular, 8.7, INK_SOFT);
  }
  let edge = RIGHT - columns.reduce((sum, column) => sum + column.width, 0);
  for (const column of columns) {
    edge += column.width;
    const font = column.bold ? fonts.bold : fonts.regular;
    if (column.numeric) text(page, column.value(row.line), edge, firstBaseline, font, 8.7, INK, "right");
    else text(page, column.value(row.line), edge - column.width + 7, firstBaseline, font, 8.7);
  }
  const ruleY = top - row.height;
  page.drawLine({ start: { x: LEFT, y: ruleY }, end: { x: RIGHT, y: ruleY }, thickness: HAIRLINE, color: RULE });
  return ruleY;
}

/** The tax rows of the totals: CGST and SGST at half the rate within our state, else IGST, then any round-off. */
function taxRows(invoice: TaxInvoice): Array<readonly [string, number]> {
  const rate = invoice.lines[0]?.taxRateBasisPoints ?? 0;
  const rows: Array<readonly [string, number]> =
    invoice.supplyType === "intra_state"
      ? [[`CGST @ ${percent(rate / 2)}%`, invoice.cgstCents], [`SGST @ ${percent(rate / 2)}%`, invoice.sgstCents]]
      : [[`IGST @ ${percent(rate)}%`, invoice.igstCents]];
  if (invoice.roundOffCents !== 0) rows.push(["Round off", invoice.roundOffCents]);
  return rows;
}

const WORDS_WIDTH = 82 * MM;

/** The left half of the block under the table: the total in words, and how and when it was paid, each wrapped. */
function settleText(invoice: TaxInvoice, fonts: Fonts): { readonly words: string[]; readonly method: string[]; readonly reference: string[] } {
  return {
    words: wrap(amountInWords(invoice.totalCents), fonts.semibold, 9, WORDS_WIDTH),
    method: wrap(`${invoice.paymentLabel}, paid ${longDate(invoice.paidOn)}`, fonts.regular, 9, WORDS_WIDTH),
    reference: wrap(`Payment ID ${invoice.paymentReference}`, fonts.regular, 9, WORDS_WIDTH),
  };
}

/** How tall the amount in words, payment and totals block is, so it can be moved whole to a new page when needed. */
function settleHeight(invoice: TaxInvoice, fonts: Fonts): number {
  const { words, method, reference } = settleText(invoice, fonts);
  const leftHeight = 23.8 + 16.5 + (words.length - 1) * 12.3 + 25.9 + 15.8 + (method.length + reference.length - 1) * 13.7 + 4;
  const rightHeight = 28 + 10 + 13.7 + (taxRows(invoice).length - 1) * 18 + 14.2 + 21.9 + 6;
  return Math.max(leftHeight, rightHeight);
}

/** Amount in words and how it was paid on the left, the totals in the right column, below the rule at `top`. */
function settle(page: PDFPage, invoice: TaxInvoice, top: number, fonts: Fonts): void {
  const { words, method, reference } = settleText(invoice, fonts);
  let y = top - 23.8;
  label(page, "Amount in words", LEFT, y, fonts);
  y -= 16.5;
  words.forEach((part, index) => {
    if (index > 0) y -= 12.3;
    text(page, part, LEFT, y, fonts.semibold, 9);
  });
  y -= 25.9;
  label(page, "Payment", LEFT, y, fonts);
  y -= 15.8;
  [...method.map((part) => [part, INK] as const), ...reference.map((part) => [part, INK_SOFT] as const)].forEach(([part, color], index) => {
    if (index > 0) y -= 13.7;
    text(page, part, LEFT, y, fonts.regular, 9, color);
  });

  let r = top - 28;
  text(page, "Taxable value", RIGHT_COLUMN, r, fonts.semibold, 9);
  text(page, money(invoice.taxableCents), RIGHT, r, fonts.semibold, 9, INK, "right");
  r -= 10;
  page.drawLine({ start: { x: RIGHT_COLUMN, y: r }, end: { x: RIGHT, y: r }, thickness: HAIRLINE, color: RULE });
  r -= 13.7;
  taxRows(invoice).forEach(([name, cents], index) => {
    if (index > 0) r -= 18;
    text(page, name, RIGHT_COLUMN, r, fonts.regular, 9, INK_SOFT);
    text(page, money(cents), RIGHT, r, fonts.regular, 9, INK, "right");
  });
  r -= 14.2;
  page.drawLine({ start: { x: RIGHT_COLUMN, y: r }, end: { x: RIGHT, y: r }, thickness: HAIRLINE, color: ACCENT });
  r -= 21.9;
  text(page, "Invoice total", RIGHT_COLUMN, r, fonts.bold, 10);
  rupees(page, invoice.totalCents, RIGHT, r, fonts.bold, 14);
}

/** The contact line on every page, and the declaration above it on the invoice's last page. */
function footer(page: PDFPage, doc: PDFDocument, fonts: Fonts, withDeclaration: boolean, options: TaxInvoiceRenderOptions): void {
  const here = businessDetails;
  const contact = options.contact ?? { email: here.email, website: here.website };
  if (withDeclaration) {
    let y = BOTTOM + 78.5;
    label(page, "Declaration", LEFT, y, fonts);
    y -= 15.8;
    DECLARATION_LINES.forEach((line, index) => {
      if (index > 0) y -= 13.7;
      text(page, line, LEFT, y, fonts.regular, FINE_PRINT, INK_SOFT);
    });
  }
  const ruleY = BOTTOM + 22.3;
  page.drawLine({ start: { x: LEFT, y: ruleY }, end: { x: RIGHT, y: ruleY }, thickness: HAIRLINE, color: RULE });
  const baseline = BOTTOM + 6.4;
  const lead = text(page, "Questions about this invoice? Write to ", LEFT, baseline, fonts.regular, FINE_PRINT, INK_SOFT);
  const emailWidth = text(page, contact.email, LEFT + lead, baseline, fonts.semibold, FINE_PRINT);
  link(doc, page, `mailto:${contact.email}`, LEFT + lead, baseline, emailWidth, FINE_PRINT);
  const site = contact.website.replace(/^https?:\/\//, "");
  const siteWidth = text(page, site, RIGHT, baseline, fonts.regular, FINE_PRINT, INK_SOFT, "right");
  link(doc, page, contact.website, RIGHT - siteWidth, baseline, siteWidth, FINE_PRINT);
}

/** A page after the first: the letterhead marked "Continued", and the invoice number. Returns the y below. */
function continuationPage(doc: PDFDocument, invoice: TaxInvoice, fonts: Fonts, options: TaxInvoiceRenderOptions): { readonly page: PDFPage; readonly top: number } {
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const top = header(page, fonts, true, options);
  page.drawLine({ start: { x: LEFT, y: top }, end: { x: RIGHT, y: top }, thickness: HAIRLINE, color: ACCENT });
  label(page, "Invoice number", LEFT, top - 15, fonts);
  text(page, invoice.number, LEFT, top - 31, fonts.semibold, 9.6);
  return { page, top: top - 48 };
}

/**
 * Draws one invoice from a fresh page. It is one page in every case Brandbasket issues today (one line); lines that
 * do not fit carry on to a continuation page, and the totals and declaration always end the invoice. Every page of
 * an invoice that runs to more than one says "Page n of N".
 */
function drawInvoice(doc: PDFDocument, invoice: TaxInvoice, fonts: Fonts, options: TaxInvoiceRenderOptions): void {
  const pages: PDFPage[] = [];
  let page = doc.addPage([PAGE.width, PAGE.height]);
  pages.push(page);
  let y = header(page, fonts, false, options);
  y = facts(page, invoice, y, fonts);
  y = parties(page, doc, invoice, y, fonts, options);

  const { columns, descriptionWidth } = columnsFor(invoice);
  y = tableHead(page, columns, y, fonts);
  for (const row of invoice.lines.map((line) => rowLayout(line, descriptionWidth, fonts))) {
    if (y - row.height < FOOTER_TOP) {
      const next = continuationPage(doc, invoice, fonts, options);
      page = next.page;
      pages.push(page);
      y = tableHead(page, columns, next.top, fonts);
    }
    y = tableRow(page, row, columns, y, fonts);
  }
  if (y - settleHeight(invoice, fonts) < FOOTER_TOP) {
    const next = continuationPage(doc, invoice, fonts, options);
    page = next.page;
    pages.push(page);
    y = next.top;
  }
  settle(page, invoice, y, fonts);
  pages.forEach((each, index) => {
    footer(each, doc, fonts, index === pages.length - 1, options);
    if (pages.length > 1) spaced(each, `Page ${index + 1} of ${pages.length}`, RIGHT, BOTTOM + 30, fonts.semibold, 7.4, 0.08, INK_SOFT, "right");
  });
}

/** The invoices as one PDF, each starting on a new A4 page, from their stored snapshots only. */
export async function renderTaxInvoicesPdf(invoices: readonly TaxInvoice[], options: TaxInvoiceRenderOptions = {}): Promise<Uint8Array> {
  const first = invoices[0];
  if (first === undefined) throw new RangeError("No invoices to render");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const brandName = options.brandName ?? deploymentBrandName();
  doc.setTitle(invoices.length === 1 ? `Tax invoice ${first.number}` : `${brandName} tax invoices`);
  doc.setAuthor(first.supplier.legalName);
  doc.setCreator(brandName);
  const fonts: Fonts = {
    regular: await doc.embedFont(HANKEN_REGULAR, { subset: true }),
    semibold: await doc.embedFont(HANKEN_SEMIBOLD, { subset: true }),
    bold: await doc.embedFont(HANKEN_BOLD, { subset: true }),
  };
  for (const invoice of invoices) drawInvoice(doc, invoice, fonts, options);
  return doc.save();
}
