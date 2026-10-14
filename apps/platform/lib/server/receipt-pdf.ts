import "server-only";
import { BRAND, type Brand } from "@/lib/brand";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReceiptDocument } from "@/lib/billing/receipt-document";

/** A4 in PDF points. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLUMN_GAP = 32;
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2;

/** The dashboard's ink, accent and rule colours (theme.css), so a receipt looks like it came from the same place. */
const INK = rgb(0x2a / 255, 0x0d / 255, 0x10 / 255);
const INK_SOFT = rgb(0x5e / 255, 0x3a / 255, 0x40 / 255);
const ACCENT = rgb(0x63 / 255, 0x00 / 255, 0x1e / 255);
const LINE = rgb(0xe2 / 255, 0xd2 / 255, 0xc1 / 255);
const PAPER = rgb(1, 1, 1);

interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
}

/**
 * Text the font can draw. The built-in Helvetica only covers Windows-1252, and a business name in Devanagari or an
 * emoji would otherwise make pdf-lib throw and the whole download fail; such characters print as "?" instead.
 */
function drawable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text, (character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && supported.has(codePoint) ? character : "?";
  }).join("");
}

/** Breaks `text` into lines no wider than `maxWidth`, splitting on spaces and, for one long word, mid-word. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter((part) => part !== "")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== "") lines.push(current);
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
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

interface TextOptions {
  readonly font: PDFFont;
  readonly size: number;
  readonly color?: ReturnType<typeof rgb>;
}

function drawText(page: PDFPage, text: string, x: number, y: number, options: TextOptions): void {
  page.drawText(drawable(text, options.font), { x, y, size: options.size, font: options.font, color: options.color ?? INK });
}

function drawRightAligned(page: PDFPage, text: string, right: number, y: number, options: TextOptions): void {
  const safe = drawable(text, options.font);
  const width = options.font.widthOfTextAtSize(safe, options.size);
  page.drawText(safe, { x: right - width, y, size: options.size, font: options.font, color: options.color ?? INK });
}

function drawRule(page: PDFPage, y: number): void {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.75,
    color: LINE,
  });
}

/** A small uppercase label over a block of lines, wrapped to one column. Returns the y below the block. */
function drawBlock(page: PDFPage, fonts: Fonts, label: string, lines: readonly string[], x: number, top: number): number {
  drawText(page, label.toUpperCase(), x, top, { font: fonts.bold, size: 7.5, color: INK_SOFT });
  let y = top - 16;
  lines.forEach((line, index) => {
    const font = index === 0 ? fonts.bold : fonts.regular;
    for (const piece of wrap(drawable(line, font), font, 9.5, COLUMN_WIDTH)) {
      drawText(page, piece, x, y, { font, size: 9.5, color: index === 0 ? INK : INK_SOFT });
      y -= 13.5;
    }
  });
  return y;
}

function drawReceipt(page: PDFPage, fonts: Fonts, receipt: ReceiptDocument, brand: Brand): void {
  // A PDF page has no background of its own, and viewers in dark mode show that as black, which hides the dark
  // text. Painting the page white keeps a receipt readable (and printable) in every viewer.
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  const right = PAGE_WIDTH - MARGIN;
  let y = PAGE_HEIGHT - MARGIN - 8;

  drawText(page, brand.name, MARGIN, y, { font: fonts.bold, size: 20, color: ACCENT });
  drawRightAligned(page, receipt.title, right, y, { font: fonts.bold, size: 18 });
  y -= 20;
  drawRightAligned(page, `Issued ${receipt.issuedOn}`, right, y, { font: fonts.regular, size: 9.5, color: INK_SOFT });
  y -= 14;
  drawRightAligned(page, receipt.status, right, y, { font: fonts.bold, size: 9.5, color: ACCENT });

  y -= 30;
  drawRule(page, y);
  y -= 28;

  const fromBottom = drawBlock(page, fonts, "From", receipt.from, MARGIN, y);
  const toBottom = drawBlock(page, fonts, "Billed to", receipt.billedTo, MARGIN + COLUMN_WIDTH + COLUMN_GAP, y);
  y = Math.min(fromBottom, toBottom) - 24;

  drawText(page, "DESCRIPTION", MARGIN, y, { font: fonts.bold, size: 7.5, color: INK_SOFT });
  drawRightAligned(page, "AMOUNT", right, y, { font: fonts.bold, size: 7.5, color: INK_SOFT });
  y -= 10;
  drawRule(page, y);
  y -= 20;

  const descriptionWidth = CONTENT_WIDTH - 140;
  for (const line of receipt.lines) {
    const pieces = wrap(drawable(line.label, fonts.regular), fonts.regular, 10.5, descriptionWidth);
    drawRightAligned(page, line.amount, right, y, { font: fonts.regular, size: 10.5 });
    for (const piece of pieces) {
      drawText(page, piece, MARGIN, y, { font: fonts.regular, size: 10.5 });
      y -= 15;
    }
    y -= 7;
  }

  drawRule(page, y + 6);
  y -= 16;
  drawText(page, receipt.total.label, MARGIN, y, { font: fonts.bold, size: 12 });
  drawRightAligned(page, receipt.total.amount, right, y, { font: fonts.bold, size: 12 });

  y -= 40;
  drawText(page, "PAYMENT REFERENCE", MARGIN, y, { font: fonts.bold, size: 7.5, color: INK_SOFT });
  y -= 14;
  drawText(page, receipt.reference, MARGIN, y, { font: fonts.regular, size: 9.5, color: INK_SOFT });

  let noteY = MARGIN + 14;
  const noteLines = wrap(drawable(receipt.note, fonts.regular), fonts.regular, 8.5, CONTENT_WIDTH);
  for (const piece of noteLines.reverse()) {
    drawText(page, piece, MARGIN, noteY, { font: fonts.regular, size: 8.5, color: INK_SOFT });
    noteY += 12;
  }
}

/** One A4 page per receipt, in the order given. Throws for an empty list: there is nothing to download. */
export async function renderReceiptsPdf(receipts: readonly ReceiptDocument[], brand: Brand = BRAND): Promise<Uint8Array> {
  const first = receipts[0];
  if (first === undefined) throw new RangeError("At least one receipt is needed to make a PDF.");

  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  pdf.setTitle(receipts.length === 1 ? `${brand.name} ${first.title}` : `${brand.name} receipts`);
  pdf.setAuthor(brand.name);
  pdf.setCreator(brand.name);

  for (const receipt of receipts) {
    drawReceipt(pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]), fonts, receipt, brand);
  }
  return pdf.save();
}
