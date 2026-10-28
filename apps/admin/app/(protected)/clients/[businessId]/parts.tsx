import { type ClientDetail, type ClientHours, type DomainStatus, type HostedSite, type Plan } from "@brandbasket/db";
import type { ReactElement } from "react";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { CopyTokenButton } from "@/components/copy-token-button";
import type { ListingNotice } from "@/components/client-listing";
import type { ClientPackageFacts } from "@/lib/client-package";
import { ReceivedDateInput } from "@/components/received-date-input";
import type { ClientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import {
  MANUAL_PAYMENT_CONFIRM_FIELD,
  MANUAL_PAYMENT_RECEIVED_ON_FIELD,
  MANUAL_PAYMENT_REFERENCE_FIELD,
  MAX_MANUAL_REFERENCE_LENGTH,
} from "@brandbasket/shared/lib/billing/manual-payment-form";
import { couponPhrase, type CarriedCodeHint } from "@/lib/manual-reactivation-hint";
import { firstPaymentAmount, initialTermPhrase, monthlyPaymentAmount } from "@brandbasket/shared/lib/billing/terms";
import { isPlacementField } from "@brandbasket/shared/lib/directory/placement-form";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import { adminBrand } from "@/lib/brand";
import { trackingSnippet } from "@/lib/tracking-snippet";
import { isTemporarySubdomain } from "@brandbasket/shared/lib/onboarding/domain-form";
import { describeStoredDay } from "@brandbasket/shared/lib/onboarding/hours";
import { registrableDomain } from "@brandbasket/shared/lib/onboarding/domain-dns";
import { safeExternalHref } from "@brandbasket/shared/lib/safe-link";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { FactList, Quiet, type Fact } from "@/components/console/section";
import {
  markDomainReadyAction,
  markLiveAction,
  recordManualPaymentAction,
  rotateSiteApiTokenAction,
  saveWebsiteHostingAction,
  sendPreviewAction,
  setWebsiteUrlAction,
  switchDomainAction,
} from "./actions";
import { createSiteKeyAction } from "./tracking-actions";

/** A moment in the reader's own zone, named. */
export function When({ date }: { readonly date: Date }): ReactElement {
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
export function SiteApiTokenBlock({ businessId, token }: { readonly businessId: string; readonly token: string | null }): ReactElement {
  return (
    <div>
      {token === null ? (
        <Quiet>
          No token yet. This is what their website uses to read their blog, opening hours and announcement, and to
          send booking requests. Generate one when their website is ready.
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
 * The line this business's website adds to report its own visits, taps and form sends to us, with no Google account (plan
 * 56). The key only names the business, so it is safe in a page. "Last event" is how staff check the install worked: load the
 * site once, reload this page, and it shows a time.
 */
export function TrackingBlock({
  businessId,
  siteKey,
  appOrigin,
  lastEventAt,
}: {
  readonly businessId: string;
  readonly siteKey: string | null;
  readonly appOrigin: string;
  readonly lastEventAt: Date | null;
}): ReactElement {
  if (siteKey === null) {
    return (
      <form action={createSiteKeyAction}>
        <Quiet>No tracking key yet. It lets their website report visits, call, WhatsApp and email taps and form sends to us.</Quiet>
        <input type="hidden" name="businessId" value={businessId} />
        <button type="submit" className={`${buttonSecondary} mt-4`}>
          Create tracking key
        </button>
      </form>
    );
  }
  const snippet = trackingSnippet({ appOrigin, key: siteKey });
  return (
    <div>
      <div className="flex items-start gap-2 rounded-2xl bg-paper-deep py-2 pl-4 pr-2">
        <p className="min-w-0 flex-1 break-all py-1 font-mono text-sm">{snippet}</p>
        <CopyTokenButton value={snippet} what="tracking snippet" />
      </div>
      <p className="mt-3 text-sm text-ink-2">{lastEventAt === null ? "No event received yet." : <>Last event received <When date={lastEventAt} />.</>}</p>
      <p className={hintClasses}>Add it to every page of their site. A site we build also gets data-bb-forms=&quot;server&quot; on the tag, so a form send is not counted twice.</p>
    </div>
  );
}

/**
 * Where this client's own website lives. The customer's "Preview on my website" button opens `<this>/blog/preview`,
 * and is hidden until it is set. Before launch that is their Vercel address; after, their domain.
 */
export function WebsiteUrlBlock({
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

/**
 * Which Vercel project the client's website runs on. If their plan lapses the hourly sync pauses this project there, and
 * unpauses it when they pay (docs/site-hosting.md). The status line says what the last sync found.
 */
export function HostingBlock({
  businessId,
  hosting,
  notice,
}: {
  readonly businessId: string;
  readonly hosting: HostedSite | null;
  readonly notice: "saved" | "invalid" | null;
}): ReactElement {
  return (
    <form action={saveWebsiteHostingAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <label htmlFor="vercel-project-id" className={labelClasses}>
        Vercel project
      </label>
      <p className={hintClasses}>The project id from its Settings on Vercel, like prj_abc123, and the team id like team_abc123 if it has one.</p>
      <div className="flex flex-wrap items-end gap-3">
        <input
          id="vercel-project-id"
          name="vercelProjectId"
          type="text"
          placeholder="prj_"
          defaultValue={hosting?.vercelProjectId ?? ""}
          aria-invalid={notice === "invalid" ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          className={`${fieldClasses} min-w-0 flex-1 basis-56`}
        />
        <input
          name="vercelTeamId"
          type="text"
          placeholder="team_"
          aria-label="Vercel team"
          defaultValue={hosting?.vercelTeamId ?? ""}
          aria-invalid={notice === "invalid" ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          className={`${fieldClasses} min-w-0 flex-1 basis-56`}
        />
        <GatedSubmitButton className={buttonSecondary} pendingLabel="Saving…">
          Save
        </GatedSubmitButton>
      </div>
      {notice === null ? null : (
        <p role="status" className={notice === "invalid" ? "mt-2 text-sm text-accent" : "mt-2 text-sm text-ink-soft"}>
          {notice === "invalid" ? "Use the project id (prj_…) and, if given, the team id (team_…)." : "Saved."}
        </p>
      )}
      {hosting === null ? null : (
        <p className="mt-2 text-sm text-ink-soft">
          {hosting.lastError !== null ? (
            `Last sync failed: ${hosting.lastError}`
          ) : hosting.pausedAt !== null ? (
            <>
              Paused since <When date={hosting.pausedAt} />.
            </>
          ) : (
            "Running."
          )}
        </p>
      )}
    </form>
  );
}

/** The Listing section's notice from `?listing=` (and `?listingField=` for which field was wrong). */
export function readListingNotice(
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

export function Facts({ items }: { readonly items: readonly Fact[] }): ReactElement {
  return <FactList items={items} />;
}

/** Every period for the day, with "(next day)" on one that closes after midnight. */
export function hoursForDay(hours: readonly ClientHours[], day: number): string {
  return describeStoredDay(hours.filter((row) => row.dayOfWeek === day)) ?? "Not given";
}

/** A link the customer typed: clickable only when it is https, otherwise shown as plain text. */
export function CustomerLink({ url }: { readonly url: string }): ReactElement {
  const href = safeExternalHref(url);
  if (href === null) return <span className="break-all">{url}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="link-underline break-all">
      {url}
    </a>
  );
}

export function addressOf(profile: NonNullable<ClientDetail["profile"]>): string | null {
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

export function BillingFacts({
  client,
  state,
  packageFacts,
}: {
  readonly client: ClientDetail;
  readonly state: ClientPaymentState;
  readonly packageFacts: ClientPackageFacts;
}): ReactElement {
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
        { label: "Package", value: packageFacts.package },
        { label: "Ad credit", value: packageFacts.adCredit },
        ...(packageFacts.forfeitedOn === null ? [] : [{ label: "Package offer ended", value: packageFacts.forfeitedOn }]),
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
  /** What the payment buys a month, GST included: the website for a first payment, the basket they lapsed with, less any code a lapse keeps, for a reactivation. */
  readonly netCents: number;
  /** The client paid before and lapsed: this payment reactivates their plan rather than being their first. */
  readonly reactivating: boolean;
  /** The code a lapse keeps, already taken off `netCents`; null for a first payment, a client who cancelled themselves or a code with no months left. */
  readonly carriedCode: CarriedCodeHint | null;
}

export function ManualPaymentForm({ businessId, plan, netCents, reactivating, carriedCode }: ManualPaymentFormProps): ReactElement {
  // Exactly what recordManualFirstPayment records, so the box staff tick names the money that must have arrived.
  const amount = reactivating ? monthlyPaymentAmount(plan, netCents) : firstPaymentAmount(plan, netCents);
  return (
    <form action={recordManualPaymentAction} className="mt-8 border-t border-line pt-6">
      <h3 className="font-serif text-xl">{reactivating ? "Reactivate with a manual payment" : "Record a manual payment"}</h3>
      {reactivating ? (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
          For money that arrived outside the payment provider, such as a bank transfer. It records {amount}, one month
          from today for the services they lapsed with, {couponPhrase(carriedCode)}, ends their lapsed plan and brings their website back. Your name,
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

export function SendPreviewForm({ businessId }: { readonly businessId: string }): ReactElement {
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

export const DNS_STATUS_TEXT: Readonly<Partial<Record<DomainStatus, string>>> = {
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
export function GoLivePanel({
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
export function MoveDomainPanel({
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
