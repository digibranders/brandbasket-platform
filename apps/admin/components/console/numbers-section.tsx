import { listMonthlySnapshots, type MonthlySnapshot, type SetupService } from "@brandbasket/db";
import { formatMoney } from "@brandbasket/shared/lib/money";
import type { ReactElement } from "react";
import { saveNumbersAction } from "@/app/(protected)/clients/[businessId]/numbers-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";

export type NumbersNotice = "saved" | "invalid" | "not-bought";

const NOTICE_TEXT: Readonly<Record<NumbersNotice, string>> = {
  saved: "Numbers saved.",
  invalid: "Check the numbers: whole numbers only, and enter at least one.",
  "not-bought": "That service is not on this customer's plan.",
};

const TODAY_INDIA = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });

interface Field {
  readonly name: string;
  readonly label: string;
}

const SERVICES: Readonly<
  Record<SetupService, { readonly title: string; readonly fields: readonly Field[]; readonly columns: readonly { readonly label: string; readonly show: (row: MonthlySnapshot) => string | null }[] }>
> = {
  social: {
    title: "Social & Ads",
    fields: [
      { name: "adSpendRupees", label: "Ad spend in rupees" },
      { name: "adBudgetRupees", label: "Ad budget in rupees" },
      { name: "adEnquiries", label: "Enquiries from ads" },
      { name: "postsPublished", label: "Posts published" },
      { name: "postsPlanned", label: "Posts planned" },
    ],
    columns: [
      { label: "Ad spend", show: (row) => (row.adSpendCents === null ? null : formatMoney(row.adSpendCents, "INR")) },
      { label: "Ad budget", show: (row) => (row.adBudgetCents === null ? null : formatMoney(row.adBudgetCents, "INR")) },
      { label: "Enquiries", show: (row) => (row.adEnquiries === null ? null : String(row.adEnquiries)) },
      { label: "Posts published", show: (row) => (row.postsPublished === null ? null : String(row.postsPublished)) },
      { label: "Posts planned", show: (row) => (row.postsPlanned === null ? null : String(row.postsPlanned)) },
    ],
  },
  search: {
    title: "Local SEO + AEO",
    fields: [
      { name: "keywordsPageOne", label: "Searches on Google's first page" },
      { name: "keywordsPageOnePrev", label: "Last month's searches on the first page" },
    ],
    columns: [
      { label: "On the first page", show: (row) => (row.keywordsPageOne === null ? null : String(row.keywordsPageOne)) },
      { label: "Last month", show: (row) => (row.keywordsPageOnePrev === null ? null : String(row.keywordsPageOnePrev)) },
    ],
  },
};

/** This month and the earlier ones in India time, newest first, as `YYYY-MM`. */
function recentMonths(count: number, now: Date): string[] {
  const [year = 0, month = 1] = TODAY_INDIA.format(now).split("-").map(Number);
  return Array.from({ length: count }, (_, back) => {
    const index = year * 12 + (month - 1) - back;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

const monthLabel = (month: string): string => MONTH_LABEL.format(new Date(`${month}-01T12:00:00Z`));

/** Staff type in a customer's ad and search numbers for a month: one form per bought service and the last three months saved. */
export async function NumbersSection({
  businessId,
  notice,
}: {
  readonly businessId: string;
  readonly notice: NumbersNotice | null;
}): Promise<ReactElement | null> {
  const db = getStaffDb();
  const services = await listBoughtServices(db, businessId);
  if (services.length === 0) return null;

  const months = recentMonths(6, new Date());
  const saved = await Promise.all(
    months.slice(0, 3).map(async (month) => ({ month, rows: await listMonthlySnapshots(db, businessId, `${month}-01`) })),
  );

  return (
    <Section title="Monthly numbers" id="numbers">
      <p className="max-w-xl text-sm text-ink-soft">
        The customer&apos;s Overview shows these. Saving replaces that month&apos;s numbers for the service. Leave a box empty if you did not
        measure it.
      </p>
      {notice === null ? null : (
        <Notice tone={notice === "saved" ? "ok" : "problem"} className="mt-4">
          {NOTICE_TEXT[notice]}
        </Notice>
      )}
      {services.map((service) => {
        const { title, fields, columns } = SERVICES[service];
        return (
          <div key={service} className="mt-8">
            <h3 className="font-serif text-lg">{title}</h3>
            <form action={saveNumbersAction} className="mt-4 grid max-w-xl gap-4">
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="service" value={service} />
              <div>
                <label htmlFor={`numbers-${service}-month`} className={labelClasses}>
                  Month
                </label>
                <select id={`numbers-${service}-month`} name="month" defaultValue={months[0]} className={fieldClasses}>
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {monthLabel(month)}
                    </option>
                  ))}
                </select>
              </div>
              {fields.map((field) => (
                <div key={field.name}>
                  <label htmlFor={`numbers-${service}-${field.name}`} className={labelClasses}>
                    {field.label}
                  </label>
                  <input id={`numbers-${service}-${field.name}`} name={field.name} type="text" inputMode="numeric" autoComplete="off" className={fieldClasses} />
                </div>
              ))}
              <div>
                <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
                  Save numbers
                </button>
              </div>
            </form>
            <table className="mt-6 w-full max-w-2xl text-left text-sm">
              <caption className="pb-2 text-left text-sm text-ink-soft">Last three months saved for {title}</caption>
              <thead>
                <tr className="border-b border-line text-ink-soft">
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Month
                  </th>
                  {columns.map((column) => (
                    <th key={column.label} scope="col" className="py-2 pr-4 font-normal">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {saved.map(({ month, rows }) => {
                  const row = rows.find((candidate) => candidate.service === service);
                  return (
                    <tr key={month}>
                      <th scope="row" className="py-2 pr-4 font-normal">
                        {monthLabel(month)}
                      </th>
                      {columns.map((column) => (
                        <td key={column.label} className="py-2 pr-4">
                          {(row === undefined ? null : column.show(row)) ?? "-"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </Section>
  );
}
