import {
  countAppointments,
  findActivePlan,
  findBillingProfile,
  findBillingState,
  findBusinessTimeZone,
  findBusinessWebsiteUrl,
  findClientDetail,
  findListingPlacement,
  findPlaces,
  hasLiveProject,
  listEnabledModules,
  listPaymentsNeedingAttention,
  listPaymentsWithoutTaxInvoice,
  listTaxInvoicesForBusiness,
  listUpcomingDirectoryPromotions,
  PROJECT_STATUSES_PREVIEWABLE,
  readDirectoryStatuses,
  type ClientDetail,
  type ClientHours,
  type Plan,
  type DomainStatus,
} from "@brandbasket/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { TickIcon } from "@brandbasket/shared/ui/icons";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { clientListingKey, readClientTagNotice } from "@/lib/client-tags";
import { ClientAddOns } from "@/components/client-add-ons";
import { ClientChatbots } from "@/components/client-chatbots";
import { CopyTokenButton } from "@/components/copy-token-button";
import { ClientCharges } from "@/components/client-charges";
import { ClientListingTags } from "@/components/client-listing-tags";
import { ClientBillingDetails, ClientTaxInvoices } from "@/components/client-invoicing";
import { ClientFeatures } from "@/components/client-features";
import { ClientListing, type ListingNotice } from "@/components/client-listing";
import { readStaffChargeNotice } from "@brandbasket/shared/lib/billing/charge-notices";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { serverEnv } from "@/lib/server/env";
import { loadClientChatbots } from "@/lib/server/chatbots-admin";
import { readChatbotNotice } from "@/lib/chatbot-form";
import { listClientCharges } from "@/lib/server/charges-admin";
import { PaymentsNeedingAttention } from "@/components/payments-needing-attention";
import { ReceivedDateInput } from "@/components/received-date-input";
import { clientPaymentState, type ClientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { readBusinessModuleNotice } from "@brandbasket/shared/lib/business-module-notices";
import {
  MANUAL_PAYMENT_CONFIRM_FIELD,
  MANUAL_PAYMENT_RECEIVED_ON_FIELD,
  MANUAL_PAYMENT_REFERENCE_FIELD,
  MAX_MANUAL_REFERENCE_LENGTH,
} from "@brandbasket/shared/lib/billing/manual-payment-form";
import { MANUAL_PAYMENT_NOTICES, readManualPaymentNotice } from "@brandbasket/shared/lib/billing/manual-payment-notices";
import { websiteAloneNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { firstPaymentAmount, initialTermPhrase, monthlyPaymentAmount } from "@brandbasket/shared/lib/billing/terms";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import { isPlacementField } from "@brandbasket/shared/lib/directory/placement-form";
import { formatPromotionDay, promotionStatus, promotionTagDisplay } from "@brandbasket/shared/lib/directory/promotion";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import { WEEKDAYS } from "@brandbasket/shared/lib/onboarding/business-fields";
import { adminBrand } from "@/lib/brand";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { getSiteApiToken } from "@/lib/server/site-token";
import { describeStoredDay } from "@brandbasket/shared/lib/onboarding/hours";
import { DOMAIN_CONNECT_NOTICES, readDomainConnectNotice } from "@brandbasket/shared/lib/domain-connect-notices";
import { registrableDomain } from "@brandbasket/shared/lib/onboarding/domain-dns";
import { PROJECT_LAUNCH_NOTICES, readProjectLaunchNotice } from "@brandbasket/shared/lib/project-launch-notices";
import { PROJECT_PREVIEW_NOTICES, readProjectPreviewNotice } from "@brandbasket/shared/lib/project-preview-notices";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { ANSWER_STEPS, stepInfo } from "@brandbasket/shared/lib/onboarding/steps";
import { getStaffDb } from "@/lib/server/db";
import { displayPhoneText } from "@brandbasket/shared/server/phone-display";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES_WAITING_ON_US } from "@brandbasket/shared/lib/project-status";
import { Avatar } from "@/components/console/avatar";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { PLAN_TIER_LABELS } from "@brandbasket/shared/lib/billing/plan-tier";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Quiet, Section, type Fact } from "@/components/console/section";
import { StageTrack } from "@/components/console/stage-track";
import { attentionSection } from "@/lib/client-attention";
import { readAddOnNotice } from "@/lib/add-on-notices";
import { readInvoiceNotice } from "@/lib/invoice-notices";
import { clientStage, lateReason } from "@/lib/pipeline";
import { clientBillingDetails } from "@/lib/server/client-billing-details";
import {
  markDomainReadyAction,
  markLiveAction,
  switchDomainAction,
  rotateSiteApiTokenAction,
  recordManualPaymentAction,
  resolvePaymentAttentionAction,
  sendPreviewAction,
  setWebsiteUrlAction,
} from "./actions";

export const metadata: Metadata = { title: "Client" };

/** How many flagged payments one client page lists. */
const ATTENTION_SHOWN = 20;

/** A moment in the reader's own zone, named. */
function When({ date }: { readonly date: Date }): ReactElement {
  return <LocalDateTime iso={date.toISOString()} variant="timestamp" />;
}


/**
 * The bearer token this business's own website uses to read its blog, opening hours and announcement, and to send
 * booking requests.
 *
 * Shown in the clear on purpose: it grants read access to information that is already public, plus the ability to
 * submit booking requests, and staff need to copy it into the client's site project. Rotating breaks all of that on
 * that site until the new value is deployed there, which is why the button says so rather than just "Rotate".
 */
function SiteApiTokenBlock({ businessId, token }: { readonly businessId: string; readonly token: string | null }): ReactElement {
  return (
    <div>
      {token === null ? (
        <Quiet>
          No token yet. This is what their website uses to read their blog, opening hours and announcement, and to
          send booking requests — generate one when their website is ready.
        </Quiet>
      ) : (
        <div className="flex items-start gap-2 rounded-2xl bg-paper-deep py-2 pl-4 pr-2">
          <p className="min-w-0 flex-1 break-all py-1 font-mono text-sm">{token}</p>
          <CopyTokenButton value={token} what="site token" />
        </div>
      )}
      <form action={rotateSiteApiTokenAction} className="mt-4">
        <input type="hidden" name="businessId" value={businessId} />
        <button type="submit" className={buttonSecondary}>
          {token === null ? "Generate token" : "Replace with a new token"}
        </button>
        <p className={hintClasses}>
          {token === null
            ? `Paste it into their site project as ${adminBrand().id.toUpperCase()}_SITE_TOKEN.`
            : "Replacing it stops their blog, opening hours, announcement and booking requests until the new token is deployed to their site."}
        </p>
      </form>
    </div>
  );
}

/**
 * Where this client's own website lives. The customer's "Preview on my website" button opens `<this>/blog/preview`,
 * and is hidden until it is set. Before launch that is their Vercel address; after, their domain.
 */
function WebsiteUrlBlock({
  businessId,
  websiteUrl,
  notice,
}: {
  readonly businessId: string;
  readonly websiteUrl: string | null;
  readonly notice: "saved" | "invalid" | null;
}): ReactElement {
  return (
    <form action={setWebsiteUrlAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <label htmlFor="website-url" className={labelClasses}>
        Website address
      </label>
      <p className={hintClasses}>
        Their Vercel address or their domain, e.g. https://their-site.vercel.app. Leave it empty to hide blog previews.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <input
          id="website-url"
          name="websiteUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={websiteUrl ?? ""}
          aria-invalid={notice === "invalid" ? true : undefined}
          className={`${fieldClasses} min-w-0 flex-1 basis-64`}
        />
        <GatedSubmitButton className={buttonSecondary} pendingLabel="Saving…">
          Save
        </GatedSubmitButton>
      </div>
      {notice === null ? null : (
        <p role="status" className={notice === "invalid" ? "mt-2 text-sm text-accent" : "mt-2 text-sm text-ink-soft"}>
          {notice === "invalid" ? "Use an https:// address with no path, like https://their-site.vercel.app." : "Saved."}
        </p>
      )}
    </form>
  );
}

/** The Listing section's notice from `?listing=` (and `?listingField=` for which field was wrong). */
function readListingNotice(
  listing: string | string[] | undefined,
  field: string | string[] | undefined,
): ListingNotice | null {
  if (listing === "saved") return { kind: "saved" };
  if (listing === "taken") return { kind: "taken" };
  if (listing === "place-taken") return { kind: "place-taken" };
  if (listing === "place-added") return { kind: "place-added" };
  if (listing === "place-fixed") return { kind: "place-fixed" };
  if (listing === "no-places") return { kind: "no-places" };
  if (listing === "invalid") {
    return { kind: "invalid", field: typeof field === "string" && isPlacementField(field) ? field : null };
  }
  return null;
}

function Facts({ items }: { readonly items: readonly Fact[] }): ReactElement {
  return <FactList items={items} />;
}

/** Every period for the day, with "(next day)" on one that closes after midnight. */
function hoursForDay(hours: readonly ClientHours[], day: number): string {
  return describeStoredDay(hours.filter((row) => row.dayOfWeek === day)) ?? "Not given";
}

/** A link the customer typed: clickable only when it is https, otherwise shown as plain text. */
function CustomerLink({ url }: { readonly url: string }): ReactElement {
  const href = safeExternalHref(url);
  if (href === null) return <span className="break-all">{url}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="link-underline break-all">
      {url}
    </a>
  );
}

function addressOf(profile: NonNullable<ClientDetail["profile"]>): string | null {
  const lines = [
    profile.addressLine1,
    profile.addressLine2,
    [profile.city, profile.region, profile.postalCode].filter((part) => part !== null).join(", "),
    profile.country,
  ].filter((line): line is string => line !== null && line !== "");
  return lines.length === 0 ? null : lines.join("\n");
}

const PAYMENT_LABELS: Readonly<Record<ClientPaymentState["kind"], string>> = {
  paid: "Paid",
  lapsed: "Lapsed",
  "checkout-open": "Not paid (checkout started)",
  "not-paid": "Not paid",
};

function BillingFacts({ client, state }: { readonly client: ClientDetail; readonly state: ClientPaymentState }): ReactElement {
  const subscription = client.billing.subscription;
  const hasPaid = state.kind === "paid" || state.kind === "lapsed";
  const manual = hasPaid ? state.manual : null;
  return (
    <Facts
      items={[
        { label: "Payment", value: PAYMENT_LABELS[state.kind] },
        {
          label: "First payment",
          value: hasPaid ? (
            <>
              {state.firstAmount}
              {state.firstPaidAt === null ? null : (
                <>
                  {" on "}
                  <When date={state.firstPaidAt} />
                </>
              )}
              {manual === null ? null : " (recorded by hand)"}
            </>
          ) : null,
        },
        {
          label: "Paid through",
          value: hasPaid && state.paidThroughAt !== null ? <When date={state.paidThroughAt} /> : null,
        },
        {
          label: "First term ends",
          value: subscription?.commitmentEndsAt ? <When date={subscription.commitmentEndsAt} /> : null,
        },
        ...(manual === null
          ? []
          : [
              {
                label: "Recorded by",
                value: manual.recordedBy?.name ?? "Not recorded (entered before this was tracked)",
              },
              { label: "Bank or payment reference", value: manual.reference },
              {
                label: "Money received on",
                value: manual.receivedOn === null ? null : formatStoredDate(manual.receivedOn),
              },
            ]),
      ]}
    />
  );
}

interface ManualPaymentFormProps {
  readonly businessId: string;
  readonly plan: Plan;
  /** The client paid before and lapsed: this payment reactivates their plan rather than being their first. */
  readonly reactivating: boolean;
}

function ManualPaymentForm({ businessId, plan, reactivating }: ManualPaymentFormProps): ReactElement {
  // Exactly what recordManualFirstPayment records, so the box staff tick names the money that must have arrived.
  const websiteCents = websiteAloneNetCents(plan.currency);
  const amount = reactivating ? monthlyPaymentAmount(plan, websiteCents) : firstPaymentAmount(plan, websiteCents);
  return (
    <form action={recordManualPaymentAction} className="mt-8 border-t border-line pt-6">
      <h3 className="font-serif text-xl">{reactivating ? "Reactivate with a manual payment" : "Record a manual payment"}</h3>
      {reactivating ? (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
          For money that arrived outside the payment provider, such as a bank transfer. It records {amount}, one month
          from today at today’s price with no coupon, ends their lapsed plan and brings their website back. Your name,
          the reference and the date are kept with it.
        </p>
      ) : (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
          For money that arrived outside the payment provider, such as a bank transfer. It records {amount}, covering{" "}
          {initialTermPhrase(plan.initialTermMonths, "their")} from today, exactly as a checkout would, and marks the lead
          paid. Your name, the reference and the date are kept with it. The customer then sends their setup from Check
          and send.
        </p>
      )}
      <input type="hidden" name="businessId" value={businessId} />
      <div className="mt-5 grid max-w-xl gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="manual-reference" className={labelClasses}>
            Bank or payment reference<RequiredMark />
          </label>
          <input
            id="manual-reference"
            name={MANUAL_PAYMENT_REFERENCE_FIELD}
            type="text"
            required
            maxLength={MAX_MANUAL_REFERENCE_LENGTH}
            autoComplete="off"
            className={fieldClasses}
          />
        </div>
        <div>
          <label htmlFor="manual-received-on" className={labelClasses}>
            Date the money arrived<RequiredMark />
          </label>
          <ReceivedDateInput id="manual-received-on" name={MANUAL_PAYMENT_RECEIVED_ON_FIELD} />
        </div>
      </div>
      <label className="mt-5 flex items-start gap-3 text-sm">
        <input type="checkbox" name={MANUAL_PAYMENT_CONFIRM_FIELD} value="yes" required className={checkboxClasses} />
        <span>
          I’ve checked that {amount} has arrived.
          <RequiredMark />
        </span>
      </label>
      <GatedSubmitButton className={`${buttonSecondary} mt-5`} pendingLabel="Recording…">
        {reactivating ? "Reactivate" : "Record a manual payment"}
      </GatedSubmitButton>
    </form>
  );
}

const SEND_PREVIEW_STATUSES = new Set(PROJECT_STATUSES_PREVIEWABLE);

function SendPreviewForm({ businessId }: { readonly businessId: string }): ReactElement {
  return (
    <form action={sendPreviewAction}>
      <p className="max-w-xl text-ink-soft">
        Paste the link to what you’ve built. It’s emailed to the owner and shown on their own dashboard straight
        away.
      </p>
      <input type="hidden" name="businessId" value={businessId} />
      <div className="mt-5 max-w-xl">
        <label htmlFor="preview-url" className={labelClasses}>
          Preview link<RequiredMark />
        </label>
        <input
          id="preview-url"
          name="previewUrl"
          type="url"
          required
          placeholder="https://…"
          autoComplete="off"
          className={fieldClasses}
        />
      </div>
      <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Sending…">
        Send preview
      </GatedSubmitButton>
    </form>
  );
}

function MarkLiveForm({ businessId, note }: { readonly businessId: string; readonly note?: string }): ReactElement {
  return (
    <form action={markLiveAction}>
      <p className="max-w-xl text-ink-soft">
        {note ?? "Once the real site is deployed and DNS points at their domain, mark it live here. The client is emailed their website address."}
      </p>
      <input type="hidden" name="businessId" value={businessId} />
      <button type="submit" className={`${buttonPrimary} mt-5`}>
        Mark live
      </button>
    </form>
  );
}

const DNS_STATUS_TEXT: Readonly<Partial<Record<DomainStatus, string>>> = {
  pending: "Not asked yet",
  awaiting_dns: "Waiting for them to change their DNS",
  misconfigured: "Their DNS points somewhere else",
  verifying: "Connected. Check it loads, then mark it live",
  active: "Live",
};

/**
 * The last step before launch. A free address needs nothing but the button. A domain of the customer's own goes in order:
 * staff add it to the website's host and ask the customer to change their DNS (the customer's card only appears then);
 * the customer's own check moves it to "connected", and then it is marked live.
 */
function GoLivePanel({
  businessId,
  domain,
  previewUrl,
}: {
  readonly businessId: string;
  readonly domain: { readonly hostname: string; readonly status: DomainStatus } | null;
  readonly previewUrl: string | null;
}): ReactElement {
  if (domain === null || isTemporarySubdomain(domain.hostname)) return <MarkLiveForm businessId={businessId} />;

  const root = registrableDomain(domain.hostname);
  return (
    <div className="max-w-2xl space-y-8">
      <Facts
        items={[
          { label: "Their own domain", value: domain.hostname },
          ...(previewUrl === null ? [] : [{ label: "Site to add it to", value: <CustomerLink url={previewUrl} /> }]),
          { label: "DNS", value: DNS_STATUS_TEXT[domain.status] ?? domain.status },
        ]}
      />

      {domain.status === "pending" ? (
        <form action={markDomainReadyAction}>
          <ol className="list-decimal space-y-2 pl-5 text-ink-soft">
            <li>
              Open the Vercel project behind the site link above and add <span className="font-medium text-ink">{domain.hostname}</span>
              {domain.hostname === root ? <> and <span className="font-medium text-ink">www.{root}</span></> : null} under Domains.
            </li>
            <li>Check that deployment is the project’s production deployment, not a one-off preview build.</li>
            <li>Then ask the customer to change their DNS. They’re emailed, and the records show on their dashboard.</li>
          </ol>
          <input type="hidden" name="businessId" value={businessId} />
          <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Emailing…">
            Ready for customer’s DNS
          </GatedSubmitButton>
        </form>
      ) : null}

      {domain.status === "awaiting_dns" || domain.status === "misconfigured" ? (
        <p className="max-w-xl text-ink-soft">
          They’ve been asked to add the records and can check it themselves. You’re emailed the moment it’s connected.
        </p>
      ) : null}

      <MarkLiveForm
        businessId={businessId}
        note={
          domain.status === "verifying"
            ? "Their DNS now points at the site. Open their address, check it loads, then mark it live. The client is emailed their website address."
            : "Only once their address loads the site, however it was connected. The client is emailed their website address."
        }
      />
    </div>
  );
}

/**
 * A live customer has asked to move from the free address to a domain of their own. Same order as the first launch: add it to the
 * website's host and ask them to connect it, then (once their DNS is found connected) switch. The free address keeps working
 * throughout, and should forward to the new domain afterwards, which is set up in the host.
 */
function MoveDomainPanel({
  businessId,
  current,
  movingTo,
  siteUrl,
}: {
  readonly businessId: string;
  readonly current: string;
  readonly movingTo: { readonly hostname: string; readonly status: DomainStatus };
  readonly siteUrl: string | null;
}): ReactElement {
  const root = registrableDomain(movingTo.hostname);
  return (
    <div className="max-w-2xl space-y-8">
      <Facts
        items={[
          { label: "Their address now", value: current },
          { label: "Wants to move to", value: movingTo.hostname },
          ...(siteUrl === null ? [] : [{ label: "Site to add it to", value: <CustomerLink url={siteUrl} /> }]),
          { label: "DNS", value: DNS_STATUS_TEXT[movingTo.status] ?? movingTo.status },
        ]}
      />

      {movingTo.status === "pending" ? (
        <form action={markDomainReadyAction}>
          <ol className="list-decimal space-y-2 pl-5 text-ink-soft">
            <li>
              Open the Vercel project behind the site link above and add <span className="font-medium text-ink">{movingTo.hostname}</span>
              {movingTo.hostname === root ? <> and <span className="font-medium text-ink">www.{root}</span></> : null} under Domains.
            </li>
            <li>Then ask the customer to change their DNS. They’re emailed, and the records show on their dashboard. Their free address keeps working.</li>
          </ol>
          <input type="hidden" name="businessId" value={businessId} />
          <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Emailing…">
            Ready for customer’s DNS
          </GatedSubmitButton>
        </form>
      ) : null}

      {movingTo.status === "awaiting_dns" || movingTo.status === "misconfigured" ? (
        <p className="max-w-xl text-ink-soft">
          They’ve been asked to add the records and can check it themselves. You’re emailed the moment it’s connected.
        </p>
      ) : null}

      {movingTo.status === "verifying" ? (
        <form action={switchDomainAction}>
          <p className="max-w-xl text-ink-soft">
            Their DNS now points at the site. Open <span className="font-medium text-ink">{movingTo.hostname}</span> and check it loads. Then, in
            the Vercel project, redirect <span className="font-medium text-ink">{current}</span> to it, so old links keep working, and switch.
            The client is emailed their new address.
          </p>
          <input type="hidden" name="businessId" value={businessId} />
          <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Switching…">
            Switch to their domain
          </GatedSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { businessId } = await params;
  await logStaffAccess({ staffUserId: user.id, action: "client.view", targetType: "business", targetId: businessId, businessId });
  const db = getStaffDb();
  const client = await findClientDetail(db, businessId);
  if (client === null) notFound();
  const sp = await searchParams;
  const notice = readManualPaymentNotice(sp.payment);
  const previewNotice = readProjectPreviewNotice(sp.preview);
  const launchNotice = readProjectLaunchNotice(sp.launch);
  const dnsNotice = readDomainConnectNotice(sp.dns);
  const paymentState = clientPaymentState(client.billing, new Date());
  const canRecordPayment =
    paymentState.kind === "not-paid" || paymentState.kind === "checkout-open" || paymentState.kind === "lapsed";
  const renderedAt = new Date();
  const invoiced = client.currency === "INR";
  const [
    plan,
    flagged,
    siteApiToken,
    websiteUrl,
    timeZone,
    enabledModules,
    appointmentCounts,
    charges,
    billingState,
    listingPlacement,
    listingLive,
    promotions,
    billingProfile,
    taxInvoices,
    missingInvoices,
    clientAddOns,
    clientChatbots,
  ] = await Promise.all([
    canRecordPayment ? findActivePlan(db, client.currency, client.tier) : Promise.resolve(null),
    listPaymentsNeedingAttention(db, { businessId: client.businessId, limit: ATTENTION_SHOWN }),
    getSiteApiToken(client.businessId),
    findBusinessWebsiteUrl(db, client.businessId),
    findBusinessTimeZone(db, client.businessId),
    listEnabledModules(db, client.businessId),
    countAppointments(db, client.businessId),
    listClientCharges(client.businessId),
    findBillingState(db, client.businessId),
    findListingPlacement(db, client.businessId),
    hasLiveProject(db, client.businessId),
    listUpcomingDirectoryPromotions(db, client.businessId, renderedAt),
    // Only payments in rupees get tax invoices (D1), so a dollar client has nothing to show or correct here.
    invoiced ? findBillingProfile(db, client.businessId) : Promise.resolve(null),
    invoiced ? listTaxInvoicesForBusiness(db, client.businessId) : Promise.resolve([]),
    invoiced ? listPaymentsWithoutTaxInvoice(db, client.businessId) : Promise.resolve([]),
    loadClientAddOns(client.businessId, renderedAt),
    loadClientChatbots(client.businessId),
  ]);
  const chargesNotice = readStaffChargeNotice(sp.charges);
  const websiteNotice = sp.website === "saved" || sp.website === "invalid" ? sp.website : null;
  const featuresNotice = readBusinessModuleNotice(sp.features);
  const listingNotice = readListingNotice(sp.listing, sp.listingField);
  const invoiceNotice = readInvoiceNotice(sp.invoice);
  const addOnNotice = readAddOnNotice(sp.addOns);
  const chatbotNotice = readChatbotNotice(sp.chatbots);
  const tagsNotice = readClientTagNotice(sp.tags);
  const listingPlaceId = listingPlacement?.placeId ?? null;
  // The tags are kept under the listing's place, or under its key until it has one.
  const listingKey = listingPlacement === null ? null : clientListingKey(listingPlacement);
  const listingStatus =
    listingKey === null
      ? undefined
      : (await readDirectoryStatuses(db, listingPlaceId === null ? { placeIds: [], unplacedKeys: [listingKey] } : { placeIds: [listingPlaceId], unplacedKeys: [] })).get(
          listingPlaceId ?? listingKey,
        );
  const listingPlace = listingPlaceId === null ? null : ((await findPlaces(db, [listingPlaceId])).get(listingPlaceId) ?? null);
  const promotion = promotionStatus(promotions, renderedAt);
  const listingPromotion =
    promotion.running === null || promotion.endsAt === null
      ? null
      : {
          label: promotionTagDisplay(promotion.running.tag),
          until: formatPromotionDay(promotion.endsAt),
          visible: promotion.visible,
        };

  const { profile, project } = client;
  const done = new Set(client.completedSteps);
  const logo = client.media.filter((asset) => asset.purpose === "logo");
  const photos = client.media.filter((asset) => asset.purpose === "photo");

  const stage = clientStage(client);
  const now = new Date();
  // Same rule as the Journey's ring: a promised preview we still owe, past its date.
  const late =
    project !== null &&
    project.slaDueAt !== null &&
    PROJECT_STATUSES_WAITING_ON_US.includes(project.status) &&
    project.slaDueAt.getTime() < now.getTime()
      ? lateReason(project.slaDueAt, now)
      : null;
  const nextStep =
    project === null || project.onboardingSubmittedAt === null
      ? null
      : SEND_PREVIEW_STATUSES.has(project.status)
        ? "preview"
        : project.status === "approved"
          ? "live"
          : null;
  // One source of truth for the page's single attention section, so a late preview and a missing invoice cannot both claim it.
  const attention = attentionSection({
    flaggedCount: flagged.length,
    previewIsLate: nextStep === "preview" && late !== null,
    missingInvoiceCount: invoiced ? missingInvoices.length : 0,
  });

  return (
    <>
      <PageHeader
        back={{ href: "/clients", label: "Clients" }}
        lead={<Avatar id={client.businessId} name={client.businessName} size="lg" />}
        title={client.businessName}
        meta={
          <>
            {client.owner?.name ?? "No owner"} · {PLAN_TIER_LABELS[client.tier]} plan ·{" "}
            {project === null ? "No project yet" : PROJECT_STATUS_LABELS[project.status]} · Billed in{" "}
            {BILLING_CURRENCY_LABELS[client.currency]}
          </>
        }
      >
        <StageTrack stage={stage} />
      </PageHeader>

      {notice === null && previewNotice === null && launchNotice === null && dnsNotice === null ? null : (
        <div className="mt-10 space-y-3">
          {notice === null ? null : (
            <Notice tone={MANUAL_PAYMENT_NOTICES[notice].ok ? "ok" : "problem"}>{MANUAL_PAYMENT_NOTICES[notice].text}</Notice>
          )}
          {previewNotice === null ? null : (
            <Notice tone={PROJECT_PREVIEW_NOTICES[previewNotice].ok ? "ok" : "problem"}>
              {PROJECT_PREVIEW_NOTICES[previewNotice].text}
            </Notice>
          )}
          {launchNotice === null ? null : (
            <Notice tone={PROJECT_LAUNCH_NOTICES[launchNotice].ok ? "ok" : "problem"}>
              {PROJECT_LAUNCH_NOTICES[launchNotice].text}
            </Notice>
          )}
          {dnsNotice === null ? null : (
            <Notice tone={DOMAIN_CONNECT_NOTICES[dnsNotice].ok ? "ok" : "problem"}>{DOMAIN_CONNECT_NOTICES[dnsNotice].text}</Notice>
          )}
        </div>
      )}

      <div className="mt-12">
        {flagged.length === 0 ? null : (
          <Section
            tone="attention"
            title={flagged.length === 1 ? "A payment needs attention" : `${flagged.length} payments need attention`}
            aside="They were told we received it and will be in touch. They aren’t asked to pay again until it’s sorted."
          >
            <PaymentsNeedingAttention payments={flagged} linkToClient={false} resolveAction={resolvePaymentAttentionAction} />
          </Section>
        )}

        {nextStep === "preview" ? (
          <Section
            title="Send a preview"
            tone={attention === "preview" ? "attention" : "plain"}
            aside={late === null ? "The next step" : <span className="font-semibold text-accent">{late}</span>}
          >
            <SendPreviewForm businessId={client.businessId} />
          </Section>
        ) : null}
        {client.movingTo !== null && client.domain !== null ? (
          <Section title="Move to their own domain" id="domain" aside="Asked by the customer">
            <MoveDomainPanel
              businessId={client.businessId}
              current={client.domain.hostname}
              movingTo={client.movingTo}
              siteUrl={websiteUrl ?? project?.previewUrl ?? null}
            />
          </Section>
        ) : null}
        {nextStep === "live" ? (
          <Section title="Go live" id="domain" aside="The next step">
            <GoLivePanel businessId={client.businessId} domain={client.domain} previewUrl={project?.previewUrl ?? null} />
          </Section>
        ) : null}

        <Section title="Owner">
          <Facts
            items={[
              { label: "Name", value: client.owner?.name ?? "No owner on this business" },
              {
                label: "Email",
                value:
                  client.owner === null || client.owner.email === null ? null : (
                    <a href={`mailto:${client.owner.email}`} className="link-underline break-all">
                      {client.owner.email}
                    </a>
                  ),
              },
              // An owner who joined on the entry page signs in with this number and has no email address.
              ...(client.owner?.phone == null
                ? []
                : [{ label: "Mobile", value: <span className="tabular-nums">{displayPhoneText(client.owner.phone) ?? client.owner.phone}</span> }]),
              { label: "Billed in", value: BILLING_CURRENCY_LABELS[client.currency] },
              { label: "Joined", value: <When date={client.createdAt} /> },
            ]}
          />
        </Section>

        <Section title="Build">
          {project === null ? (
            <Quiet>No project yet.</Quiet>
          ) : project.onboardingSubmittedAt === null ? (
            <Quiet>Still filling in their setup. Nothing has been sent to us yet.</Quiet>
          ) : (
            <>
              <Facts
                items={[
                  { label: "Sent to us", value: <When date={project.onboardingSubmittedAt} /> },
                  {
                    label: "First preview due",
                    value: project.slaDueAt === null ? null : <When date={project.slaDueAt} />,
                  },
                  ...(project.previewUrl === null
                    ? []
                    : [
                        { label: "Preview link", value: <CustomerLink url={project.previewUrl} /> },
                        {
                          label: "Preview sent",
                          value: project.previewSentAt === null ? null : <When date={project.previewSentAt} />,
                        },
                      ]),
                  ...(project.revisionRoundsGranted === 0
                    ? []
                    : [{ label: "Revision rounds used", value: String(project.revisionRoundsGranted) }]),
                  ...(project.launchedAt === null
                    ? []
                    : [{ label: "Launched", value: <When date={project.launchedAt} /> }]),
                ]}
              />
              {project.status === "revisions" ? (
                <p className="mt-6 max-w-xl border-l-2 border-gold-deep py-1 pl-4 text-sm leading-relaxed">
                  They asked for changes and were pointed at booking a call to go through what to change.
                </p>
              ) : null}
            </>
          )}
        </Section>

        <Section title="Setup progress" aside={`${ANSWER_STEPS.filter((step) => done.has(step)).length} of ${ANSWER_STEPS.length} done`}>
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {ANSWER_STEPS.map((step) => (
              <li key={step} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex size-6 items-center justify-center rounded-full ${done.has(step) ? "bg-accent text-paper" : "ring-2 ring-inset ring-ink-soft/65"}`}
                >
                  {done.has(step) ? <TickIcon className="size-3.5" /> : null}
                </span>
                <span className={done.has(step) ? "" : "text-ink-soft"}>
                  {stepInfo(step).title}
                  <span className="sr-only">{done.has(step) ? " (done)" : " (not done)"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Billing">
          <BillingFacts client={client} state={paymentState} />
          {canRecordPayment && plan !== null ? <ManualPaymentForm businessId={client.businessId} plan={plan} reactivating={paymentState.kind === "lapsed"} /> : null}
          {canRecordPayment && plan === null ? (
            <p className="mt-6 text-sm text-ink-soft">
              There is no active plan for {BILLING_CURRENCY_LABELS[client.currency]}, so no payment can be recorded.
            </p>
          ) : null}
        </Section>

        {invoiced ? (
          <>
            <ClientBillingDetails
              businessId={client.businessId}
              details={clientBillingDetails({ profile: billingProfile, businessName: client.businessName, onboarding: client.profile })}
            />
            <ClientTaxInvoices
              businessId={client.businessId}
              invoices={taxInvoices}
              missing={missingInvoices}
              notice={invoiceNotice}
              attentionTaken={attention !== "invoices"}
            />
          </>
        ) : null}

        <ClientCharges
          businessId={client.businessId}
          charges={charges}
          plan={billingState?.plan ?? null}
          notice={chargesNotice}
        />

        <ClientAddOns
          businessId={client.businessId}
          addOns={clientAddOns.addOns}
          bundledAddOns={clientAddOns.bundledAddOns}
          pressReleases={clientAddOns.pressReleases}
          options={clientAddOns.options}
          notice={addOnNotice}
        />

        <ClientChatbots
          businessId={client.businessId}
          chatbots={clientChatbots}
          notice={chatbotNotice}
          webhookUrl={`${serverEnv().APP_ORIGIN}/api/webhooks/oyechats`}
        />

        <Section title="Business details">
          {profile === null ? (
            <Quiet>Not filled in yet.</Quiet>
          ) : (
            <Facts
              items={[
                { label: "Name on the website", value: profile.displayName },
                { label: "Tagline", value: profile.tagline },
                { label: "Public phone", value: displayPhoneText(profile.phone) },
                { label: "Public email", value: profile.email },
                { label: "Address", value: addressOf(profile) },
                { label: "Areas they serve", value: profile.serviceAreas },
                {
                  label: "Google Business Profile",
                  value:
                    profile.googleBusinessUrl === null ? null : <CustomerLink url={profile.googleBusinessUrl} />,
                },
                { label: "About the business", value: profile.description },
              ]}
            />
          )}
        </Section>

        <Section title="Opening hours">
          {client.hours.length === 0 ? (
            <Quiet>Not filled in yet.</Quiet>
          ) : (
            <dl className="max-w-md divide-y divide-line">
              {WEEKDAYS.map((label, day) => (
                <div key={label} className="flex justify-between gap-4 py-2.5">
                  <dt>{label}</dt>
                  <dd className="text-right tabular-nums text-ink-soft">{hoursForDay(client.hours, day)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>

        <Section title="Services" aside={client.services.length === 0 ? undefined : `${client.services.length} listed`}>
          {client.services.length === 0 ? (
            <Quiet>None added yet.</Quiet>
          ) : (
            <ol className="max-w-2xl divide-y divide-line">
              {client.services.map((service) => (
                <li key={service.id} className="py-3 first:pt-0">
                  <p className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{service.name}</span>
                    {service.priceText === null ? null : <span className="tabular-nums text-ink-soft">{service.priceText}</span>}
                  </p>
                  {service.summary === null ? null : <p className="mt-1 text-sm text-ink-soft">{service.summary}</p>}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Domain">
          {client.domain === null ? (
            <Quiet>Not given yet.</Quiet>
          ) : isTemporarySubdomain(client.domain.hostname) ? (
            <Facts
              items={[
                { label: "Domain", value: client.domain.hostname },
                {
                  label: "Ownership",
                  value: "Our temporary address, not their own domain yet",
                },
              ]}
            />
          ) : (
            <Facts
              items={[
                { label: "Domain", value: client.domain.hostname },
                { label: "DNS", value: DNS_STATUS_TEXT[client.domain.status] ?? client.domain.status },
                {
                  label: "Ownership",
                  value:
                    client.domain.ownerConfirmedAt === null ? (
                      "Not confirmed"
                    ) : (
                      <>
                        Confirmed <When date={client.domain.ownerConfirmedAt} />
                      </>
                    ),
                },
              ]}
            />
          )}
        </Section>

        <Section title="Their website">
          <div className="max-w-2xl space-y-8">
            <WebsiteUrlBlock businessId={client.businessId} websiteUrl={websiteUrl} notice={websiteNotice} />
            <div>
              <h3 className={labelClasses}>Site API token</h3>
              <div className="mt-2">
                <SiteApiTokenBlock businessId={client.businessId} token={siteApiToken} />
              </div>
            </div>
          </div>
        </Section>

        {adminBrand().sellsDirectory ? (
          <Section title="Listing" id="listing" aside={adminBrand().directoryName}>
            <ClientListing
              businessId={client.businessId}
              displayName={profile?.displayName ?? client.businessName}
              placement={listingPlacement}
              place={listingPlace}
              live={listingLive}
              promotion={listingPromotion}
              notice={listingNotice}
            />
            {listingPlacement === null ? null : (
              <div className="mt-10">
                <ClientListingTags
                  businessId={client.businessId}
                  businessName={profile?.displayName ?? client.businessName}
                  staffVerified={listingStatus !== undefined}
                  trusted={listingStatus?.trusted ?? false}
                  notice={tagsNotice}
                />
              </div>
            )}
          </Section>
        ) : null}

        <Section title="Features" id="features" aside="Time zone and modules">
          <ClientFeatures
            businessId={client.businessId}
            timeZone={timeZone}
            enabledModules={enabledModules}
            appointmentCounts={appointmentCounts}
            notice={featuresNotice}
          />
        </Section>

        <Section title="Notes for the builder">
          {client.brief === null ? (
            <Quiet>Nothing yet.</Quiet>
          ) : (
            <Facts
              items={[
                { label: "Anything we should know", value: client.brief.notesForBuilder },
                { label: "How it should feel", value: client.brief.styleLikes },
                {
                  label: "Websites they like",
                  value:
                    client.brief.referenceUrls.length === 0 ? null : (
                      <ul className="space-y-1">
                        {client.brief.referenceUrls.map((url, index) => (
                          // Links may repeat, so the position is the key.
                          <li key={index}>
                            <CustomerLink url={url} />
                          </li>
                        ))}
                      </ul>
                    ),
                },
              ]}
            />
          )}
        </Section>

        <Section title="Logo and photos" aside={client.media.length === 0 ? undefined : `${client.media.length} uploaded`}>
          {client.media.length === 0 ? (
            <Quiet>Nothing uploaded yet.</Quiet>
          ) : (
            <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
              {[...logo, ...photos].map((asset) => (
                <li key={asset.id}>
                  <a href={`/media/${asset.id}`} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-2xl">
                    {/* Served from our own route with staff access checked; next/image would cache it publicly. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/media/${asset.id}`}
                      alt={asset.altText ?? ""}
                      width={asset.width}
                      height={asset.height}
                      loading="lazy"
                      className="aspect-square w-full bg-paper-deep object-cover transition-transform duration-500 ease-calm group-hover:scale-[1.03]"
                    />
                  </a>
                  <p className="mt-2 text-sm font-medium">{asset.purpose === "logo" ? "Logo" : "Photo"}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{asset.altText ?? "No description"}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
