import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ArrowIcon, StarIcon } from "@fynix/shared/ui/icons";
import { AddOnRow } from "@/components/panel/add-ons/add-on-row";
import { AddOnReturnRefresh } from "@/components/panel/add-ons/add-on-return-refresh";
import { PressReleaseList, type PressReleaseItem } from "@/components/panel/add-ons/press-release-list";
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
import { addOnById, addOnPrice, ADD_ONS, PREMIUM_ADD_ON_DISCOUNT_PERCENT } from "@/lib/add-ons";
import { isMonthlyAddOnId } from "@fynix/shared/lib/billing/add-ons";
import { UPGRADE_PATH } from "@/lib/membership";
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

function pressReleaseItems(page: AddOnsPage): readonly PressReleaseItem[] {
  return page.pressReleases.map((release) => ({ id: release.id, status: release.status, boughtAt: release.paidAt ?? release.createdAt }));
}

/**
 * The digital-marketing services Fynix runs for a business (lib/add-ons.ts), open to every account: a free listing,
 * a Care client and a Premium member. Local SEO and Performance marketing are monthly subscriptions the customer buys,
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
        waiting={isAwaitingReturnWebhook(paymentNotice, readKeptAddOn(params.addOn), page.addOns, page.pressReleases.length)}
      />
      <ul className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
        {ADD_ONS.map((addOn) => {
          if (!isMonthlyAddOnId(addOn.id)) {
            return (
              <AddOnRow key={addOn.id} addOn={addOn} entry={null} price={page.pressReleasePrice} now={now} invoice={invoice}>
                <PressReleaseList items={pressReleaseItems(page)} />
              </AddOnRow>
            );
          }
          const entry = entryOf.get(addOn.id) ?? null;
          const price = entry !== null && entry.kind === "ready" ? entry.price : addOnPrice(addOn, premium);
          return <AddOnRow key={addOn.id} addOn={addOn} entry={entry} price={price} now={now} invoice={invoice} />;
        })}
      </ul>
      {premium ? (
        <p className="mt-6 inline-flex items-center gap-2 text-sm text-accent-deep">
          <StarIcon className="size-4" />
          {PREMIUM_ADD_ON_DISCOUNT_PERCENT}% off, as a Premium member.
        </p>
      ) : (
        <a href={UPGRADE_PATH} className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent">
          <StarIcon className="size-4" />
          Premium members get {PREMIUM_ADD_ON_DISCOUNT_PERCENT}% off
          <ArrowIcon className="size-4 transition-transform duration-300 ease-calm group-hover:translate-x-1" />
        </a>
      )}
    </>
  );
}
