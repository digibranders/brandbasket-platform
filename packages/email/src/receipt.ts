import { emailBrandName, emailLogoUrl } from "./brand";
import { assertWebUrl, escapeHtml } from "./message";

/*
 * The Receipt layout every customer email shares: the logo, one white card with a small rattan label, a heading and the
 * content, then small print under the card. The team alerts keep the plain htmlDocument layout.
 *
 * Mail apps cannot read CSS variables or load our fonts, so these colours mirror --bg, --surface, --ink, --ink-2, --line and
 * --rattan-text in the website's theme, and the type is the Arial every inbox has. Layout uses tables and inline styles so it
 * holds in old mail apps; every value from a caller is escaped here, never trusted.
 */
const BONE = "#f6f5f2";
const SURFACE = "#ffffff";
const INK = "#15161a";
const INK_2 = "#4e5057";
const LINE = "#e3e0d9";
const RATTAN_TEXT = "#a46c2f";
const CODE_WASH = "#f6f5f2";
const FONT = "Arial,Helvetica,sans-serif";

export interface ReceiptOptions {
  /** The document title: the subject. */
  readonly title: string;
  /** The small rattan label above the heading, such as "Password reset". */
  readonly kicker: string;
  readonly heading: string;
  /** The card's content: blocks from receiptParagraph, receiptButton, receiptCode, receiptRows and receiptQuote. */
  readonly body: readonly string[];
  /** Small print under the card, as plain text. */
  readonly footer?: readonly string[];
  /** The text mail apps show beside the subject in the inbox list. */
  readonly preheader?: string;
  /** The logo's address when the caller has one; otherwise the default. */
  readonly logoUrl?: string;
}

/** A paragraph of plain text. */
export function receiptParagraph(text: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:14.5px;line-height:1.6;color:${INK_2};overflow-wrap:anywhere">${escapeHtml(text)}</p>`;
}

/** The one dark button. The address must be a web address. */
export function receiptButton(href: string, label: string): string {
  const url = assertWebUrl(href, "button address");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td style="border-radius:999px;background:${INK}"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;border-radius:999px;font-family:${FONT};font-size:14.5px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
}

/** A one-time code in a box of its own. */
export function receiptCode(code: string): string {
  return `<p style="margin:4px 0 20px;padding:16px;border:1px solid ${LINE};border-radius:10px;background:${CODE_WASH};font-family:${FONT};font-size:32px;font-weight:bold;letter-spacing:0.35em;text-align:center;color:${INK}">${escapeHtml(code)}</p>`;
}

/** Words the team wrote, in a quote bar. Line breaks are kept. */
export function receiptQuote(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="padding:14px 16px;border-left:3px solid ${RATTAN_TEXT};background:${BONE};font-family:${FONT};font-size:14.5px;line-height:1.6;color:${INK};white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(text)}</td></tr></table>`;
}

export interface ReceiptRow {
  readonly label: string;
  readonly value: string;
  /** Bold, for a total. */
  readonly strong?: boolean;
}

/** Label and value rows with a hairline above each. `wide` puts the value at the right edge, for amounts; `labelWidth` widens the label column for long labels. */
export function receiptRows(rows: readonly ReceiptRow[], options: { readonly wide?: boolean; readonly labelWidth?: number } = {}): string {
  const cells = rows
    .map(({ label, value, strong = false }) => {
      const weight = strong ? "font-weight:bold;" : "";
      const labelCell = options.wide === true
        ? `<td valign="top" style="padding:11px 16px 11px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:14.5px;line-height:1.5;color:${strong ? INK : INK_2};${weight}">${escapeHtml(label)}</td>`
        : `<td width="${options.labelWidth ?? 116}" valign="top" style="padding:11px 16px 11px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:14.5px;line-height:1.5;color:${INK_2}">${escapeHtml(label)}</td>`;
      const align = options.wide === true ? ' align="right"' : "";
      const nowrap = options.wide === true ? "white-space:nowrap;" : "overflow-wrap:anywhere;";
      return `<tr>${labelCell}<td${align} valign="top" style="padding:11px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:14.5px;line-height:1.5;color:${INK};${weight}${nowrap}">${escapeHtml(value)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${cells}</table>`;
}

export function receiptDocument({ title, kicker, heading, body, footer = [], preheader, logoUrl }: ReceiptOptions): string {
  const brand = emailBrandName();
  const logo = assertWebUrl(logoUrl ?? emailLogoUrl(), "logoUrl");
  const small = footer
    .map((line) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_2};overflow-wrap:anywhere">${escapeHtml(line)}</p>`)
    .join("");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(title)}</title>`,
    "</head>",
    `<body style="margin:0;padding:0;background:${BONE}">`,
    ...(preheader === undefined ? [] : [`<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>`]),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BONE};padding:32px 16px"><tr><td align="center">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT}">`,
    `<tr><td style="padding:0 0 22px"><img src="${escapeHtml(logo)}" width="180" alt="${escapeHtml(brand)}" style="display:block;border:0;height:auto"></td></tr>`,
    `<tr><td style="padding:30px 30px 14px;background:${SURFACE};border:1px solid ${LINE};border-radius:12px">`,
    `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:${RATTAN_TEXT}">${escapeHtml(kicker)}</p>`,
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:bold;color:${INK};overflow-wrap:anywhere">${escapeHtml(heading)}</h1>`,
    ...body,
    "</td></tr>",
    ...(small === "" ? [] : [`<tr><td style="padding:18px 6px 0">${small}</td></tr>`]),
    "</table>",
    "</td></tr></table>",
    "</body>",
    "</html>",
  ].join("\n");
}
