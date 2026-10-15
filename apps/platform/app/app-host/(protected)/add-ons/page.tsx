import type { Metadata } from "next";
import type { ReactElement } from "react";
import { AddOnRow } from "@/components/panel/add-ons/add-on-row";
import { AddOnReturnRefresh } from "@/components/panel/add-ons/add-on-return-refresh";
import { addOnDate, keptNoticeDate } from "@/lib/billing/add-on-copy";
import type { AddOnInvoiceNote } from "@/lib/billing/add-on-form";
import { isAwaitingReturnWebhook } from "@/lib/billing/add-on-return-refresh";
import {
  ADD_ON_PAYMENT_NOTICES,
  keptNoticeText,
  readAddOnPaymentNotice,
  readKeptAddOn,
  type AddOnPaymentNotice,
} from "@/lib/billing/add-on-notices";
import { addOnById, addOnPrice, ADD_ONS } from "@/lib/add-ons";
import { loadAddOnsPage, type AddOnPageEntry, type AddOnsPage } from "@/lib/server/add-ons";
import { loadBillingDetailsView } from "@/lib/server/billing-details";
import { requireCustomerAccess } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Add-ons" };

interface AddOnsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface Notice {
  readonly ok: boolean;
  readonly text: string;
}

/**
 * What the banner says after a payment. A Keep it names its add-on and the old billing date it carries on past, read from
 * the add-on's state now (not from the address, so a made-up link cannot put words in the page's mouth). When the add-on
 * or the date cannot be worked out it falls back to a sentence that names neither.
 */
function noticeFor(notice: AddOnPaymentNotice, addOnParam: string | string[] | undefined, page: AddOnsPage): Notice {
  if (notice !== "kept") return ADD_ON_PAYMENT_NOTICES[notice];
  const kept = readKeptAddOn(addOnParam);
  const entry: AddOnPageEntry | undefined = kept === null ? undefined : page.addOns.find((candidate) => candidate.addOn === kept);
  const date = entry === undefined || entry.kind !== "ready" ? null : keptNoticeDate(entry.view);
  if (kept === null || date === null) return ADD_ON_PAYMENT_NOTICES.kept;
  return { ok: true, text: keptNoticeText(addOnById(kept).title, addOnDate(date)) };
}

function NoticeBanner({ ok, text }: Notice): ReactElement {
  return (
    <p
      role="status"
      className={`mt-6 max-w-3xl rounded-control px-4 py-3 text-sm ${ok ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep"}`}
    >
      {text}
    </p>
  );
}

/**
 * The digital-marketing services Fynix runs for a business (lib/add-ons.ts), open to every account: a free listing,
 * a Care client and a Premium member. Social media, Outreach and lead generation and Paid advertising are monthly subscriptions the customer buys,
 * pauses, cancels, resumes and keeps here; a press release is a one-time payment, listed below its row once bought.
 * Premium members see 10% off each price; for everyone else a line says where that comes from. Buying opens a dialog
 * with the price built up, then Razorpay.
 */
export default async function AddOnsPage({ searchParams }: AddOnsPageProps): Promise<ReactElement> {
  const customer = await requireCustomerAccess({ listingAccount: "allow" });
  const now = new Date();
  const [page, billingDetails, params] = await Promise.all([
    loadAddOnsPage(customer, now),
    loadBillingDetailsView(customer),
    searchParams,
  ]);
  const { premium } = page;
  const invoice: AddOnInvoiceNote =
    billingDetails === null
      ? { kind: "none" }
      : billingDetails.saved === null
        ? { kind: "missing" }
        : { kind: "saved", legalName: billingDetails.saved.legalName, gstin: billingDetails.saved.gstin };
  const paymentNotice = readAddOnPaymentNotice(params.payment);
  const entryOf = new Map(page.addOns.map((entry) => [entry.addOn, entry] as const));

  return (
    <>
      <h1 className="panel-title">Add-ons</h1>
      {paymentNotice === null ? null : <NoticeBanner {...noticeFor(paymentNotice, params.addOn, page)} />}
      <AddOnReturnRefresh
        waiting={isAwaitingReturnWebhook(paymentNotice, readKeptAddOn(params.addOn), page.addOns)}
      />
      <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
        {ADD_ONS.map((addOn) => {
          const entry = entryOf.get(addOn.id) ?? null;
          const price = entry !== null && entry.kind === "ready" ? entry.price : addOnPrice(addOn, premium);
          return <AddOnRow key={addOn.id} addOn={addOn} entry={entry} price={price} now={now} invoice={invoice} />;
        })}
      </ul>
    </>
  );
}
