import { CONNECTED_ACCOUNT_STATUSES, CONNECTED_PLATFORMS, listConnectedAccountsForStaff, type ConnectedAccount } from "@brandbasket/db";
import type { ReactElement } from "react";
import { removeAccountAction, saveAccountAction, type AccountNotice } from "@/app/(protected)/clients/[businessId]/account-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { PLATFORM_LABELS, STATUS_LABELS } from "@/lib/connected-account-form";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";

const NOTICE_TEXT: Readonly<Record<AccountNotice, { readonly text: string; readonly ok: boolean }>> = {
  saved: { text: "Account saved.", ok: true },
  removed: { text: "Account removed.", ok: true },
  invalid: { text: "Check the account: a link that starts with https://, and a date that is not in the future.", ok: false },
  "not-bought": { text: "That service is not on this customer's plan.", ok: false },
  "not-found": { text: "That account is already gone. Reload and look again.", ok: false },
};

const TODAY_INDIA = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const INDIA_DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long" });
const small = `${buttonSecondary} !px-3 !py-1.5`;

/** The boxes shared by the add form and each row's edit form. The platform is a hidden value when editing: it is the row's identity. */
function AccountFields({ idPrefix, account, platforms }: { readonly idPrefix: string; readonly account?: ConnectedAccount; readonly platforms?: readonly (typeof CONNECTED_PLATFORMS)[number][] }): ReactElement {
  return (
    <>
      {account === undefined ? (
        <div>
          <label htmlFor={`${idPrefix}-platform`} className={labelClasses}>
            Account
          </label>
          <select id={`${idPrefix}-platform`} name="platform" className={fieldClasses}>
            {(platforms ?? []).map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_LABELS[platform]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="platform" value={account.platform} />
      )}
      <div>
        <label htmlFor={`${idPrefix}-handle`} className={labelClasses}>
          Handle or page name
        </label>
        <input id={`${idPrefix}-handle`} name="handle" type="text" maxLength={120} autoComplete="off" defaultValue={account?.handle ?? ""} className={fieldClasses} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-url`} className={labelClasses}>
          Link
        </label>
        <input id={`${idPrefix}-url`} name="url" type="url" inputMode="url" maxLength={500} placeholder="https://" autoComplete="off" defaultValue={account?.url ?? ""} className={fieldClasses} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-status`} className={labelClasses}>
          Status
        </label>
        <select id={`${idPrefix}-status`} name="status" defaultValue={account?.status ?? "connected"} className={fieldClasses}>
          {CONNECTED_ACCOUNT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-checked`} className={labelClasses}>
          Last checked
        </label>
        <input
          id={`${idPrefix}-checked`}
          name="checkedOn"
          type="date"
          defaultValue={TODAY_INDIA.format(account?.checkedAt ?? new Date())}
          className={fieldClasses}
        />
      </div>
    </>
  );
}

/** The social and search accounts staff keep for a customer, shown on their Accounts page: an add form and each account editable and removable. */
export async function AccountsSection({
  businessId,
  notice,
}: {
  readonly businessId: string;
  readonly notice: AccountNotice | null;
}): Promise<ReactElement | null> {
  const db = getStaffDb();
  if ((await listBoughtServices(db, businessId)).length === 0) return null;
  const accounts = await listConnectedAccountsForStaff(db, businessId);
  const listed = new Set(accounts.map((account) => account.platform));
  const unlisted = CONNECTED_PLATFORMS.filter((platform) => !listed.has(platform));
  const shown = NOTICE_TEXT[notice ?? "saved"];

  return (
    <Section title="Connected accounts" id="accounts">
      <p className="max-w-xl text-sm text-ink-soft">
        The customer sees these on their Accounts page. Set the date to when you last checked the account is working.
      </p>
      {notice === null ? null : (
        <Notice tone={shown.ok ? "ok" : "problem"} className="mt-4">
          {shown.text}
        </Notice>
      )}
      {unlisted.length === 0 ? null : (
        <form action={saveAccountAction} className="mt-6 grid max-w-xl gap-4">
          <input type="hidden" name="businessId" value={businessId} />
          <AccountFields idPrefix="account-new" platforms={unlisted} />
          <div>
            <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
              Add account
            </button>
          </div>
        </form>
      )}
      {accounts.length === 0 ? null : (
        <ul className="mt-8 max-w-2xl divide-y divide-line">
          {accounts.map((account) => (
            <li key={account.id} className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base text-ink">{PLATFORM_LABELS[account.platform]}</p>
                  <p className="mt-1 break-words text-sm text-ink-soft">
                    {STATUS_LABELS[account.status]}
                    {account.handle === null ? "" : `, ${account.handle}`}
                    {account.checkedAt === null ? "" : `. Checked ${INDIA_DATE.format(account.checkedAt)}`}
                  </p>
                </div>
                <form action={removeAccountAction}>
                  <input type="hidden" name="platform" value={account.platform} />
                  <input type="hidden" name="businessId" value={businessId} />
                  <button type="submit" aria-label={`Remove account: ${PLATFORM_LABELS[account.platform]}`} className={`${small} text-sm`}>
                    Remove
                  </button>
                </form>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-ink-soft">Edit</summary>
                <form action={saveAccountAction} className="mt-3 grid max-w-xl gap-4">
                  <input type="hidden" name="businessId" value={businessId} />
                  <AccountFields idPrefix={`account-${account.platform}`} account={account} />
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
      )}
    </Section>
  );
}
