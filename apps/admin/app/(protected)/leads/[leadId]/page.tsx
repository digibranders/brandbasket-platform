import { findLead, findUserIdByEmail, isBillingStarted } from "@fynix/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { RequiredMark } from "@fynix/shared/ui/forms/required-mark";
import { GatedSubmitButton } from "@fynix/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@fynix/shared/ui/panel/local-date-time";
import { SelectField, type SelectOption } from "@fynix/shared/ui/select-field";
import { businessTypeLabel } from "@fynix/shared/lib/business-types";
import { BUSINESS_MODULE_LABELS, suggestedModules } from "@fynix/shared/lib/business-modules";
import { BILLING_CURRENCY_LABELS, BILLING_CURRENCY_ORDER } from "@fynix/shared/lib/currency";
import { canStaffChangeLeadStatus, LEAD_STATUS_LABELS, STAFF_LEAD_STATUS_ORDER } from "@fynix/shared/lib/lead-status";
import { displayPhone } from "@fynix/shared/server/phone-display";
import { Avatar } from "@/components/console/avatar";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses, readOnlyValueClasses } from "@/components/console/field-styles";
import { PageHeader } from "@/components/console/page-header";
import { FactList, Section } from "@/components/console/section";
import { StageTrack } from "@/components/console/stage-track";
import { isLeadInPipeline } from "@/lib/pipeline";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { attachAccountAction, sendSetupLinkAction, updateLeadDetails } from "./actions";

export const metadata: Metadata = { title: "Lead" };

const STATUS_OPTIONS: readonly SelectOption[] = STAFF_LEAD_STATUS_ORDER.map((status) => ({ value: status, label: LEAD_STATUS_LABELS[status] }));
const CURRENCY_OPTIONS: readonly SelectOption[] = BILLING_CURRENCY_ORDER.map((currency) => ({ value: currency, label: BILLING_CURRENCY_LABELS[currency] }));

export default async function LeadDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly leadId: string }>;
}): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  const { leadId } = await params;
  await logStaffAccess({ staffUserId: user.id, action: "lead.view", targetType: "lead", targetId: leadId });
  const db = getStaffDb();
  const lead = await findLead(db, leadId);
  if (lead === null) notFound();

  // Setup can stop between creating the account and creating the business, which leaves the customer with an
  // account and nothing to sign in to. The repair is only offered when that is exactly the state they are in.
  const strandedAccount = lead.businessId === null ? await findUserIdByEmail(db, lead.email) : null;
  // Once billing has started the currency is fixed (every amount recorded is in it), so "Billed in" is shown read-only.
  const currencyLocked = lead.businessId !== null && (await isBillingStarted(db, lead.businessId));
  const phone = displayPhone(lead.phone);
  const suggested = suggestedModules(lead.businessType);

  return (
    <>
      <PageHeader
        back={{ href: "/leads", label: "Leads" }}
        lead={<Avatar id={lead.id} name={lead.businessName} size="lg" />}
        title={lead.businessName}
        meta={
          <>
            {lead.name} · {LEAD_STATUS_LABELS[lead.status]}
          </>
        }
        action={
          lead.businessId === null ? undefined : (
            <Link href={`/clients/${lead.businessId}`} className={buttonPrimary}>
              View client
            </Link>
          )
        }
      >
        {/* Once they have a business, "View client" shows where they really are; a guess here would be wrong. */}
        {isLeadInPipeline(lead) ? <StageTrack stage="lead" /> : null}
      </PageHeader>

      <div className="mt-12">
        <Section title="Contact">
          <FactList
            items={[
              { label: "Name", value: lead.name },
              {
                label: "Email",
                value: (
                  <a href={`mailto:${lead.email}`} className="link-underline break-all">
                    {lead.email}
                  </a>
                ),
              },
              {
                label: "Phone",
                value:
                  phone.href === null ? (
                    phone.text
                  ) : (
                    <a href={phone.href} className="link-underline">
                      {phone.text}
                    </a>
                  ),
              },
              {
                label: "Business type",
                value:
                  lead.businessType === null ? null : (
                    <>
                      {businessTypeLabel(lead.businessType)}
                      {suggested.length === 0 ? null : (
                        <span className="mt-1 block text-sm text-ink-soft">
                          Suggested: {suggested.map((module) => BUSINESS_MODULE_LABELS[module]).join(", ")}
                        </span>
                      )}
                    </>
                  ),
              },
              { label: "Billed in", value: BILLING_CURRENCY_LABELS[lead.currency] },
              { label: "Received", value: <LocalDateTime iso={lead.createdAt.toISOString()} variant="timestamp" /> },
            ]}
          />
          {lead.attachedAt === null ? null : (
            <p className="mt-6 text-sm text-ink-soft">
              Account attached by hand on <LocalDateTime iso={lead.attachedAt.toISOString()} variant="timestamp" /> by
              staff member {lead.attachedByStaffId ?? "unknown"}.
            </p>
          )}
        </Section>

        {lead.message === null ? null : (
          <Section title="Their message">
            <p className="max-w-2xl whitespace-pre-wrap font-serif text-xl leading-relaxed">{lead.message}</p>
          </Section>
        )}

        <Section title="Send the setup link">
          <form action={sendSetupLinkAction}>
            <input type="hidden" name="leadId" value={lead.id} />
            <p className="max-w-xl text-ink-soft">
              Emails {lead.email} a one-time link that creates their account. Any earlier link stops working; the new
              one lasts 7 days.
            </p>
            <button type="submit" className={`${buttonPrimary} mt-5`}>
              Send setup link
            </button>
          </form>
        </Section>

        {strandedAccount === null ? null : (
          <Section title="Attach their account" tone="attention">
            <form action={attachAccountAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <p className="max-w-xl text-ink-soft">
                {lead.email} already has an account but no website, which happens when setup stopped halfway. This
                creates {lead.businessName} and makes them its owner, without sending another link. Any setup link
                still open for this lead stops working.
              </p>
              <button type="submit" className={`${buttonSecondary} mt-5`}>
                Attach account
              </button>
            </form>
          </Section>
        )}

        <Section title="Update this lead">
          <form action={updateLeadDetails} className="max-w-2xl">
            <input type="hidden" name="leadId" value={lead.id} />
            <div className="grid gap-6 sm:grid-cols-2">
              {canStaffChangeLeadStatus(lead.status) ? (
                <div>
                  <label htmlFor="lead-status" className={labelClasses}>
                    Status<RequiredMark />
                  </label>
                  <SelectField id="lead-status" name="status" required options={STATUS_OPTIONS} defaultValue={lead.status} className={fieldClasses} />
                  <p className={hintClasses}>Account created and Paid are set for you when the customer signs up and pays.</p>
                </div>
              ) : (
                <div>
                  <p className={labelClasses}>Status</p>
                  <p className={readOnlyValueClasses}>{LEAD_STATUS_LABELS[lead.status]}</p>
                  <p className={hintClasses}>
                    Set when the customer {lead.status === "paid" ? "paid" : "created their account"}. It can’t be
                    changed by hand.
                  </p>
                </div>
              )}
              {currencyLocked ? (
                <div>
                  <p className={labelClasses}>Billed in</p>
                  <p className={readOnlyValueClasses}>{BILLING_CURRENCY_LABELS[lead.currency]}</p>
                  <p className={hintClasses}>Locked: billing has started in this currency.</p>
                </div>
              ) : (
                <div>
                  <label htmlFor="lead-currency" className={labelClasses}>
                    Billed in<RequiredMark />
                  </label>
                  <SelectField id="lead-currency" name="currency" required options={CURRENCY_OPTIONS} defaultValue={lead.currency} className={fieldClasses} />
                  <p className={hintClasses}>
                    India is billed in INR; everywhere else in USD. New leads start from their phone number.
                    {lead.businessId === null ? null : " They have signed up, so this also changes what checkout charges them."}
                  </p>
                </div>
              )}
              <div className="sm:col-span-2">
                <label htmlFor="lead-notes" className={labelClasses}>
                  Private notes
                </label>
                <textarea id="lead-notes" name="notes" rows={4} defaultValue={lead.notes ?? ""} className={fieldClasses} />
              </div>
            </div>
            <GatedSubmitButton className={`${buttonPrimary} mt-6`} pendingLabel="Saving…">
              Save
            </GatedSubmitButton>
          </form>
        </Section>
      </div>
    </>
  );
}
