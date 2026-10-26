import { listActivityEvents } from "@brandbasket/db";
import { RequiredMark } from "@brandbasket/shared/ui/forms/required-mark";
import type { ReactElement } from "react";
import { addUpdateAction, removeUpdateAction } from "@/app/(protected)/clients/[businessId]/updates-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { getStaffDb } from "@/lib/server/db";
import { UPDATE_SERVICE_OPTIONS } from "@/lib/updates-form";

const INDIA_DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long" });
const TODAY_INDIA = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const SERVICE_LABELS = new Map(UPDATE_SERVICE_OPTIONS.map((option) => [option.value, option.label]));

export type UpdatesNotice = "added" | "removed" | "invalid";

const NOTICE_TEXT: Readonly<Record<UpdatesNotice, string>> = {
  added: "Update added.",
  removed: "Update removed.",
  invalid: "Check the update: 3 to 140 characters, and a date that is not in the future.",
};

/** The dated lines staff write for a customer's Overview: an add form and the newest few, each removable. */
export async function UpdatesSection({
  businessId,
  notice,
}: {
  readonly businessId: string;
  readonly notice: UpdatesNotice | null;
}): Promise<ReactElement> {
  const events = await listActivityEvents(getStaffDb(), businessId, 8);
  return (
    <Section title="Updates for the customer" id="updates">
      <p className="max-w-xl text-sm text-ink-soft">
        These appear under What we did on the customer&apos;s Overview. Write them in plain words the customer would use.
      </p>
      {notice === null ? null : (
        <Notice tone={notice === "invalid" ? "problem" : "ok"} className="mt-4">
          {NOTICE_TEXT[notice]}
        </Notice>
      )}
      <form action={addUpdateAction} className="mt-6 grid max-w-xl gap-4">
        <input type="hidden" name="businessId" value={businessId} />
        <div>
          <label htmlFor="update-service" className={labelClasses}>
            Service
          </label>
          <select id="update-service" name="service" defaultValue="" className={fieldClasses}>
            {UPDATE_SERVICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="update-title" className={labelClasses}>
            What we did
            <RequiredMark />
          </label>
          <input id="update-title" name="title" type="text" required minLength={3} maxLength={140} className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="update-date" className={labelClasses}>
            Date
          </label>
          <input id="update-date" name="date" type="date" defaultValue={TODAY_INDIA.format(new Date())} className={fieldClasses} />
        </div>
        <div>
          <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
            Add update
          </button>
        </div>
      </form>
      {events.length === 0 ? null : (
        <ul className="mt-8 max-w-xl divide-y divide-line">
          {events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm tabular-nums text-ink-soft">
                  {INDIA_DATE.format(event.occurredAt)} · {SERVICE_LABELS.get(event.service ?? "") ?? "General"}
                </p>
                <p className="mt-1 break-words text-base text-ink">{event.title}</p>
              </div>
              <form action={removeUpdateAction}>
                <input type="hidden" name="id" value={event.id} />
                <input type="hidden" name="businessId" value={businessId} />
                <button type="submit" className={`${buttonSecondary} !px-3 !py-1.5 text-sm`}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
