import { listDeliverablesForStaff, listMonthlyReportsForStaff, type Deliverable, type MonthlyReport, type SetupService } from "@brandbasket/db";
import type { ReactElement } from "react";
import {
  addDeliverableAction,
  deleteDeliverableAction,
  moveDeliverableAction,
  removeReportAction,
  saveDeliverableAction,
  saveReportAction,
} from "@/app/(protected)/clients/[businessId]/work-actions";
import { buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { PostPictureField } from "@/components/post-picture-field";
import { todayInIndia } from "@/lib/deliverable-form";
import { listBoughtServices } from "@/lib/server/bought-services";
import { getStaffDb } from "@/lib/server/db";
import { WORK_NOTICE_TEXT, type WorkNotice } from "@/lib/work-notices";

const REPORT_MONTHS = 6;
const REPORT_ROWS = 12;
const SERVICE_TITLES: Readonly<Record<SetupService, string>> = { social: "Social & Ads", search: "Search" };
const STATE_LABELS: Readonly<Record<Deliverable["status"], string>> = {
  planned: "Planned",
  awaiting_approval: "Waiting for the customer",
  approved: "Approved",
  published: "Published",
};
const KIND_LABELS: Readonly<Record<Deliverable["kind"], string>> = { post: "Post", page: "Page", listing: "Listing" };

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", dateStyle: "long" });
const APPROVED_DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
const small = `${buttonSecondary} !px-3 !py-1.5`;

/** This month and the earlier ones in India time, newest first, as `YYYY-MM`. */
function recentMonths(count: number, now: Date): string[] {
  const [year = 0, month = 1] = todayInIndia(now).split("-").map(Number);
  return Array.from({ length: count }, (_, back) => {
    const index = year * 12 + (month - 1) - back;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

const monthLabel = (month: string): string => MONTH_LABEL.format(new Date(`${month.slice(0, 7)}-01T12:00:00Z`));

function Hidden({ businessId, id }: { readonly businessId: string; readonly id?: string }): ReactElement {
  return (
    <>
      <input type="hidden" name="businessId" value={businessId} />
      {id === undefined ? null : <input type="hidden" name="id" value={id} />}
    </>
  );
}

function MoveForm({ businessId, row, move, label, link }: { readonly businessId: string; readonly row: Deliverable; readonly move: "send" | "pull" | "publish"; readonly label: string; readonly link?: "required" | "optional" }): ReactElement {
  return (
    <form action={moveDeliverableAction} className="flex flex-wrap items-center gap-2">
      <Hidden businessId={businessId} id={row.id} />
      <input type="hidden" name="move" value={move} />
      {link === undefined ? null : (
        <>
          <label htmlFor={`link-${row.id}`} className="sr-only">
            Link to {row.title}
          </label>
          <input
            id={`link-${row.id}`}
            name="linkUrl"
            type="url"
            inputMode="url"
            required={link === "required"}
            maxLength={500}
            placeholder={link === "required" ? "Link (https://)" : "Link (optional)"}
            autoComplete="off"
            className={`${fieldClasses} !mt-0 !w-64 !py-1.5 !text-sm`}
          />
        </>
      )}
      <button type="submit" aria-label={`${label}: ${row.title}`} className={small}>
        {label}
      </button>
    </form>
  );
}

function EditForm({ businessId, row, today }: { readonly businessId: string; readonly row: Deliverable; readonly today: string }): ReactElement {
  const isPost = row.kind === "post";
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm text-ink-soft">Edit</summary>
      <form action={saveDeliverableAction} className="mt-3 grid max-w-xl gap-4">
        <Hidden businessId={businessId} id={row.id} />
        <div>
          <label htmlFor={`edit-title-${row.id}`} className={labelClasses}>
            Title
          </label>
          <input id={`edit-title-${row.id}`} name="title" type="text" required minLength={3} maxLength={140} defaultValue={row.title} className={fieldClasses} />
        </div>
        {isPost ? (
          <div>
            <label htmlFor={`edit-caption-${row.id}`} className={labelClasses}>
              Caption
            </label>
            <textarea id={`edit-caption-${row.id}`} name="caption" rows={3} maxLength={600} defaultValue={row.caption ?? ""} className={fieldClasses} />
          </div>
        ) : null}
        <div>
          <label htmlFor={`edit-date-${row.id}`} className={labelClasses}>
            Date
          </label>
          <input id={`edit-date-${row.id}`} name="dueOn" type="date" required defaultValue={row.dueOn ?? today} className={fieldClasses} />
        </div>
        {isPost ? <PostPictureField name="picture" id={`edit-picture-${row.id}`} /> : null}
        <div>
          <button type="submit" className={small}>
            Save changes
          </button>
        </div>
      </form>
    </details>
  );
}

function Row({ businessId, row, today }: { readonly businessId: string; readonly row: Deliverable; readonly today: string }): ReactElement {
  const isPost = row.kind === "post";
  const editable = row.status === "planned" || (isPost && row.status === "awaiting_approval");
  return (
    <li className="flex items-start gap-4 py-4">
      {row.imageKey === null ? null : (
        // eslint-disable-next-line @next/next/no-img-element -- a staff-only preview of a file served by this app
        <img src={`/deliverable-images/${row.id}`} alt="" width={48} height={60} className="h-15 w-12 shrink-0 rounded-control bg-paper-deep object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm tabular-nums text-ink-soft">
          {row.dueOn === null ? "No date" : DAY.format(new Date(`${row.dueOn}T12:00:00Z`))}, {KIND_LABELS[row.kind]}, {STATE_LABELS[row.status]}
        </p>
        <p className="mt-1 break-words text-base text-ink">{row.title}</p>
        {row.status === "approved" && row.approvedAt !== null ? (
          <p className="mt-1 text-sm text-ink-soft">Approved by the customer on {APPROVED_DAY.format(row.approvedAt)}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {isPost && row.status === "planned" ? <MoveForm businessId={businessId} row={row} move="send" label="Send for approval" /> : null}
          {isPost && (row.status === "awaiting_approval" || row.status === "approved") ? <MoveForm businessId={businessId} row={row} move="pull" label="Take back" /> : null}
          {row.status === "approved" ? <MoveForm businessId={businessId} row={row} move="publish" label="Mark published" link="optional" /> : null}
          {!isPost && row.status === "planned" ? (
            <MoveForm businessId={businessId} row={row} move="publish" label="Mark done" link={row.kind === "page" ? "required" : "optional"} />
          ) : null}
          {row.status === "planned" ? (
            <form action={deleteDeliverableAction}>
              <Hidden businessId={businessId} id={row.id} />
              <button type="submit" aria-label={`Delete: ${row.title}`} className={small}>
                Delete
              </button>
            </form>
          ) : null}
        </div>
        {editable ? <EditForm businessId={businessId} row={row} today={today} /> : null}
      </div>
    </li>
  );
}

function Rows({ businessId, rows, today }: { readonly businessId: string; readonly rows: readonly Deliverable[]; readonly today: string }): ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-6 max-w-2xl divide-y divide-line">
      {rows.map((row) => (
        <Row key={row.id} businessId={businessId} row={row} today={today} />
      ))}
    </ul>
  );
}

function ReportBlock({
  businessId,
  service,
  months,
  reports,
}: {
  readonly businessId: string;
  readonly service: SetupService;
  readonly months: readonly string[];
  readonly reports: readonly MonthlyReport[];
}): ReactElement {
  return (
    <div className="mt-6 max-w-xl">
      <h4 className="text-sm font-medium text-ink">Monthly report link</h4>
      <form action={saveReportAction} className="mt-3 grid gap-4">
        <Hidden businessId={businessId} />
        <input type="hidden" name="service" value={service} />
        <div>
          <label htmlFor={`report-${service}-month`} className={labelClasses}>
            Month
          </label>
          <select id={`report-${service}-month`} name="month" defaultValue={months[0]} className={fieldClasses}>
            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`report-${service}-url`} className={labelClasses}>
            Link
          </label>
          <input id={`report-${service}-url`} name="url" type="url" inputMode="url" required maxLength={500} autoComplete="off" className={fieldClasses} />
        </div>
        <div>
          <button type="submit" className={small}>
            Save report link
          </button>
        </div>
      </form>
      {reports.length === 0 ? null : (
        <ul className="mt-4 divide-y divide-line">
          {reports.map((report) => (
            <li key={report.month} className="flex items-center justify-between gap-4 py-2">
              <p className="min-w-0 break-words text-sm">
                {monthLabel(report.month)}:{" "}
                <a href={report.url} rel="noreferrer" target="_blank" className="underline">
                  {report.url}
                </a>
              </p>
              <form action={removeReportAction}>
                <Hidden businessId={businessId} />
                <input type="hidden" name="service" value={service} />
                <input type="hidden" name="month" value={report.month} />
                <button type="submit" aria-label={`Remove the ${monthLabel(report.month)} report link`} className={small}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddForm({ businessId, service, today }: { readonly businessId: string; readonly service: SetupService; readonly today: string }): ReactElement {
  const isSocial = service === "social";
  return (
    <form action={addDeliverableAction} className="mt-4 grid max-w-xl gap-4">
      <Hidden businessId={businessId} />
      {isSocial ? (
        <input type="hidden" name="kind" value="post" />
      ) : (
        <div>
          <label htmlFor="work-kind" className={labelClasses}>
            Kind
          </label>
          <select id="work-kind" name="kind" defaultValue="page" className={fieldClasses}>
            <option value="page">Page we improved</option>
            <option value="listing">Listing we fixed</option>
          </select>
        </div>
      )}
      <div>
        <label htmlFor={`work-${service}-title`} className={labelClasses}>
          Title
        </label>
        <input id={`work-${service}-title`} name="title" type="text" required minLength={3} maxLength={140} className={fieldClasses} />
      </div>
      {isSocial ? (
        <div>
          <label htmlFor="work-caption" className={labelClasses}>
            Caption
          </label>
          <textarea id="work-caption" name="caption" rows={3} maxLength={600} className={fieldClasses} />
        </div>
      ) : null}
      <div>
        <label htmlFor={`work-${service}-date`} className={labelClasses}>
          Date
        </label>
        <input id={`work-${service}-date`} name="dueOn" type="date" required defaultValue={today} className={fieldClasses} />
      </div>
      {isSocial ? <PostPictureField name="picture" id="post-picture-new" /> : null}
      <div>
        <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
          {isSocial ? "Add post" : "Add"}
        </button>
      </div>
    </form>
  );
}

/** Staff plan, send, publish and report a customer's Social & Ads posts and Search pages and listings. */
export async function WorkSection({ businessId, notice }: { readonly businessId: string; readonly notice: WorkNotice | null }): Promise<ReactElement | null> {
  const db = getStaffDb();
  const services = await listBoughtServices(db, businessId);
  if (services.length === 0) return null;

  const now = new Date();
  const today = todayInIndia(now);
  const [rows, reports] = await Promise.all([listDeliverablesForStaff(db, businessId, { from: today }), listMonthlyReportsForStaff(db, businessId, REPORT_ROWS)]);
  const months = recentMonths(REPORT_MONTHS, now);
  const line = notice === null ? null : WORK_NOTICE_TEXT[notice];

  return (
    <Section title="Posts, pages and reports" id="work">
      {line === null ? null : (
        <Notice tone={line.ok ? "ok" : "problem"} className="mb-4">
          {line.text}
        </Notice>
      )}
      {services.map((service, index) => (
        <div key={service} className={index === 0 ? "" : "mt-10"}>
          <h3 className="font-serif text-lg">{SERVICE_TITLES[service]}</h3>
          <h4 className="mt-4 text-sm font-medium text-ink">{service === "social" ? "Add a post" : "Add a page or listing"}</h4>
          <AddForm businessId={businessId} service={service} today={today} />
          <Rows businessId={businessId} rows={rows.filter((row) => row.service === service)} today={today} />
          <ReportBlock businessId={businessId} service={service} months={months} reports={reports.filter((report) => report.service === service)} />
        </div>
      ))}
    </Section>
  );
}
