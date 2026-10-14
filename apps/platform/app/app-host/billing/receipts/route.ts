import "server-only";
import { brandedPlanName, supportEmailOf, type Brand } from "@/lib/brand";
import { brandForHostHeader } from "@/lib/server/request-brand";
import type { Receipt, TaxInvoice } from "@firstfold/db";
import { displayPhoneText } from "@firstfold/shared/server/phone-display";
import { businessDetails } from "@firstfold/shared/lib/site-config";
import { renderTaxInvoicesPdf, type TaxInvoiceRenderOptions } from "@firstfold/shared/server/tax-invoice-pdf";
import { PDFDocument } from "pdf-lib";
import { isDownloadableReceipt, receiptDocument, type ReceiptCustomer } from "@/lib/billing/receipt-document";
import { parseReceiptSelection } from "@/lib/billing/receipt-download";
import { accountLabel } from "@/lib/server/account-label";
import { listCustomerReceipts, listCustomerTaxInvoices } from "@/lib/server/billing";
import { getCustomerAccess } from "@/lib/server/customer-tenant";
import { FYNIX_LETTERHEAD } from "@firstfold/shared/server/fynix-letterhead";
import { renderReceiptsPdf } from "@/lib/server/receipt-pdf";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function refuse(status: 400 | 401 | 404): Response {
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

/**
 * An invoice as the customer's brand words it. The stored line says "Firstfold Care plan", the name the plan was sold
 * under; shown under another brand it reads "Care plan". Only what is drawn changes: the invoice itself is not touched.
 */
function invoiceAsShown(invoice: TaxInvoice, brand: Brand): TaxInvoice {
  if (brand.id === "firstfold") return invoice;
  return {
    ...invoice,
    // The company, its GSTIN and address are the stored ones (Fynix Digital is a name Digibranders trades under); the name
    // it trades under and the address the customer is told to write to are the brand's.
    supplier: { ...invoice.supplier, tradeName: brand.name, email: supportEmailOf(brand) },
    lines: invoice.lines.map((line) => ({ ...line, description: brandedPlanName(line.description, brand) })),
  };
}

/** What the invoice PDF draws for a brand that has its own logo and address: its letterhead and where questions go. */
function invoiceBranding(brand: Brand): Pick<TaxInvoiceRenderOptions, "letterhead" | "contact"> {
  if (brand.id === "firstfold" || brand.logo === null) return {};
  return {
    letterhead: { paths: FYNIX_LETTERHEAD.paths, height: FYNIX_LETTERHEAD.height, colorHex: FYNIX_LETTERHEAD.colorHex },
    contact: { email: supportEmailOf(brand), website: brand.siteUrl ?? businessDetails.website },
  };
}

async function renderRun(run: Run, customer: ReceiptCustomer, phone: string | null, brand: Brand): Promise<Uint8Array> {
  if (run.kind === "invoice") return renderTaxInvoicesPdf(run.invoices.map((invoice) => invoiceAsShown(invoice, brand)), { recipientPhone: phone, brandName: brand.name, ...invoiceBranding(brand) });
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

/**
 * A single payment's file is named for its invoice or receipt number. A list is named for what it holds: invoices,
 * receipts, or both.
 */
function fileNameFor(pieces: readonly Piece[], customer: ReceiptCustomer, brand: Brand): string {
  const only = pieces[0];
  if (pieces.length !== 1 || only === undefined) {
    if (pieces.every((piece) => piece.kind === "invoice")) return `${brand.id}-invoices.pdf`;
    if (pieces.every((piece) => piece.kind === "receipt")) return `${brand.id}-receipts.pdf`;
    return `${brand.id}-invoices-and-receipts.pdf`;
  }
  if (only.kind === "invoice") return `${brand.id}-invoice-${only.invoice.number.replaceAll("/", "-")}.pdf`;
  return receiptDocument(only.receipt, customer, brand).fileName;
}

/**
 * `GET /billing/receipts[?ids=<id>,<id>]` on the app host: the signed-in customer's bills as one PDF. A payment with a
 * tax invoice downloads as that invoice; any other (made before invoicing began, or in dollars) as its receipt. With no
 * ids it is every payment on the billing page. Payments and invoices are read through row-level security, so a
 * customer asking for another business's payment id finds nothing and gets a 404, exactly as for an id that does not
 * exist.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await getCustomerAccess();
  if (access.kind !== "granted") return refuse(401);

  const selection = parseReceiptSelection(new URL(request.url).searchParams.get("ids"));
  if (selection.kind === "invalid") return refuse(400);

  const receipts = chooseReceipts(
    await listCustomerReceipts(access),
    selection.kind === "all" ? null : selection.ids,
  );
  if (receipts === null) return refuse(404);

  // A payment whose invoice cannot be read (it should always be) still downloads, as its receipt.
  const invoicedIds = receipts.filter((receipt) => receipt.taxInvoiceId !== null).map((receipt) => receipt.id);
  const invoices = new Map(
    (invoicedIds.length === 0 ? [] : await listCustomerTaxInvoices(access, invoicedIds)).map((invoice) => [invoice.paymentId, invoice]),
  );
  const pieces = receipts.map((receipt): Piece => {
    const invoice = invoices.get(receipt.id);
    return invoice === undefined ? { kind: "receipt", receipt } : { kind: "invoice", invoice };
  });

  // "Billed to" on a receipt names the account by what it signs in with: its number, never a phone account's placeholder.
  const customer: ReceiptCustomer = { businessName: access.tenant.businessName, email: accountLabel(access.user) };
  // An invoice with no billing details prints the account's mobile under "Billed to" (it is never stored on the invoice).
  // Only the owner's, as the admin download does: an editor's own number is not the business's.
  const phone = access.tenant.role === "owner" ? displayPhoneText(access.user.phone) : null;
  const brand = brandForHostHeader(request.headers.get("host"));
  const bytes = await joinPdfs(await Promise.all(groupRuns(pieces).map((run) => renderRun(run, customer, phone, brand))), brand);

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileNameFor(pieces, customer, brand)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
