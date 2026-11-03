import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { ReportContent } from "../lib/reports/content";
import { BRANDBASKET_LETTERHEAD } from "./brandbasket-letterhead";
import { HANKEN_BOLD, HANKEN_REGULAR, HANKEN_SEMIBOLD, RUPEE_ADVANCE, RUPEE_PATH, RUPEE_UNITS_PER_EM } from "./tax-invoice-fonts.generated";
import { INK, INK_SOFT, RULE } from "./tax-invoice-pdf";

/*
 * A monthly report as an A4 PDF, drawn from the frozen report document only, so a PDF made later says what the report said
 * when it was sent. Same letterhead, fonts and ink as the tax invoice. The rupee sign is the vector path the invoice uses:
 * Hanken Grotesk has no glyph for it.
 */

const PAGE = { width: 595.28, height: 841.89 } as const;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const BOTTOM = 84;
const LOGO_HEIGHT = 26.93;
const RUPEE = "₹";
const NOTE = "Figures come from our own records and checks, and from numbers our team enters from your accounts. A figure we could not measure is left out, never shown as zero.";

interface Fonts {
  readonly regular: PDFFont;
  readonly semibold: PDFFont;
  readonly bold: PDFFont;
}

export interface ReportPdfInput {
  readonly businessName: string;
  /** "Website", "Social & Ads" or "Local SEO + AEO". */
  readonly serviceTitle: string;
  /** "October 2026". */
  readonly monthTitle: string;
  /** "4 November 2026". */
  readonly sentOn: string;
  readonly content: ReportContent;
}

/** Text the font can draw; a character it lacks prints as "?" rather than making the whole download fail. */
function printable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text, (character) => {
    const codePoint = character.codePointAt(0);
    return character === RUPEE || (codePoint !== undefined && supported.has(codePoint)) ? character : "?";
  }).join("");
}

/** The width of a line that may hold rupee signs. */
function widthOf(text: string, font: PDFFont, size: number): number {
  const scale = size / RUPEE_UNITS_PER_EM;
  return text.split(RUPEE).reduce((sum, part, index) => sum + font.widthOfTextAtSize(part, size) + (index === 0 ? 0 : RUPEE_ADVANCE * scale), 0);
}

/** One line at `x` (its right edge when `align` is "right"). Each rupee sign is drawn as a path, the rest as text. */
function line(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size: number, color: RGB = INK, align: "left" | "right" = "left"): void {
  const safe = printable(value, font);
  let cursor = align === "right" ? x - widthOf(safe, font, size) : x;
  const scale = size / RUPEE_UNITS_PER_EM;
  safe.split(RUPEE).forEach((part, index) => {
    if (index > 0) {
      page.drawSvgPath(RUPEE_PATH, { x: cursor, y, scale, color });
      cursor += RUPEE_ADVANCE * scale;
    }
    if (part !== "") {
      page.drawText(part, { x: cursor, y, size, font, color });
      cursor += font.widthOfTextAtSize(part, size);
    }
  });
}

/** Breaks text into lines no wider than `maxWidth`, on spaces, and inside a word only when the word alone is too wide. */
function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of printable(value, font).split(/\s+/).filter((part) => part !== "")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (widthOf(candidate, font, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== "") lines.push(current);
    let rest = word;
    while (rest.length > 1 && widthOf(rest, font, size) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && widthOf(rest.slice(0, cut), font, size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current !== "") lines.push(current);
  return lines;
}

class Sheet {
  readonly pages: PDFPage[] = [];
  page: PDFPage;
  y = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    private readonly logo: PDFImage,
    private readonly input: ReportPdfInput,
  ) {
    this.page = this.addPage();
  }

  private addPage(): PDFPage {
    const page = this.doc.addPage([PAGE.width, PAGE.height]);
    // A PDF page has no background of its own and viewers in dark mode show black, which hides dark text.
    page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(1, 1, 1) });
    this.pages.push(page);
    this.y = PAGE.height - MARGIN - 8;
    return page;
  }

  /** Starts a new page when `height` more points do not fit above the footer. */
  ensure(height: number): void {
    if (this.y - height >= BOTTOM) return;
    this.page = this.addPage();
    line(this.page, `${this.input.serviceTitle}, ${this.input.monthTitle}, continued`, MARGIN, this.y, this.fonts.semibold, 9.5, INK_SOFT);
    this.y -= 30;
  }

  rule(): void {
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE.width - MARGIN, y: this.y }, thickness: 0.75, color: RULE });
  }

  letterhead(): void {
    // The wordmark's baseline sits 3 of the logo's 60 units above its bottom edge.
    this.page.drawImage(this.logo, { x: MARGIN, y: this.y - LOGO_HEIGHT * 0.05, width: (LOGO_HEIGHT * this.logo.width) / this.logo.height, height: LOGO_HEIGHT });
  }

  footers(): void {
    const { regular } = this.fonts;
    this.pages.forEach((page, index) => {
      wrap(NOTE, regular, 8, CONTENT_WIDTH)
        .reverse()
        .forEach((piece, row) => line(page, piece, MARGIN, MARGIN + 14 + row * 11, regular, 8, INK_SOFT));
      line(page, `Page ${index + 1} of ${this.pages.length}`, PAGE.width - MARGIN, MARGIN - 6, regular, 8, INK_SOFT, "right");
    });
  }
}

/** One report as a PDF. */
export async function renderReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await doc.embedFont(HANKEN_REGULAR, { subset: true }),
    semibold: await doc.embedFont(HANKEN_SEMIBOLD, { subset: true }),
    bold: await doc.embedFont(HANKEN_BOLD, { subset: true }),
  };
  const logo = await doc.embedPng(BRANDBASKET_LETTERHEAD.png);
  const title = `${input.serviceTitle} report, ${input.monthTitle}`;
  doc.setTitle(`${title} for ${input.businessName}`);
  doc.setAuthor("Brandbasket");
  doc.setCreator("Brandbasket");

  const sheet = new Sheet(doc, fonts, logo, input);
  const right = PAGE.width - MARGIN;
  sheet.letterhead();
  line(sheet.page, title, right, sheet.y, fonts.bold, 15, INK, "right");
  sheet.y -= 20;
  line(sheet.page, `Prepared for ${input.businessName}`, right, sheet.y, fonts.regular, 9.5, INK_SOFT, "right");
  sheet.y -= 13.5;
  line(sheet.page, `Sent ${input.sentOn}`, right, sheet.y, fonts.regular, 9.5, INK_SOFT, "right");
  sheet.y -= 26;
  sheet.rule();
  sheet.y -= 30;

  for (const piece of wrap(input.content.headline, fonts.semibold, 14, CONTENT_WIDTH)) {
    sheet.ensure(22);
    line(sheet.page, piece, MARGIN, sheet.y, fonts.semibold, 14);
    sheet.y -= 21;
  }
  sheet.y -= 14;

  sheet.ensure(40);
  line(sheet.page, "THE FIGURES", MARGIN, sheet.y, fonts.bold, 7.5, INK_SOFT);
  sheet.y -= 10;
  const valueRoom = 170;
  for (const figure of input.content.figures) {
    const labelLines = wrap(figure.label, fonts.regular, 10.5, CONTENT_WIDTH - valueRoom);
    sheet.ensure(labelLines.length * 15 + 16);
    sheet.rule();
    sheet.y -= 18;
    line(sheet.page, figure.value, right, sheet.y, fonts.bold, 10.5, INK, "right");
    for (const piece of labelLines) {
      line(sheet.page, piece, MARGIN, sheet.y, fonts.regular, 10.5, INK_SOFT);
      sheet.y -= 15;
    }
    sheet.y -= 2;
  }
  sheet.rule();

  if (input.content.whatWeDid.length > 0) {
    sheet.y -= 34;
    sheet.ensure(60);
    line(sheet.page, "WHAT WE DID", MARGIN, sheet.y, fonts.bold, 7.5, INK_SOFT);
    sheet.y -= 18;
    for (const item of input.content.whatWeDid) {
      const pieces = wrap(item, fonts.regular, 10, CONTENT_WIDTH - 14);
      sheet.ensure(pieces.length * 14 + 6);
      sheet.page.drawCircle({ x: MARGIN + 2.5, y: sheet.y + 3.5, size: 1.6, color: INK_SOFT });
      for (const piece of pieces) {
        line(sheet.page, piece, MARGIN + 14, sheet.y, fonts.regular, 10);
        sheet.y -= 14;
      }
      sheet.y -= 4;
    }
  }

  sheet.footers();
  return doc.save();
}
