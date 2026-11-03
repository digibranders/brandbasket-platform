import "server-only";
import {
  countIncludedEdits,
  listActivityEvents,
  listDeliverablesForBusiness,
  listEnquiries,
  listMonthlySnapshots,
  listRequestItems,
  listRequestNeeds,
  listWaitingOnYou,
  listWaitingPosts,
  withTenantScope,
  type ScopedTransaction,
} from "@brandbasket/db";
import { dayKey } from "@brandbasket/shared/lib/call-slots";
import { nextBundledNetCents, nextDiscountCents } from "@brandbasket/shared/lib/billing/bundle";
import { nextPaymentDate } from "@brandbasket/shared/lib/billing/period";
import { paymentsContinue } from "@brandbasket/shared/lib/billing/payments-continue";
import { renewalCharge } from "@brandbasket/shared/lib/billing/terms";
import { includedEditsAllowed, monthBoundsIst } from "@brandbasket/shared/lib/change-requests";
import { canBookCalls } from "@/features/calls/loader";
import { callRows, reasonOptions, type CallRow, type ReasonOption } from "@/features/calls/rules";
import { callsOpenFor, readBookingUrl, readKickoffFacts, readMissedKickoffAt, readTeamCalls, type LiveWebsite } from "@/features/calls/server/calls";
import { requestRows } from "@/features/requests/rules";
import { adsView, monthName } from "@/features/social/rules";
import { pageOne, type PageOne } from "@/features/search/rules";
import { loadChecklistSummary, type ChecklistSummary } from "@/features/checklist/loader";
import { loadSiteHealth } from "@/features/website/loader";
import { homeHealthLine } from "@/features/website/rules/health";
import { getAppDb } from "@/lib/db";
import { APP_TIME_ZONE, formatDate } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import {
  activityRows,
  deriveClientHomeState,
  enquirySeries,
  enquiryWindowStart,
  finishedDeliverableRows,
  finishedRequestRows,
  homeLayoutOf,
  needsYou,
  stillAhead,
  type ActivityRow,
  type ClientHomeState,
  type EnquirySeries,
  type HomeLayout,
  type NeedsYouItem,
} from "./rules";

/*
 * Home's data, one loader per panel (BUILD-RULES rule 6). Each panel loads on its own: a failed read shows that panel's
 * error and never a different Home state. The read that decides the state is loadHomeState: when it fails the page shows
 * an error rather than a guessed state (apps/platform treated a failed booking read as "not booked" and asked again).
 */

const scoped = <T>(customer: CustomerContext, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> => withTenantScope(getAppDb(), customer.tenant, work);

/** Everything the state was worked out from that the screens also say in words. Plain data for the client components. */
export interface HomeStateView {
  readonly state: ClientHomeState;
  readonly layout: HomeLayout;
  readonly kickoff: { readonly startsAt: Date | null; readonly endsAt: Date | null; readonly heldAt: Date | null; readonly summary: string | null } | null;
  readonly project: {
    /** The first preview's promised date, only while it is still ahead. */
    readonly slaDueAt: Date | null;
    readonly previewSentAt: Date | null;
    readonly launchPlannedOn: string | null;
    readonly revisionRoundsIncluded: number;
    readonly revisionRoundsGranted: number;
  } | null;
  readonly live: LiveWebsite | null;
  /** Calls after the kickoff can be booked (paid, and the first look is over). */
  readonly callsOpen: boolean;
}

/** The facts behind Home's state, read together. Ported from apps/platform lib/server/home.ts loadHome's first half. */
export function loadHomeState(customer: CustomerContext, now: Date): Promise<Loaded<HomeStateView>> {
  return load("home.state", async () => {
    const facts = await readKickoffFacts(customer);
    const { booking, project, live } = facts;
    const { billing, services } = customer;
    // Only a business with no booking can be showing a miss, so the outcome is read only then, and only for the website.
    const missedKickoffAt = booking === null && services.includes("website") && billing.status === "paid" ? await readMissedKickoffAt(customer) : null;
    const state = deriveClientHomeState({
      now,
      billing: { status: billing.status, paymentUnderReview: billing.paymentUnderReview },
      services,
      kickoff: booking === null ? null : { startsAt: booking.startsAt, endsAt: booking.endsAt, heldAt: booking.heldAt },
      missedKickoffAt,
      project: project === null ? null : { status: project.status, slaDueAt: stillAhead(project.slaDueAt, now), onHoldReason: project.onHoldReason },
      live,
    });
    return {
      state,
      layout: homeLayoutOf(state),
      kickoff: booking === null ? null : { startsAt: booking.startsAt, endsAt: booking.endsAt, heldAt: booking.heldAt, summary: booking.summary },
      project:
        project === null
          ? null
          : {
              slaDueAt: stillAhead(project.slaDueAt, now),
              previewSentAt: project.previewSentAt,
              launchPlannedOn: project.launchPlannedOn,
              revisionRoundsIncluded: project.revisionRoundsIncluded,
              revisionRoundsGranted: project.revisionRoundsGranted,
            },
      live,
      callsOpen: callsOpenFor(customer, facts, now),
    };
  });
}

/** What Book a call needs on Home, or null when calls are not open or there is no booking page. */
export interface HomeBooking {
  readonly bookingUrl: string | null;
  readonly canBook: boolean;
  readonly options: readonly ReasonOption[];
}

/** The booking page and who may book. Its own read: a failure leaves the booking page link out and is reported. */
export function loadBooking(customer: CustomerContext): Promise<Loaded<HomeBooking>> {
  return load("home.booking", async () => ({ bookingUrl: await readBookingUrl(), canBook: canBookCalls(customer), options: reasonOptions(customer.services) }));
}

/** The setup checklist's items, for the kickoff states' Task panel and Needs you. */
export function loadChecklist(customer: CustomerContext): Promise<Loaded<ChecklistSummary>> {
  return load("home.checklist", () => loadChecklistSummary(customer));
}

/** "Tue 1 Dec": the earliest day among the posts waiting for the customer's OK. */
async function readWaitingPosts(customer: CustomerContext, tx: ScopedTransaction): Promise<{ readonly count: number; readonly by: string | null }> {
  if (!customer.services.includes("social")) return { count: 0, by: null };
  const days = (await listWaitingPosts(tx, customer.businessId)).flatMap((row) => (row.kind === "post" && row.dueOn !== null ? [row.dueOn] : [])).sort();
  return { count: days.length, by: days[0] ?? null };
}

/** Needs you: posts to approve, quotes and changes, replies, and the blocking setup questions. */
export function loadNeedsYou(customer: CustomerContext, checklist: Loaded<ChecklistSummary>, now: Date = new Date()): Promise<Loaded<readonly NeedsYouItem[]>> {
  return load("home.needs", async () => {
    // A failed checklist read must not hide its questions silently: the panel fails with it.
    if (!checklist.ok) throw new Error("The setup checklist could not be read for Needs you.");
    const { user, businessId } = customer;
    const read = await scoped(customer, async (tx) => ({
      posts: await readWaitingPosts(customer, tx),
      needs: await listRequestNeeds(tx, user.id, businessId),
      waiting: await listWaitingOnYou(tx, user.id, businessId),
    }));
    const by = read.posts.by;
    const failingUntil = customer.billing.renewalFailingUntil;
    return needsYou({
      ...read,
      posts: { count: read.posts.count, by: by === null ? null : formatDay(by, now) },
      checklist: checklist.data.items,
      renewalFailing: failingUntil === null ? null : { until: formatDate(failingUntil, now) },
    });
  });
}

/** "Tue 1 Dec" for an India day (`YYYY-MM-DD`). */
const formatDay = (day: string, now: Date): string => formatDate(new Date(`${day}T12:00:00+05:30`), now);

/** How far back What we did looks for finished work. */
const ENQUIRY_LOOKBACK_DAYS = 30;

/** How many enquiries a page of the list holds (the query's ceiling). */
const ENQUIRY_PAGE = 200;
/** Enough pages for 60 days of a busy business; past it the chart would undercount, so the read fails instead. */
const ENQUIRY_PAGES = 25;

/**
 * Enquiries per day for the last 30 days and the 30 before, from `enquiries`. Read newest first, a page at a time, until the
 * window is passed (shortcut: the db package has no count-by-day query; add one when a business passes 5,000 in 60 days).
 */
export function loadEnquiries(customer: CustomerContext, now: Date): Promise<Loaded<EnquirySeries>> {
  return load("home.enquiries", async () => {
    const since = enquiryWindowStart(now).getTime();
    const received: Date[] = [];
    await scoped(customer, async (tx) => {
      for (let page = 0; page < ENQUIRY_PAGES; page += 1) {
        const rows = await listEnquiries(tx, { limit: ENQUIRY_PAGE, offset: page * ENQUIRY_PAGE });
        for (const row of rows) if (row.receivedAt.getTime() >= since) received.push(row.receivedAt);
        const last = rows[rows.length - 1];
        if (rows.length < ENQUIRY_PAGE || last === undefined || last.receivedAt.getTime() < since) return;
      }
      throw new Error("Too many enquiries in the last 60 days to count them a page at a time.");
    });
    return enquirySeries(received, now);
  });
}

/** One row of Your services. */
export interface ServiceLine {
  readonly service: "website" | "social" | "search";
  /** What is true now, from a stored fact, or null when nothing is measured yet. */
  readonly line: string | null;
  readonly needsYou: boolean;
}

/** The India month's key in monthly_snapshots (`YYYY-MM-01`). */
function monthKey(now: Date): string {
  return `${dayKey(now.toISOString(), APP_TIME_ZONE).slice(0, 7)}-01`;
}

/** Your services: each bought service with this month's measured figure, and whether something waits on the customer. */
export function loadServices(customer: CustomerContext, view: HomeStateView, now: Date): Promise<Loaded<readonly ServiceLine[]>> {
  return load("home.services", async () => {
    const { snapshots, posts } = await scoped(customer, async (tx) => ({
      snapshots: await listMonthlySnapshots(tx, customer.businessId, monthKey(now)),
      posts: await readWaitingPosts(customer, tx),
    }));
    // Its own load, so a failed read leaves the rest of the line (and the panel) as it was; the failure is reported.
    const health = view.live !== null && customer.services.includes("website") ? await loadSiteHealth(customer.tenant, now) : null;
    const healthLine = health !== null && health.ok ? homeHealthLine(health.data, now) : null;
    const social = snapshots.find((row) => row.service === "social");
    const search = snapshots.find((row) => row.service === "search");
    return customer.services.map((service): ServiceLine => {
      switch (service) {
        case "website":
          return {
            service,
            line: view.live === null ? null : [`Live at ${view.live.hostname}.`, healthLine].filter((part) => part !== null).join(" "),
            needsYou: view.state.kind === "preview_ready",
          };
        case "social": {
          const published = social?.postsPublished ?? null;
          const waiting = posts.count === 0 ? null : posts.count === 1 ? "1 post is waiting for your approval." : `${String(posts.count)} posts are waiting for your approval.`;
          const done = published === null ? null : published === 1 ? "1 post published this month." : `${String(published)} posts published this month.`;
          return { service, line: [done, waiting].filter((part) => part !== null).join(" ") || null, needsYou: posts.count > 0 };
        }
        case "search": {
          const pageOne = search?.keywordsPageOne ?? null;
          return { service, line: pageOne === null ? null : `${String(pageOne)} tracked ${pageOne === 1 ? "search" : "searches"} on Google page one.`, needsYou: false };
        }
      }
    });
  });
}

/** The last-30-days strip's figures that come from the month's numbers staff enter: each null when it was not measured. */
export interface StripFigures {
  readonly month: string;
  readonly adLeads: { readonly count: number; readonly updatedAt: Date | null } | null;
  readonly pageOne: PageOne | null;
}

/** Leads from ads (Social) and searches on Google page one (Local SEO + AEO), from `monthly_snapshots`. Website visits have no source and are not here. */
export function loadFigures(customer: CustomerContext, now: Date): Promise<Loaded<StripFigures>> {
  return load("home.figures", async () => {
    const snapshots = await scoped(customer, (tx) => listMonthlySnapshots(tx, customer.businessId, monthKey(now)));
    const ads = customer.services.includes("social") ? adsView({ snapshot: snapshots.find((row) => row.service === "social") ?? null, adCreditCents: 0, currency: customer.currency }) : null;
    const search = customer.services.includes("search") ? (snapshots.find((row) => row.service === "search") ?? null) : null;
    return {
      month: monthName(now),
      adLeads: ads === null || ads.leads === null ? null : { count: ads.leads, updatedAt: ads.updatedAt },
      pageOne: pageOne(search),
    };
  });
}

/** What we did: staff updates, published posts, finished search work and requests done, the preview going out and the launch, newest first. */
export function loadActivity(customer: CustomerContext, view: HomeStateView, now: Date): Promise<Loaded<readonly ActivityRow[]>> {
  return load("home.activity", async () => {
    const today = dayKey(now.toISOString(), APP_TIME_ZONE);
    const from = dayKey(new Date(now.getTime() - ENQUIRY_LOOKBACK_DAYS * 86_400_000).toISOString(), APP_TIME_ZONE);
    const read = await scoped(customer, async (tx) => ({
      events: await listActivityEvents(tx, customer.businessId, 8),
      // Only the services on the plan have work; each read is limited to the last 30 days by its date.
      deliverables: (
        await Promise.all(
          (["social", "search"] as const)
            .filter((service) => customer.services.includes(service))
            .map((service) => listDeliverablesForBusiness(tx, customer.businessId, { service, from, to: today })),
        )
      ).flat(),
      requests: await listRequestItems(tx, customer.user.id, customer.businessId, 30),
    }));
    return activityRows({
      events: read.events.map((event) => ({ id: event.id, occurredAt: event.occurredAt, title: event.title, service: event.service })),
      previewSentAt: view.project?.previewSentAt ?? null,
      launchedAt: view.live?.launchedAt ?? null,
      hostname: view.live?.hostname ?? null,
      finished: [...finishedDeliverableRows(read.deliverables), ...finishedRequestRows(requestRows(read.requests))],
      limit: 6,
    });
  });
}

export interface ComingUp {
  readonly call: CallRow | null;
  /** Posts still to go out from today to Sunday, India week. */
  readonly postsThisWeek: number;
  /** The next payment: its date, and its amount (null when it cannot be worked out: "To be confirmed"). */
  readonly payment: { readonly date: Date; readonly amount: string | null } | null;
}

/** Sunday of the India week containing `now`, as `YYYY-MM-DD`, and today. */
function restOfWeek(now: Date): { readonly from: string; readonly to: string } {
  const today = dayKey(now.toISOString(), APP_TIME_ZONE);
  const noon = new Date(`${today}T12:00:00+05:30`);
  const toSunday = (7 - noon.getUTCDay()) % 7;
  return { from: today, to: dayKey(new Date(noon.getTime() + toSunday * 86_400_000).toISOString(), APP_TIME_ZONE) };
}

/** Coming up: the next call, the posts going out this week, and the next payment. */
export function loadComingUp(customer: CustomerContext, view: HomeStateView, now: Date): Promise<Loaded<ComingUp>> {
  return load("home.coming-up", async () => {
    const week = restOfWeek(now);
    const [calls, posts] = await Promise.all([
      readTeamCalls(customer),
      customer.services.includes("social") ? scoped(customer, (tx) => listDeliverablesForBusiness(tx, customer.businessId, { service: "social", from: week.from, to: week.to })) : Promise.resolve([]),
    ]);
    const rows = callRows({ calls, kickoff: view.kickoff, now });
    const { billing } = customer;
    const subscription = billing.subscription;
    // While a renewal is failing the retry is the provider's, not a date we promise: Needs you carries the payment instead.
    const date = !billing.hasAccess || billing.renewalFailingUntil !== null || subscription === null || !paymentsContinue(subscription) ? null : nextPaymentDate(subscription, now);
    const amount = subscription === null || billing.plan === null ? null : renewalCharge(billing.plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
    return {
      call: rows.upcoming[0] ?? null,
      postsThisWeek: posts.filter((post) => post.kind === "post" && post.status !== "published" && post.dueOn !== null && post.dueOn >= week.from && post.dueOn <= week.to).length,
      payment: date === null ? null : { date, amount },
    };
  });
}

/** Small edits used this month, or null when the plan has none (only the Managed Website carries them). */
export interface IncludedEdits {
  readonly used: number;
  readonly allowed: number;
  /** The first moment of next month in India, when the count starts again. */
  readonly resetsAt: Date;
}

/** Ported from apps/platform lib/server/overview.ts: 2 a month with the website, counted in India months. */
export function loadIncludedEdits(customer: CustomerContext, now: Date): Promise<Loaded<IncludedEdits | null>> {
  return load("home.included", async () => {
    const allowed = includedEditsAllowed(customer.billing.hasWebsite);
    if (allowed === 0) return null;
    const month = monthBoundsIst(now);
    const used = await scoped(customer, (tx) => countIncludedEdits(tx, customer.businessId, month));
    return { used, allowed, resetsAt: month.to };
  });
}

/** The panels each layout draws. A panel a layout does not draw is not read. */
export interface HomePanels {
  readonly booking: Loaded<HomeBooking>;
  readonly checklist: Loaded<ChecklistSummary> | null;
  readonly needs: Loaded<readonly NeedsYouItem[]> | null;
  readonly enquiries: Loaded<EnquirySeries> | null;
  /** Leads from ads and Google page one, for the last-30-days strip. */
  readonly figures: Loaded<StripFigures> | null;
  readonly services: Loaded<readonly ServiceLine[]> | null;
  readonly activity: Loaded<readonly ActivityRow[]> | null;
  readonly coming: Loaded<ComingUp> | null;
  readonly included: Loaded<IncludedEdits | null> | null;
}

const KICKOFF_KINDS: readonly string[] = ["kickoff_unbooked", "kickoff_booked", "kickoff_unconfirmed"];

/**
 * Reads the panels for the layout the state chose, all at once and each on its own. The payment states read nothing more: they
 * have one task and Plan & billing owns the rest (as the old unpaid Home did).
 */
export async function loadHomePanels(customer: CustomerContext, view: HomeStateView, now: Date): Promise<HomePanels> {
  const none: HomePanels = { booking: await loadBooking(customer), checklist: null, needs: null, enquiries: null, figures: null, services: null, activity: null, coming: null, included: null };
  if (view.layout === "task") {
    if (!KICKOFF_KINDS.includes(view.state.kind)) return none;
    return { ...none, checklist: view.state.kind === "kickoff_booked" ? await loadChecklist(customer) : null };
  }
  const checklist = await loadChecklist(customer);
  const overview = view.layout === "overview";
  const [needs, enquiries, figures, services, activity, coming, included] = await Promise.all([
    // A viewer can act on nothing in Needs you, so the panel is not read for them.
    customer.role === "viewer" ? Promise.resolve(null) : loadNeedsYou(customer, checklist, now),
    overview && customer.services.includes("website") ? loadEnquiries(customer, now) : Promise.resolve(null),
    overview && (customer.services.includes("social") || customer.services.includes("search")) ? loadFigures(customer, now) : Promise.resolve(null),
    overview ? loadServices(customer, view, now) : Promise.resolve(null),
    loadActivity(customer, view, now),
    view.layout === "review" ? Promise.resolve(null) : loadComingUp(customer, view, now),
    overview || view.state.kind === "launched" ? loadIncludedEdits(customer, now) : Promise.resolve(null),
  ]);
  return { ...none, checklist, needs, enquiries, figures, services, activity, coming, included };
}
