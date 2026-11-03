import {
  composeReport,
  findBusinessAlertDetails,
  getReport,
  hasEmailContaining,
  indianDay,
  isPhoneAccountEmail,
  listReportBusinesses,
  moveReport,
  readReportFacts,
  setReportPdfKey,
  type Database,
  type RawKindCounts,
  type RawReportFacts,
  type ReportBusiness,
  type ReportDocument,
  type ReportService,
} from "@brandbasket/db";
import { monthlyReportEmail, type EmailMessage } from "@brandbasket/email";
import { composeSearch, composeSocial, composeWebsite, type DoneLine, type ReportFacts } from "../lib/reports/compose";
import { REPORT_CONTENT_VERSION, reportContentSchema, type ReportContent } from "../lib/reports/content";
import { monthName, monthRange, parseMonthKey, type MonthKey } from "../lib/reports/period";
import { REPORT_SERVICE_TITLES } from "../lib/reports/services";
import { emailPreferenceAllows } from "./email-preference";
import { reportPdfStorageKey } from "./media-keys";
import type { MediaStorage } from "./media-storage";
import { renderReportPdf } from "./report-pdf";

/*
 * The monthly customer reports (plan 58). `composeMonthlyReports` writes each business's reports for a month as drafts, from
 * real records only. Staff review a draft in the console, and `sendReport` approves it, makes its PDF, stores it, marks it sent
 * and emails the owner. Runs on the staff connection; imports nothing server-only that a plain script cannot load.
 */

const CHANNEL_OF_KIND = {
  form: "website_form",
  call_tap: "website_call",
  whatsapp_tap: "website_whatsapp",
  chat: "chatbot",
  google_call: "google_profile_call",
} as const;

/** A channel the business has ever had an enquiry on is measured, and its count (zero included) is a fact; any other is left out. */
function channelCounts(side: RawKindCounts): ReportFacts["enquiries"]["current"] {
  const counts: Record<string, number | null> = {};
  for (const [kind, channel] of Object.entries(CHANNEL_OF_KIND)) {
    counts[channel] = side.measured.some((measured) => measured === kind) ? (side.counts[kind as keyof typeof CHANNEL_OF_KIND] ?? 0) : null;
  }
  return counts;
}

const DELIVERED = "published";

/** The facts the composers read, from one business's raw records. Pure. */
export function reportFactsOf(raw: RawReportFacts, business: Pick<ReportBusiness, "currency">): ReportFacts {
  const posts = raw.deliverables.filter((item) => item.kind === "post");
  const social = raw.snapshots.find((row) => row.service === "social");
  const search = raw.snapshots.find((row) => row.service === "search");
  const adLeads = raw.campaigns.every((campaign) => campaign.leads !== null) ? raw.campaigns.reduce((sum, campaign) => sum + (campaign.leads ?? 0), 0) : null;
  const ads =
    raw.campaigns.length > 0
      ? { spendCents: raw.campaigns.reduce((sum, campaign) => sum + campaign.spendCents, 0), enquiries: adLeads }
      : { spendCents: social?.adSpendCents ?? null, enquiries: social?.adEnquiries ?? null };
  const delivered = (kind: "post" | "page" | "listing") => raw.deliverables.filter((item) => item.kind === kind && item.status === DELIVERED);
  const work: DoneLine[] = [
    ...delivered("post").map((item) => ({ on: item.dueOn, text: `Published a post: ${item.title}` })),
    ...delivered("page").map((item) => ({ on: item.dueOn, text: `Improved a page: ${item.title}` })),
    ...delivered("listing").map((item) => ({ on: item.dueOn, text: `Fixed a listing: ${item.title}` })),
  ];
  const activity = (service: ReportService, alsoGeneral: boolean): DoneLine[] =>
    raw.activity.filter((item) => item.service === service || (alsoGeneral && item.service === null)).map((item) => ({ on: item.day, text: item.title }));
  const done = (service: ReportService, kinds: readonly string[]): DoneLine[] => [...activity(service, service === "website"), ...work.filter((item) => kinds.some((kind) => item.text.startsWith(kind)))];
  return {
    currency: business.currency,
    site: {
      up: raw.site.up,
      down: raw.site.down,
      phoneSpeed: raw.site.phoneSpeed === null ? null : { score: raw.site.phoneSpeed.score, on: indianDay(raw.site.phoneSpeed.checkedAt) },
      certificateEndsOn: raw.site.certificateEndsAt === null ? null : indianDay(raw.site.certificateEndsAt),
    },
    enquiries: { current: channelCounts(raw.enquiries.current), previous: channelCounts(raw.enquiries.previous) },
    social: {
      // Posts we recorded win; the numbers staff typed for the month are the fallback.
      postsPublished: posts.length > 0 ? delivered("post").length : (social?.postsPublished ?? 0),
      postsPlanned: posts.length > 0 ? posts.length : (social?.postsPlanned ?? 0),
      reach: social?.reach ?? null,
      followers: social?.followers ?? null,
      profileVisits: social?.profileVisits ?? null,
      ads,
    },
    search: {
      keywordsPageOne: search?.keywordsPageOne ?? null,
      keywordsPageOnePrevious: search?.keywordsPageOnePrev ?? null,
      pagesImproved: delivered("page").length,
      listingsFixed: delivered("listing").length,
    },
    done: { website: done("website", []), social: done("social", ["Published a post"]), search: done("search", ["Improved a page", "Fixed a listing"]) },
  };
}

const COMPOSERS: Readonly<Record<ReportService, (facts: ReportFacts, month: MonthKey) => ReportContent | null>> = {
  website: composeWebsite,
  social: composeSocial,
  search: composeSearch,
};

export type ComposeOutcome = "composed" | "nothing-measured" | "frozen" | "failed";

export interface ComposeSummary {
  readonly month: MonthKey;
  readonly dryRun: boolean;
  readonly results: readonly { readonly businessId: string; readonly businessName: string; readonly service: ReportService; readonly outcome: ComposeOutcome; readonly error?: string }[];
}

export interface ComposeOptions {
  readonly month: MonthKey;
  readonly now: Date;
  readonly dryRun?: boolean;
  /** Only this business. */
  readonly businessId?: string;
}

/**
 * Writes every reportable business's reports for the month as drafts. A draft or held report is rewritten from the latest
 * records; an approved or sent one is left alone. A service with nothing measured gets no report. One business failing is
 * recorded and the rest carry on. With `dryRun` nothing is written.
 */
export async function composeMonthlyReports(db: Database, options: ComposeOptions): Promise<ComposeSummary> {
  const monthStart = `${options.month}-01`;
  const businesses = (await listReportBusinesses(db)).filter((business) => options.businessId === undefined || business.id === options.businessId);
  const results: ComposeSummary["results"][number][] = [];
  for (const business of businesses) {
    let raw: RawReportFacts;
    try {
      raw = await readReportFacts(db, business.id, monthStart);
    } catch (error) {
      for (const service of business.services) results.push({ businessId: business.id, businessName: business.name, service, outcome: "failed", error: errorText(error) });
      continue;
    }
    const facts = reportFactsOf(raw, business);
    for (const service of business.services) {
      const base = { businessId: business.id, businessName: business.name, service };
      try {
        const content = COMPOSERS[service](facts, options.month);
        if (content === null) {
          results.push({ ...base, outcome: "nothing-measured" });
          continue;
        }
        if (options.dryRun === true) {
          results.push({ ...base, outcome: "composed" });
          continue;
        }
        const written = await composeReport(db, { businessId: business.id, service, month: monthStart, content, contentVersion: REPORT_CONTENT_VERSION, now: options.now });
        results.push({ ...base, outcome: written === null ? "frozen" : "composed" });
      } catch (error) {
        results.push({ ...base, outcome: "failed", error: errorText(error) });
      }
    }
  }
  return { month: options.month, dryRun: options.dryRun === true, results };
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "unknown error";
}

export interface SendReportDeps {
  readonly storage: MediaStorage;
  /** Delivers one message: the app's transport. Called only when there is someone to write to and the owner wants the email. */
  readonly send: (message: EmailMessage) => Promise<void>;
  /** The customer app's origin, for the link in the email. */
  readonly customerOrigin: string;
}

export interface SendReportResult {
  readonly report: ReportDocument;
  /** What happened to the owner's email. */
  readonly email: "sent" | "owner-turned-off" | "already-sent" | "no-address" | "failed";
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });

/** "2026-10-01" as the month key; throws for a stored month that is not the first of a month. */
function monthKeyOfStored(month: string): MonthKey {
  const key = month.endsWith("-01") ? parseMonthKey(month.slice(0, 7)) : null;
  if (key === null) throw new RangeError(`A stored report month must be the first of a month: ${month}`);
  return key;
}

/**
 * Approves a report, makes its PDF, stores it, marks it sent and emails the owner. Safe to run again after a failure: a report
 * that is already sent only gets its email retried (the outbox shows whether it went). The PDF is made and stored before the
 * report is marked sent, so a customer never sees a Download PDF link with nothing behind it.
 */
export async function sendReport(db: Database, deps: SendReportDeps, input: { readonly reportId: string; readonly staffId: string; readonly now: Date }): Promise<SendReportResult> {
  const found = await getReport(db, input.reportId);
  if (found === null) throw new Error(`Report ${input.reportId} does not exist`);
  const content = reportContentSchema.safeParse(found.content);
  if (found.contentVersion !== REPORT_CONTENT_VERSION || !content.success) throw new Error(`Report ${found.id} is not in a form that can be sent (version ${found.contentVersion})`);
  const month = monthKeyOfStored(found.month);
  const details = await findBusinessAlertDetails(db, found.businessId);
  if (details === null) throw new Error(`Business ${found.businessId} does not exist`);

  let report = found;
  if (report.state !== "sent") {
    report = await moveReport(db, { id: report.id, to: "approved", staffId: input.staffId, now: input.now });
    const bytes = await renderReportPdf({
      businessName: details.business.name,
      serviceTitle: REPORT_SERVICE_TITLES[report.service],
      monthTitle: `${monthRange(month).name} ${monthRange(month).year}`,
      sentOn: DAY_FORMAT.format(input.now),
      content: content.data,
    });
    await deps.storage.put(reportPdfStorageKey(report.id), bytes, "application/pdf");
    await setReportPdfKey(db, { id: report.id, now: input.now });
    report = await moveReport(db, { id: report.id, to: "sent", staffId: input.staffId, now: input.now });
  }
  return { report, email: await emailOwner(db, deps, report, month, content.data, details.owner) };
}

async function emailOwner(
  db: Database,
  deps: SendReportDeps,
  report: ReportDocument,
  month: MonthKey,
  content: ReportContent,
  owner: { readonly userId: string | null; readonly name: string | null; readonly email: string | null },
): Promise<SendReportResult["email"]> {
  if (owner.email === null || isPhoneAccountEmail(owner.email)) return "no-address";
  try {
    const allowed =
      owner.userId === null ||
      (await emailPreferenceAllows(db, owner.userId, report.businessId, "monthly_report", (error) =>
        console.error("[monthly-report] Could not read the email preference, sending anyway.", { reportId: report.id, error: errorText(error) }),
      ));
    if (!allowed) return "owner-turned-off";
    const reportUrl = new URL(`/reports/${month}`, deps.customerOrigin).toString();
    // Each service's report has its own PDF link, which is what tells the outbox this report's email apart from another service's.
    const marker = new URL(`/reports/${month}/pdf?service=${report.service}`, deps.customerOrigin).toString();
    const message = monthlyReportEmail({
      to: owner.email,
      name: owner.name,
      serviceTitle: REPORT_SERVICE_TITLES[report.service],
      monthTitle: `${monthName(month)} ${monthRange(month).year}`,
      headline: content.headline,
      figures: content.figures,
      reportUrl,
      pdfUrl: marker,
    });
    if (await hasEmailContaining(db, { template: "monthly-report", toAddress: owner.email, text: marker, since: report.createdAt })) return "already-sent";
    await deps.send(message);
    return "sent";
  } catch (error) {
    console.error("[monthly-report] The report email could not be sent.", { reportId: report.id, error: errorText(error) });
    return "failed";
  }
}
