import { compare, describeChange } from "./delta";
import { summariseEnquiries, type EnquiryCounts } from "./enquiries";
import { headlineText, websiteHeadline } from "./headline";
import { monthName, previousMonthKey, type MonthKey } from "./period";
import { reportContentSchema, type ReportContent, type ReportFigure, type ReportList } from "./content";
import type { ListRow, SearchConsoleFigures, VisitorFigures } from "./traffic";

/*
 * The sentences of a monthly report (plan 58), built from measured facts only. Every function here is pure: the facts come
 * from packages/db/src/queries/report-facts.ts. A fact that is null was not measured and is left out; it is never shown as
 * zero. A service with nothing measured gets no report at all (the composers return null). There is no combined score.
 */

export type ReportCurrency = "INR" | "USD";

/** One line of work, dated (`YYYY-MM-DD`, the Indian calendar day). */
export interface DoneLine {
  readonly on: string;
  readonly text: string;
}

export interface SiteFacts {
  /** Checks of the live site in the month that answered (`up`) and that did not (`down`). */
  readonly up: number;
  readonly down: number;
  /** The latest phone speed score taken in the month and the day it was taken. */
  readonly phoneSpeed: { readonly score: number; readonly on: string } | null;
  /** The end date of the security certificate on the latest check of the month. */
  readonly certificateEndsOn: string | null;
}

export interface AdFacts {
  readonly spendCents: number | null;
  readonly enquiries: number | null;
}

export interface SocialFacts {
  readonly postsPublished: number;
  readonly postsPlanned: number;
  readonly reach: number | null;
  readonly followers: number | null;
  readonly profileVisits: number | null;
  readonly ads: AdFacts;
}

export interface SearchFacts {
  readonly keywordsPageOne: number | null;
  readonly keywordsPageOnePrevious: number | null;
  readonly pagesImproved: number;
  readonly listingsFixed: number;
}

export interface ReportFacts {
  readonly currency: ReportCurrency;
  readonly site: SiteFacts;
  /** Enquiry counts for the month and the month before. A channel never measured is null or missing. */
  readonly enquiries: { readonly current: EnquiryCounts; readonly previous: EnquiryCounts };
  readonly social: SocialFacts;
  readonly search: SearchFacts;
  /** Visitors from Google Analytics or our own site script, only when a source measured the whole month. */
  readonly traffic: VisitorFigures | null;
  /** Google search figures, only when Search Console measured the whole month. */
  readonly searchConsole: SearchConsoleFigures | null;
  readonly done: { readonly website: readonly DoneLine[]; readonly social: readonly DoneLine[]; readonly search: readonly DoneLine[] };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MAX_FIGURES = 8;
const MAX_DONE = 20;

/** "2026-10-29" as "29 Oct 2026". */
export function shortDate(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  const name = MONTHS[(month ?? 0) - 1];
  if (year === undefined || day === undefined || name === undefined) throw new RangeError(`Not a day: ${isoDay}`);
  return `${day} ${name} ${year}`;
}

function counts(currency: ReportCurrency): Intl.NumberFormat {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US");
}

function money(cents: number, currency: ReportCurrency): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** 99.96 stays 99.96, 100 becomes 100. */
const percent = (value: number): string => `${Number(value.toFixed(2))}%`;

/** Lines for "What we did": oldest first, capped, and honest about what the cap left out. */
function doneLines(lines: readonly DoneLine[]): string[] {
  const sorted = [...lines].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.text.localeCompare(b.text)));
  const words = sorted.map((line) => `${shortDate(line.on)}: ${line.text}`);
  if (words.length <= MAX_DONE) return words;
  return [...words.slice(0, MAX_DONE - 1), `And ${words.length - (MAX_DONE - 1)} more.`];
}

function validated(content: ReportContent): ReportContent {
  return reportContentSchema.parse(content);
}

/** The month's website enquiries and how they moved against the month before; null when no channel was measured. */
function websiteEnquiries(facts: ReportFacts, month: MonthKey) {
  const channels = (counts: EnquiryCounts): EnquiryCounts => ({
    website_form: counts.website_form ?? null,
    website_call: counts.website_call ?? null,
    website_whatsapp: counts.website_whatsapp ?? null,
    chatbot: counts.chatbot ?? null,
  });
  const current = summariseEnquiries(channels(facts.enquiries.current));
  const previous = summariseEnquiries(channels(facts.enquiries.previous));
  if (current.included.length === 0) return null;
  const likeForLike = current.included.length === previous.included.length && current.included.every((channel) => previous.included.includes(channel));
  const delta = likeForLike ? compare(current.total, previous.total) : null;
  return { summary: current, change: describeChange(delta, monthName(previousMonthKey(month))), previousTotal: likeForLike ? previous.total : null };
}

/** "4 (57%)", or just the count when there is nothing to share out. */
const share = (formatted: string, count: number, total: number): string => (total === 0 ? formatted : `${formatted} (${Math.round((count / total) * 100)}%)`);

/** A ranked stored list as report rows, each count worded by `unit(formatted count, count)`; null when there is nothing to rank. */
function rankedList(title: string, rows: readonly ListRow[], unit: (formatted: string, count: number) => string, number: Intl.NumberFormat): ReportList | null {
  const shown = rows.filter((row) => row.count > 0);
  return shown.length === 0 ? null : { title, rows: shown.map((row) => ({ label: row.key.slice(0, 120), value: unit(number.format(row.count), row.count) })) };
}

const present = <T,>(items: readonly (T | null)[]): T[] => items.filter((item): item is T => item !== null);

/** "1,203 (210 more than September)" or just the count, when last month was not measured the same way. */
function withChange(current: number, previous: number | null, previousName: string, number: Intl.NumberFormat): string {
  const change = previous === null ? null : describeChange(compare(current, previous), previousName);
  return change === null ? number.format(current) : `${number.format(current)} (${change})`;
}

export function composeWebsite(facts: ReportFacts, month: MonthKey): ReportContent | null {
  const name = monthName(month);
  const previousName = monthName(previousMonthKey(month));
  const number = counts(facts.currency);
  const { up, down } = facts.site;
  const checks = up + down;
  const uptime = checks === 0 ? null : (up / checks) * 100;
  const enquiries = websiteEnquiries(facts, month);
  const traffic = facts.traffic;
  const figures: ReportFigure[] = [];
  if (uptime !== null) figures.push({ label: `Online in ${name}`, value: `${percent(uptime)} of ${number.format(checks)} checks` });
  if (enquiries !== null) {
    const { total } = enquiries.summary;
    figures.push({ label: `Enquiries from your website in ${name}`, value: enquiries.change === null ? String(total) : `${total} (${enquiries.change})` });
  }
  if (traffic !== null) {
    figures.push({ label: `Visitors to your website in ${name}`, value: withChange(traffic.visitors, traffic.previous?.visitors ?? null, previousName, number) });
    figures.push({ label: `Pages viewed in ${name}`, value: withChange(traffic.pageviews, traffic.previous?.pageviews ?? null, previousName, number) });
  }
  if (facts.site.phoneSpeed !== null) figures.push({ label: `Speed on phones, ${shortDate(facts.site.phoneSpeed.on)}`, value: `${facts.site.phoneSpeed.score} out of 100` });
  if (facts.site.certificateEndsOn !== null) figures.push({ label: "Secure connection valid until", value: shortDate(facts.site.certificateEndsOn) });
  if (figures.length === 0) return null;
  const lists = present([
    enquiries === null
      ? null
      : rankedList(
          `Where your enquiries came from in ${name}`,
          enquiries.summary.rows.map((row) => ({ key: row.label, count: row.count })),
          (formatted, count) => share(formatted, count, enquiries.summary.total),
          number,
        ),
    traffic === null ? null : rankedList(`How visitors found your website in ${name}`, traffic.channels, (formatted) => formatted, number),
    traffic === null ? null : rankedList(`Most viewed pages in ${name}`, traffic.pages, (formatted) => `${formatted} views`, number),
  ]);
  const headline = websiteHeadline({
    uptimePercent: uptime,
    enquiries: enquiries?.summary.total ?? null,
    previousEnquiries: enquiries?.previousTotal ?? null,
    previousMonthName: enquiries?.previousTotal == null ? null : previousName,
  });
  return validated({
    headline: headline === null ? `Here are your website figures for ${name}.` : headlineText(headline),
    figures: figures.slice(0, MAX_FIGURES),
    whatWeDid: doneLines(facts.done.website),
    lists,
  });
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export function composeSocial(facts: ReportFacts, month: MonthKey): ReportContent | null {
  const name = monthName(month);
  const { social, currency } = facts;
  const number = counts(currency);
  const figures: ReportFigure[] = [];
  if (social.postsPublished > 0 || social.postsPlanned > 0) {
    figures.push({
      label: `Posts published in ${name}`,
      value: social.postsPlanned > 0 ? `${social.postsPublished} of ${social.postsPlanned} planned` : String(social.postsPublished),
    });
  }
  if (social.reach !== null) figures.push({ label: `People reached in ${name}`, value: number.format(social.reach) });
  if (social.followers !== null) figures.push({ label: `Followers in ${name}`, value: number.format(social.followers) });
  if (social.profileVisits !== null) figures.push({ label: `Profile visits in ${name}`, value: number.format(social.profileVisits) });
  const { spendCents, enquiries } = social.ads;
  if (spendCents !== null) figures.push({ label: `Ad spend in ${name}`, value: money(spendCents, currency) });
  if (enquiries !== null) figures.push({ label: `Enquiries from your ads in ${name}`, value: number.format(enquiries) });
  // The cost of one enquiry needs both figures and at least one enquiry: dividing by zero would invent a number.
  if (spendCents !== null && enquiries !== null && enquiries > 0) figures.push({ label: "Cost of one ad enquiry", value: money(Math.round(spendCents / enquiries), currency) });
  if (figures.length === 0) return null;
  const sentences: string[] = [];
  if (social.postsPublished > 0) sentences.push(`We published ${plural(social.postsPublished, "post", "posts")} for you in ${name}`);
  if (enquiries !== null && enquiries > 0) sentences.push(`Your ads brought ${plural(enquiries, "enquiry", "enquiries")}`);
  else if (social.reach !== null) sentences.push(`Your posts reached ${number.format(social.reach)} people in ${name}`);
  return validated({
    headline: sentences.length === 0 ? `Here are your social media figures for ${name}.` : `${sentences.join(". ")}.`,
    figures: figures.slice(0, MAX_FIGURES),
    whatWeDid: doneLines(facts.done.social),
  });
}

export function composeSearch(facts: ReportFacts, month: MonthKey): ReportContent | null {
  const name = monthName(month);
  const previousName = monthName(previousMonthKey(month));
  const { search } = facts;
  const figures: ReportFigure[] = [];
  let keywordSentence: string | null = null;
  if (search.keywordsPageOne !== null) {
    const change = describeChange(compare(search.keywordsPageOne, search.keywordsPageOnePrevious), previousName);
    figures.push({ label: `Keywords on page one of Google in ${name}`, value: change === null ? String(search.keywordsPageOne) : `${search.keywordsPageOne} (${change})` });
    keywordSentence = `You were on page one of Google for ${plural(search.keywordsPageOne, "keyword", "keywords")} in ${name}`;
  }
  if (search.pagesImproved > 0) figures.push({ label: `Pages we improved in ${name}`, value: String(search.pagesImproved) });
  if (search.listingsFixed > 0) figures.push({ label: `Listings we fixed in ${name}`, value: String(search.listingsFixed) });
  const calls = facts.enquiries.current.google_profile_call ?? null;
  if (calls !== null) figures.push({ label: `Calls from your Google profile in ${name}`, value: String(calls) });
  const google = facts.searchConsole;
  const number = counts(facts.currency);
  if (google !== null) {
    // Search Console's own figures lead: they are what people did on Google, before the work we did about it.
    figures.unshift(
      { label: `Clicks from Google search in ${name}`, value: withChange(google.clicks, google.previous?.clicks ?? null, previousName, number) },
      { label: `Times you appeared in Google search in ${name}`, value: withChange(google.impressions, google.previous?.impressions ?? null, previousName, number) },
      ...(google.position === null ? [] : [{ label: `Average position in Google search in ${name}`, value: google.position.toFixed(1) }]),
    );
  }
  if (figures.length === 0) return null;
  const work: string[] = [];
  if (search.pagesImproved > 0) work.push(plural(search.pagesImproved, "page", "pages"));
  if (search.listingsFixed > 0) work.push(plural(search.listingsFixed, "listing", "listings"));
  const sentences = [
    ...(google === null ? [] : [`People clicked through to your website from Google ${plural(google.clicks, "time", "times")} in ${name}`]),
    ...(work.length === 0 ? [] : [`We improved ${work.join(" and ")} for you in ${name}`]),
    ...(keywordSentence === null ? [] : [keywordSentence]),
  ];
  const lists = present([
    google === null ? null : rankedList(`Top searches that found you in ${name}`, google.queries, (formatted) => `${formatted} clicks`, number),
    google === null ? null : rankedList(`Top pages from Google in ${name}`, google.pages, (formatted) => `${formatted} clicks`, number),
  ]);
  return validated({
    headline: sentences.length === 0 ? `Here are your search figures for ${name}.` : `${sentences.join(". ")}.`,
    figures: figures.slice(0, MAX_FIGURES),
    whatWeDid: doneLines(facts.done.search),
    lists,
  });
}
