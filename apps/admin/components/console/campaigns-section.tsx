import { AD_PLATFORMS, listAdCampaigns, type AdCampaignSnapshot } from "@brandbasket/db";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { ReactElement } from "react";
import { removeCampaignAction, saveCampaignAction, type CampaignNotice } from "@/app/(protected)/clients/[businessId]/campaign-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { AD_PLATFORM_LABELS } from "@/lib/ad-campaign-form";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";

const NOTICE_TEXT: Readonly<Record<CampaignNotice, { readonly text: string; readonly ok: boolean }>> = {
  saved: { text: "Campaign saved.", ok: true },
  removed: { text: "Campaign removed.", ok: true },
  invalid: { text: "Check the campaign: a name, what it is for, the spend, and whole numbers only.", ok: false },
  duplicate: { text: "This customer already has a campaign with that name in that month.", ok: false },
  "not-bought": { text: "That service is not on this customer's plan.", ok: false },
  "not-found": { text: "That campaign is already gone. Reload and look again.", ok: false },
};

const TODAY_INDIA = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
const MONTHS_SHOWN = 6;
const small = `${buttonSecondary} !px-3 !py-1.5`;

/** This month and the earlier ones in India time, newest first, as `YYYY-MM`. */
function recentMonths(count: number, now: Date): string[] {
  const [year = 0, month = 1] = TODAY_INDIA.format(now).split("-").map(Number);
  return Array.from({ length: count }, (_, back) => {
    const index = year * 12 + (month - 1) - back;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

const monthLabel = (month: string): string => MONTH_LABEL.format(new Date(`${month}T12:00:00Z`));
const rupees = (cents: number | null): string => (cents === null ? "" : String(cents / 100));
const countText = (value: number | null): string => (value === null ? "" : String(value));

function Field({ id, name, label, defaultValue, numeric = true, required = false }: { readonly id: string; readonly name: string; readonly label: string; readonly defaultValue?: string; readonly numeric?: boolean; readonly required?: boolean }): ReactElement {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode={numeric ? "numeric" : undefined}
        autoComplete="off"
        required={required}
        maxLength={numeric ? undefined : 120}
        defaultValue={defaultValue}
        className={fieldClasses}
      />
    </div>
  );
}

/** The boxes shared by the add form and each row's edit form. */
function CampaignFields({ idPrefix, campaign }: { readonly idPrefix: string; readonly campaign?: AdCampaignSnapshot }): ReactElement {
  return (
    <>
      <Field id={`${idPrefix}-name`} name="name" label="Campaign name" numeric={false} required defaultValue={campaign?.name} />
      <div>
        <label htmlFor={`${idPrefix}-platform`} className={labelClasses}>
          Where it ran
        </label>
        <select id={`${idPrefix}-platform`} name="platform" defaultValue={campaign?.platform ?? "meta"} className={fieldClasses}>
          {AD_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {AD_PLATFORM_LABELS[platform]}
            </option>
          ))}
        </select>
      </div>
      <Field id={`${idPrefix}-objective`} name="objective" label="What it is for" numeric={false} required defaultValue={campaign?.objective} />
      <Field id={`${idPrefix}-spend`} name="spendRupees" label="Spent in rupees" required defaultValue={rupees(campaign?.spendCents ?? null)} />
      <Field id={`${idPrefix}-budget`} name="budgetRupees" label="Budget in rupees" defaultValue={rupees(campaign?.budgetCents ?? null)} />
      <Field id={`${idPrefix}-impressions`} name="impressions" label="Times shown" defaultValue={countText(campaign?.impressions ?? null)} />
      <Field id={`${idPrefix}-clicks`} name="clicks" label="Clicks" defaultValue={countText(campaign?.clicks ?? null)} />
      <Field id={`${idPrefix}-leads`} name="leads" label="Leads" defaultValue={countText(campaign?.leads ?? null)} />
    </>
  );
}

/** The ad campaigns staff typed in for a customer's Ads page: an add form and the last six months, each campaign editable and removable. */
export async function CampaignsSection({
  businessId,
  notice,
}: {
  readonly businessId: string;
  readonly notice: CampaignNotice | null;
}): Promise<ReactElement | null> {
  const db = getStaffDb();
  if (!(await listBoughtServices(db, businessId)).includes("social")) return null;

  const months = recentMonths(MONTHS_SHOWN, new Date());
  const saved = (await Promise.all(months.map(async (month) => ({ month, rows: await listAdCampaigns(db, businessId, `${month}-01`) })))).filter(
    (entry) => entry.rows.length > 0,
  );
  const shown = NOTICE_TEXT[notice ?? "saved"];

  return (
    <Section title="Ad campaigns" id="campaigns">
      <p className="max-w-xl text-sm text-ink-soft">
        The customer&apos;s Ads page lists these for the current month. Leave a box empty if you did not measure it.
      </p>
      {notice === null ? null : (
        <Notice tone={shown.ok ? "ok" : "problem"} className="mt-4">
          {shown.text}
        </Notice>
      )}
      <form action={saveCampaignAction} className="mt-6 grid max-w-xl gap-4">
        <input type="hidden" name="businessId" value={businessId} />
        <div>
          <label htmlFor="campaign-month" className={labelClasses}>
            Month
          </label>
          <select id="campaign-month" name="month" defaultValue={months[0]} className={fieldClasses}>
            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        </div>
        <CampaignFields idPrefix="campaign-new" />
        <div>
          <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
            Add campaign
          </button>
        </div>
      </form>
      {saved.map(({ month, rows }) => (
        <div key={month} className="mt-8">
          <h3 className="font-serif text-lg">{monthLabel(month)}</h3>
          <ul className="mt-2 max-w-2xl divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="break-words text-base text-ink">{row.name}</p>
                    <p className="mt-1 text-sm tabular-nums text-ink-soft">
                      {AD_PLATFORM_LABELS[row.platform]}, {row.objective}. Spent {formatMoney(row.spendCents, "INR")}
                      {row.budgetCents === null ? "" : ` of ${formatMoney(row.budgetCents, "INR")}`}
                      {row.leads === null ? "" : `, ${row.leads} ${row.leads === 1 ? "lead" : "leads"}`}
                    </p>
                  </div>
                  <form action={removeCampaignAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="businessId" value={businessId} />
                    <button type="submit" aria-label={`Remove campaign: ${row.name}`} className={`${small} text-sm`}>
                      Remove
                    </button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-ink-soft">Edit</summary>
                  <form action={saveCampaignAction} className="mt-3 grid max-w-xl gap-4">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="businessId" value={businessId} />
                    <CampaignFields idPrefix={`campaign-${row.id}`} campaign={row} />
                    <div>
                      <button type="submit" className={small}>
                        Save changes
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}
