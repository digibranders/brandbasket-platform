import "server-only";
import type { Receipt, TaxInvoice } from "@brandbasket/db";
import { parseReceiptSelection } from "@brandbasket/shared/lib/billing/receipt-download";
import { displayPhone, displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { renderTaxInvoicesPdf } from "@brandbasket/shared/server/tax-invoice-pdf";
import { PDFDocument } from "pdf-lib";
import { BRAND, type Brand } from "../rules/brand";
import { isDownloadableReceipt, receiptDocument, type ReceiptCustomer } from "../rules/receipt-document";
import { listCustomerReceipts, listCustomerTaxInvoices } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { renderReceiptsPdf } from "./receipt-pdf";

/*
 * The receipts download, ported from apps/platform app/app-host/billing/receipts/route.ts. The route at the same old address
 * (/billing/receipts, which payment emails link to) calls the owner guard and hands over here.
 */

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function refuse(status: 400 | 404): Response {
  return new Response(null, { status, headers: NO_STORE });
}

/** The receipts a download asked for, oldest first so a combined PDF reads in order; null if any is not theirs. */
function chooseReceipts(receipts: readonly Receipt[], ids: readonly string[] | null): Receipt[] | null {
  const downloadable = receipts.filter(isDownloadableReceipt);
  let chosen = downloadable;
  if (ids !== null) {
    chosen = [];
    for (const id of ids) {
      const receipt = downloadable.find((candidate) => candidate.id === id);
      if (receipt === undefined) return null;
      chosen.push(receipt);
    }
  }
  if (chosen.length === 0) return null;
  return chosen.toSorted((a, b) => a.sequence - b.sequence);
}

/** One downloaded payment: its tax invoice when it has one, else its receipt (payments before invoicing, and USD). */
type Piece = { readonly kind: "invoice"; readonly invoice: TaxInvoice } | { readonly kind: "receipt"; readonly receipt: Receipt };

/** A stretch of neighbouring pieces of one kind, which one renderer can draw in a single call. */
type Run = { readonly kind: "invoice"; readonly invoices: TaxInvoice[] } | { readonly kind: "receipt"; readonly receipts: Receipt[] };

/** The pieces grouped into runs of invoices and runs of receipts, in order, so the joined PDF still reads oldest first. */
function groupRuns(pieces: readonly Piece[]): Run[] {
  const runs: Run[] = [];
  for (const piece of pieces) {
    const last = runs.at(-1);
    if (piece.kind === "invoice") {
      if (last?.kind === "invoice") last.invoices.push(piece.invoice);
      else runs.push({ kind: "invoice", invoices: [piece.invoice] });
    } else if (last?.kind === "receipt") {
      last.receipts.push(piece.receipt);
    } else {
      runs.push({ kind: "receipt", receipts: [piece.receipt] });
    }
  }
  return runs;
}

async function renderRun(run: Run, customer: ReceiptCustomer, phone: string | null, brand: Brand): Promise<Uint8Array> {
  if (run.kind === "invoice") return renderTaxInvoicesPdf(run.invoices, { recipientPhone: phone, brandName: brand.name });
  return renderReceiptsPdf(run.receipts.map((receipt) => receiptDocument(receipt, customer, brand)), brand);
}

/** One PDF from the runs' PDFs: a single run is returned as drawn, several are joined page by page. */
async function joinPdfs(parts: readonly Uint8Array[], brand: Brand): Promise<Uint8Array> {
  const only = parts[0];
  if (parts.length === 1 && only !== undefined) return only;
  const joined = await PDFDocument.create();
  joined.setTitle(`${brand.name} invoices and receipts`);
  for (const part of parts) {
    const source = await PDFDocument.load(part);
    for (const page of await joined.copyPages(source, source.getPageIndices())) joined.addPage(page);
  }
  return joined.save();
}

/** A single payment's file is named for its invoice or receipt number. A list is named for what it holds. */
function fileNameFor(pieces: readonly Piece[], customer: ReceiptCustomer, brand: Brand): string {
  const only = pieces[0];
  if (pieces.length !== 1 || only === undefined) {
    if (pieces.every((piece) => piece.kind === "invoice")) return "brandbasket-invoices.pdf";
    if (pieces.every((piece) => piece.kind === "receipt")) return "brandbasket-receipts.pdf";
    return "brandbasket-invoices-and-receipts.pdf";
  }
  if (only.kind === "invoice") return `brandbasket-invoice-${only.invoice.number.replaceAll("/", "-")}.pdf`;
  return receiptDocument(only.receipt, customer, brand).fileName;
}

/**
 * The signed-in customer's bills as one PDF: `ids` (1 to 50 distinct uuids, comma separated) or, with none, every payment. A
 * payment with a tax invoice downloads as that invoice; any other (before invoicing, or in dollars) as its receipt. Payments and
 * invoices are read through row-level security, so another business's payment id finds nothing and gets a 404, exactly as for
 * an id that does not exist. The caller has run the owner guard.
 */
export async function receiptsDownload(request: Request, customer: GrantedCustomer): Promise<Response> {
  const selection = parseReceiptSelection(new URL(request.url).searchParams.get("ids"));
  if (selection.kind === "invalid") return refuse(400);

  const receipts = chooseReceipts(await listCustomerReceipts(customer), selection.kind === "all" ? null : selection.ids);
  if (receipts === null) return refuse(404);

  // A payment whose invoice cannot be read (it should always be) still downloads, as its receipt.
  const invoicedIds = receipts.filter((receipt) => receipt.taxInvoiceId !== null).map((receipt) => receipt.id);
  const invoices = new Map((invoicedIds.length === 0 ? [] : await listCustomerTaxInvoices(customer, invoicedIds)).map((invoice) => [invoice.paymentId, invoice]));
  const pieces = receipts.map((receipt): Piece => {
    const invoice = invoices.get(receipt.id);
    return invoice === undefined ? { kind: "receipt", receipt } : { kind: "invoice", invoice };
  });

  const { user, tenant } = customer;
  // "Billed to" on a receipt names the account by what it signs in with: its number, never a phone account's placeholder.
  const receiptCustomer: ReceiptCustomer = { businessName: tenant.businessName, email: user.phone === null ? user.email : displayPhone(user.phone).text };
  // An invoice with no billing details prints the account's mobile under "Billed to". Only the owner's: an editor's own number
  // is not the business's (the guard admits owners only; kept so the rule stays if that changes).
  const phone = tenant.role === "owner" ? displayPhoneText(user.phone) : null;
  const bytes = await joinPdfs(await Promise.all(groupRuns(pieces).map((run) => renderRun(run, receiptCustomer, phone, BRAND))), BRAND);

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileNameFor(pieces, receiptCustomer, BRAND)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
