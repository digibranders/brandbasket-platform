import { createHash, randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, count, eq, like, ne, sql } from "drizzle-orm";
import { createAuth, createVerifiedEmailAccountWithGrant } from "@brandbasket/auth";
import { discountCentsFor } from "../../billing/src/referral";
import { chargedAmountCents } from "../../billing/src/tax";
import { addMonthsUtc } from "../../billing/src/term";
import { AFFILIATE_LOGIN_LINK_DAYS, affiliateSetupPath } from "../../shared/src/lib/affiliate-links";
import { adCreditCentsAtCheckout, packageLines } from "../../shared/src/lib/billing/packages";
import { monthBoundsIst } from "../../shared/src/lib/change-requests";
import { activateFirstPayment, activateRenewalPayment } from "../../shared/src/server/billing-activation";
import { createDatabase, type Database } from "../src/client";
import { findWorkspaceRoot, loadLocalEnv, requireEnv } from "../src/local-env";
import { setUserPhoneNumber } from "../src/queries/account-otps";
import {
  cancelAffiliateEarning,
  claimAffiliateLoginLink,
  createAffiliate,
  findAffiliateByUserId,
  issueAffiliateLoginLink,
  listOwedEarningIds,
  recordAffiliatePayout,
  type Affiliate,
} from "../src/queries/affiliates";
import { findActivePlan, findLatestSubscriptionForBusiness, openCheckoutSubscription, updateSubscriptionProviderStatus, type PaymentMethodDetails } from "../src/queries/billing";
import { bundledNetCents, type NewBundledAddOn } from "../src/queries/bundled-add-ons";
import { acceptBusinessInvite, createBusinessInvite, listBusinessInvites } from "../src/queries/business-invites";
import { setBusinessWebsiteUrl } from "../src/queries/business-website";
import { startChangeWithoutQuote, moveChangeAsStaff, sendChangeQuote } from "../src/queries/change-request-staff";
import { countChatbotLeadsForBusiness, applyChatbotQualification, listChatbotsForBusiness, recordChatbotLead, registerChatbot, setChatbotStatus } from "../src/queries/chatbots";
import { saveConnectedAccount } from "../src/queries/connected-accounts";
import { approveDeliverables, findDeliverableForBusiness, insertDeliverable, moveDeliverable } from "../src/queries/deliverables";
import { backfillEnquiries, updateEnquiry } from "../src/queries/enquiries";
import { firstPreviewDueAfterKickoff, markProjectReadyAfterKickoff } from "../src/queries/kickoff-build";
import { createUnlistedAccountBusiness } from "../src/queries/directory-ads";
import { insertBusiness } from "../src/queries/onboarding";
import { savePrimaryDomain } from "../src/queries/onboarding-data";
import { upsertMonthlySnapshot } from "../src/queries/monthly-snapshots";
import { findSiteSetting, saveSiteSetting } from "../src/queries/site-settings";
import { listPreviewVersions, recordPreviewVersion } from "../src/queries/project-preview-versions";
import { approveProjectPreview, insertOnboardingProject, markProjectLive, recordProjectPreviewSent, requestProjectRevisions } from "../src/queries/projects";
import { setProjectBuilding } from "../src/queries/project-website";
import { saveProvisionedSource } from "../src/queries/google-provisioning";
import { composeReport, moveReport, recordSourceRun, setReportSourceStatus, upsertBreakdown, upsertDailyMetrics, upsertReportSource } from "../src/queries/reports";
import { findSetupCallBooking, markSetupCallHeld, recordSetupCallBooking, saveSetupCallSummary } from "../src/queries/setup-calls";
import { recordFailedPayment } from "../src/queries/staff-payments";
import { createReferralCode, listReferralCodes, type NewReferralCode, type ReferralCode } from "../src/queries/referrals";
import { createSupportTicketWithOutcome } from "../src/queries/support";
import { saveBillingProfile } from "../src/queries/tax-invoices";
import { markTeamCallHeld, recordTeamCall, saveTeamCallSummary } from "../src/queries/team-calls";
import { syncWebsitePages } from "../src/queries/website-pages";
import { withCustomerRole } from "../src/scope";
import { slugify } from "../src/slug";
import {
  affiliateEarnings,
  affiliatePayouts,
  affiliates,
  businessMembers,
  businesses,
  changeRequests,
  enquiries,
  projects,
  siteEvents,
  staffMembers,
  subscriptions,
  taxInvoices,
  users,
  type PostChannel,
  type PostFormat,
  type SiteEventKind,
} from "../src/schema";

/*
 * Local seed for the customer app v4: one business per state, so every screen can be seen and tested.
 *   1 preview ready     Patel Tiffin Kitchen        website project waiting for the customer, one round used
 *   2 live, all three   Kulkarni Physio & Wellness  a month in: enquiries, requests, posts, report, invoices, team, calls
 *   3 lapsed            Reddy Driving School        plan ended, site offline, history still readable
 *   4 renewal failing   Chatterjee Photo Studio     last renewal failed, still inside the paid period
 *   5 unpaid sign-up    Iyer Filter Coffee House    a sign-up that chose Managed Website and has not paid
 * The live one also gets 60 days of first-party visit numbers (seedVisits), for the Website screen's Visits panels.
 * Plus an affiliate (Rohan Mehta, /affiliate) with three codes, four members in different states, earnings over six
 * months, one payout with tax kept back and one refunded month; and a second affiliate with an open setup link.
 * Every write goes through the same query helpers the apps use. Written directly, because no helper exists: staff_members
 * (the seed's one staff account), site_events (call, WhatsApp and form taps) and businesses.country_code / state_code for
 * the four website businesses and the affiliate's members, and affiliate_earnings.created_at (set to its payment's date).
 * Re-running is safe: each step checks what exists first, accounts already made are reused,
 * and nothing is ever deleted.
 * Run with `pnpm --filter @brandbasket/db db:seed:v4` (the script sets the react-server condition the shared billing code needs).
 */

const SEEDABLE_DATABASES: readonly string[] = ["brandbasket_platform_v4", "brandbasket_platform_v4b", "brandbasket_platform_preview"];
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const IST_OFFSET_MS = 330 * MINUTE_MS;
const CURRENCY = "INR" as const;
const FAKE = "fake" as const;

/** The booking link the local kickoff and call screens need (site setting setup_call_url). Not Cal.com or Calendly, so the app uses its local stand-in scheduler. */
const LOCAL_BOOKING_LINK = "https://book.example.test/kickoff";

/** An id the fake provider accepts (fake_sub_ and 24 lower-case hex digits), the same every run for the same seed key. */
function fakeSubscriptionId(seedKey: string): string {
  return `fake_sub_${createHash("sha1").update(seedKey).digest("hex").slice(0, 24)}`;
}
const LOGINS_HEADING = "# Customer app v4 state seeds (pnpm --filter @brandbasket/db db:seed:v4), local only, database brandbasket_platform_v4";

type Stage = "preview" | "live" | "lapsed" | "failing" | "unpaid";
type ServiceId = "managed-website" | "digital-growth" | "local-seo-aeo";

/** Days after the first payment that each project step happened. */
interface Timeline {
  readonly kickoff: number;
  readonly v1: number;
  readonly v2: number | null;
  readonly live: number | null;
}

interface Spec {
  readonly name: string;
  readonly ownerName: string;
  readonly ownerPhone: string;
  readonly stage: Stage;
  readonly services: readonly ServiceId[];
  readonly stateCode: string;
  readonly billing: { readonly legalName: string; readonly line1: string; readonly line2: string | null; readonly city: string; readonly postalCode: string };
  readonly paidDaysAgo: number;
  readonly renewals: number;
  readonly timeline: Timeline | null;
  readonly method: PaymentMethodDetails;
  readonly handle: string;
}

const upi = (vpa: string): PaymentMethodDetails => ({ method: "upi", cardNetwork: null, cardLast4: null, cardType: null, cardIssuer: null, upiVpa: vpa });
const card = (network: string, last4: string, type: string, issuer: string): PaymentMethodDetails => ({ method: "card", cardNetwork: network, cardLast4: last4, cardType: type, cardIssuer: issuer, upiVpa: null });

const SPECS: readonly Spec[] = [
  {
    name: "Patel Tiffin Kitchen",
    ownerName: "Hetal Patel",
    ownerPhone: "+917698214035",
    stage: "preview",
    services: ["managed-website"],
    stateCode: "gj",
    billing: { legalName: "Patel Tiffin Kitchen", line1: "14, Shreeji Apartments, Vastrapur", line2: null, city: "Ahmedabad", postalCode: "380015" },
    paidDaysAgo: 6,
    renewals: 0,
    timeline: { kickoff: 1, v1: 3, v2: 5, live: null },
    method: upi("hetal.patel@okicici"),
    handle: "patel_tiffin_kitchen",
  },
  {
    name: "Kulkarni Physio & Wellness",
    ownerName: "Anjali Kulkarni",
    ownerPhone: "+919822047316",
    stage: "live",
    services: ["managed-website", "digital-growth", "local-seo-aeo"],
    stateCode: "mh",
    billing: { legalName: "Kulkarni Physio & Wellness", line1: "Shop 6, Sai Plaza, Karve Road, Kothrud", line2: null, city: "Pune", postalCode: "411038" },
    paidDaysAgo: 40,
    renewals: 1,
    timeline: { kickoff: 1, v1: 4, v2: 7, live: 9 },
    method: card("visa", "4821", "credit", "HDFC Bank"),
    handle: "kulkarniphysio.pune",
  },
  {
    name: "Reddy Driving School",
    ownerName: "Srinivas Reddy",
    ownerPhone: "+919848316027",
    stage: "lapsed",
    services: ["managed-website", "digital-growth"],
    stateCode: "tg",
    billing: { legalName: "Reddy Driving School", line1: "Plot 22, Road No. 3, Banjara Hills", line2: null, city: "Hyderabad", postalCode: "500034" },
    paidDaysAgo: 113,
    renewals: 2,
    timeline: { kickoff: 1, v1: 5, v2: null, live: 9 },
    method: card("mastercard", "7733", "debit", "State Bank of India"),
    handle: "reddydrivingschool.hyd",
  },
  {
    name: "Chatterjee Photo Studio",
    ownerName: "Soumya Chatterjee",
    ownerPhone: "+919830512746",
    stage: "failing",
    services: ["managed-website"],
    stateCode: "wb",
    billing: { legalName: "Chatterjee Photo Studio", line1: "27/1, Lake Gardens Road", line2: "Near Dhakuria Station", city: "Kolkata", postalCode: "700045" },
    paidDaysAgo: 57,
    renewals: 1,
    timeline: { kickoff: 1, v1: 4, v2: null, live: 7 },
    method: upi("soumya.c@oksbi"),
    handle: "chatterjeephotostudio",
  },
  {
    name: "Iyer Filter Coffee House",
    ownerName: "Lakshmi Iyer",
    ownerPhone: "+919840273158",
    stage: "unpaid",
    services: ["managed-website"],
    stateCode: "tn",
    billing: { legalName: "Iyer Filter Coffee House", line1: "9, Venkatesa Agraharam Street, Mylapore", line2: null, city: "Chennai", postalCode: "600004" },
    paidDaysAgo: 0,
    renewals: 0,
    timeline: null,
    method: upi("lakshmi.iyer@okaxis"),
    handle: "iyercoffeehouse",
  },
];

/* ---------------------------------------------------------------------------------------------------------------- */
/* Small helpers                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------------- */

interface Context {
  readonly db: Database;
  readonly auth: ReturnType<typeof createAuth>;
  readonly now: Date;
  readonly today: string;
  readonly siteBaseDomain: string;
  readonly loginsFile: string;
  staffId: string;
  headingWritten: boolean;
}

function must<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

const pad = (value: number): string => String(value).padStart(2, "0");
const istDate = (at: Date): string => new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const atIst = (date: string, hour: number, minute = 0): Date => new Date(`${date}T${pad(hour)}:${pad(minute)}:00+05:30`);
const shiftDate = (date: string, days: number): string => {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
};
const monthStartOf = (date: string): string => `${date.slice(0, 8)}01`;
const monthName = (monthStart: string): string => new Date(`${monthStart}T00:00:00Z`).toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
const earlier = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

/** A repeatable pseudo-random stream, so the same business gets the same shape of data on every run. */
function randomStream(seed: string): () => number {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fixed id for a seeded row, so a second run finds the row it made. */
function stableUuid(seed: string): string {
  const hex = createHash("sha1").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Refuses anything that is not the local dev database, before a single write. The URL itself is never printed. */
function assertLocalDevDatabase(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL_STAFF is not a valid URL. Refusing to seed.");
  }
  if (!LOCAL_HOSTS.has(url.hostname)) throw new Error(`Refusing to seed: the database host is "${url.hostname}", not localhost, 127.0.0.1 or ::1.`);
  if (!SEEDABLE_DATABASES.some((name) => url.pathname === `/${name}`)) throw new Error(`Refusing to seed: the database is not one of ${SEEDABLE_DATABASES.join(", ")}.`);
  if (url.searchParams.has("host")) throw new Error("Refusing to seed: the connection URL has a host query parameter, which can redirect it.");
}

/** Writes one login line to the shared file at once, so a later failure cannot lose a password that is already set. */
function recordLogin(context: Context, email: string, password: string, label: string): void {
  const heading = context.headingWritten ? "" : `\n${LOGINS_HEADING}, added ${context.today}\n`;
  appendFileSync(context.loginsFile, `${heading}${email}  ${password}  (${label})\n`);
  context.headingWritten = true;
}

function newPassword(): string {
  return `${randomBytes(18).toString("base64url")}Aa1!`;
}

/** The account for an email, made with a random password the first time and reused after that. Returns its id. */
async function ensureAccount(context: Context, input: { readonly email: string; readonly name: string; readonly label: string; readonly phone?: string }): Promise<string> {
  const found = await context.db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  let userId = found[0]?.id;
  if (userId === undefined) {
    const password = newPassword();
    const created = await createVerifiedEmailAccountWithGrant(context.auth, context.db, { email: input.email, name: input.name, password });
    recordLogin(context, input.email, password, input.label);
    userId = created.userId;
    console.log(`  Account made: ${input.email}`);
  }
  if (input.phone !== undefined) await setUserPhoneNumber(context.db, userId, input.phone);
  return userId;
}

/** Runs customer-side code the way a request does: as bb_app, scoped to the person and the business. */
async function asCustomer<T>(context: Context, scope: { readonly userId: string; readonly businessId: string }, work: Parameters<typeof withCustomerRole<T>>[2]): Promise<T> {
  return context.db.transaction((tx) => withCustomerRole(tx, scope, work));
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Account, business, billing                                                                                         */
/* ---------------------------------------------------------------------------------------------------------------- */

async function ensureStaff(context: Context): Promise<void> {
  const staffId = await ensureAccount(context, { email: "staff+seed-v4@example.test", name: "Neha Joshi", label: "staff account for the seed, console role support" });
  await context.db.insert(staffMembers).values({ userId: staffId, active: true, role: "support" }).onConflictDoNothing();
  context.staffId = staffId;
}

async function ensureBusiness(context: Context, spec: Spec, userId: string): Promise<string> {
  const owned = await context.db
    .select({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, userId), eq(businessMembers.role, "owner")))
    .limit(1);
  const existing = owned[0]?.businessId;
  if (existing !== undefined) return existing;
  if (spec.stage === "unpaid") {
    // The sign-up flow's own helper: a listing business that chose Managed Website, in India.
    const created = await createUnlistedAccountBusiness(context.db, { userId, businessName: spec.name, signupChoice: "managed", countryCode: "IN", stateCode: spec.stateCode, currency: CURRENCY });
    return created.businessId;
  }
  const businessId = await context.db.transaction(async (tx) => {
    const business = await insertBusiness(tx, spec.name, CURRENCY);
    await insertOnboardingProject(tx, business.id);
    await tx.insert(businessMembers).values({ businessId: business.id, userId, role: "owner" });
    // No helper sets where a website business is; the sign-up flow records it, so it is written the same way here.
    await tx.update(businesses).set({ countryCode: "IN", stateCode: spec.stateCode }).where(eq(businesses.id, business.id));
    return business.id;
  });
  return businessId;
}

function bundleFor(services: readonly ServiceId[]): NewBundledAddOn[] {
  return packageLines({ services, forfeited: false }, CURRENCY).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: line.taxRateBasisPoints,
  }));
}

/** The subscription, its payments with their tax invoices, and the failure or ending that gives the state its name. */
async function seedBilling(context: Context, spec: Spec, businessId: string, slug: string): Promise<void> {
  const { db, now } = context;
  const plan = must(await findActivePlan(db, CURRENCY, "managed"), `No active ${CURRENCY} managed plan. Run the migrations first.`);
  const lines = bundleFor(spec.services);
  const firstPaidAt = new Date(now.getTime() - spec.paidDaysAgo * DAY_MS);

  await saveBillingProfile(db, {
    businessId,
    legalName: spec.billing.legalName,
    gstin: null,
    addressLine1: spec.billing.line1,
    addressLine2: spec.billing.line2,
    city: spec.billing.city,
    postalCode: spec.billing.postalCode,
    stateCode: spec.stateCode,
    email: null,
    phone: null,
  });

  // Payment ids keep the seed key; the subscription id is one the fake provider accepts, so a seeded plan can be changed or cancelled.
  const seedKey = `seed_v4_${slug}`;
  const providerSubscriptionId = fakeSubscriptionId(seedKey);
  let subscription = await findLatestSubscriptionForBusiness(db, businessId);
  if (subscription === null) {
    subscription = await openCheckoutSubscription(db, {
      businessId,
      planId: plan.id,
      provider: FAKE,
      providerSubscriptionId,
      replacing: null,
      now: firstPaidAt,
      bundledAddOns: lines,
      adCreditCents: adCreditCentsAtCheckout({ services: spec.services, forfeited: false, hasEverPaid: false }, CURRENCY),
    });
  }
  if (spec.stage === "unpaid") return;

  await db.transaction((tx) =>
    activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan, provider: FAKE, providerPaymentId: `${seedKey}_initial`, paidAt: firstPaidAt, method: spec.method }),
  );
  const commitmentEndsAt = addMonthsUtc(firstPaidAt, plan.initialTermMonths);
  let periodStart = commitmentEndsAt;
  for (let month = 1; month <= spec.renewals; month += 1) {
    const paidThroughAt = addMonthsUtc(periodStart, 1);
    const renewalPaidAt = periodStart;
    await db.transaction((tx) =>
      activateRenewalPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt,
        provider: FAKE,
        providerPaymentId: `${seedKey}_renewal_${month}`,
        amountCents: bundledNetCents(lines),
        currency: CURRENCY,
        paidAt: renewalPaidAt,
        paidThroughAt,
        periodStart: renewalPaidAt,
        method: spec.method,
        invoicedPrice: { plan, bundledAddOns: lines, netAmountCents: 0, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );
    periodStart = paidThroughAt;
  }

  if (spec.stage === "failing") {
    await recordFailedPayment(db, {
      businessId,
      provider: FAKE,
      providerPaymentId: `${seedKey}_renewal_failed`,
      kind: "renewal",
      amountCents: bundledNetCents(lines),
      currency: CURRENCY,
      failureReason: "The bank declined the payment: insufficient balance in the linked account.",
      failedAt: new Date(now.getTime() - DAY_MS),
    });
    await updateSubscriptionProviderStatus(db, { provider: FAKE, providerSubscriptionId, status: "past_due", providerStatus: "pending", now });
  }
  if (spec.stage === "lapsed") {
    await updateSubscriptionProviderStatus(db, { provider: FAKE, providerSubscriptionId, status: "cancelled", providerStatus: "cancelled", now: periodStart });
  }
  const [invoices] = await db.select({ n: count() }).from(taxInvoices).where(eq(taxInvoices.businessId, businessId));
  // At least: the e2e flows pay for add-ons on these businesses, so a re-run after them finds more invoices than the seed made.
  if ((invoices?.n ?? 0) < spec.renewals + 1) throw new Error(`${spec.name}: expected ${spec.renewals + 1} tax invoices, found ${invoices?.n ?? 0}. Check the billing log above.`);
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Project, website                                                                                                   */
/* ---------------------------------------------------------------------------------------------------------------- */

async function seedProject(context: Context, spec: Spec, businessId: string, userId: string, slug: string): Promise<string | null> {
  const { db, now, siteBaseDomain } = context;
  const timeline = spec.timeline;
  if (timeline === null) return null;
  const paidAt = new Date(now.getTime() - spec.paidDaysAgo * DAY_MS);
  const dayOf = (offset: number): string => istDate(new Date(paidAt.getTime() + offset * DAY_MS));
  const hostname = `${slug}.${siteBaseDomain}`;
  const project = must((await db.select().from(projects).where(eq(projects.businessId, businessId)).limit(1))[0], `${spec.name} has no project.`);

  if (project.status === "onboarding") {
    await asCustomer(context, { userId, businessId }, (tx) => savePrimaryDomain(tx, { hostname, ownerConfirmedAt: paidAt }));
    const startsAt = atIst(dayOf(timeline.kickoff), 11, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * MINUTE_MS);
    if ((await findSetupCallBooking(db, businessId)) === null) await recordSetupCallBooking(db, { businessId, inviteeUri: null, now: paidAt, startsAt, endsAt });
    await markSetupCallHeld(db, { businessId, staffId: context.staffId, now: endsAt });
    await saveSetupCallSummary(db, { businessId, staffId: context.staffId, summary: `Agreed the services list, opening hours and photos to use. ${spec.name} will send the logo by WhatsApp. First preview within two days.`, now: endsAt });
    const dueAt = firstPreviewDueAfterKickoff({ endsAt, heldAt: null, now: endsAt });
    if (!(await markProjectReadyAfterKickoff(db, { businessId, dueAt, now: endsAt }))) throw new Error(`${spec.name}: the project did not move to submitted.`);
  }

  const previewUrl = `https://preview-${slug}.${siteBaseDomain}`;
  const sendPreview = async (day: number, hour: number): Promise<void> => {
    const sentAt = atIst(dayOf(day), hour, 20);
    const sent = await recordProjectPreviewSent(db, { businessId, previewUrl, now: sentAt });
    await recordPreviewVersion(db, { projectId: sent.id, businessId, previewUrl, sentAt, staffId: context.staffId });
  };
  const target = spec.stage === "preview" ? "preview" : "live";
  for (let guard = 0; guard < 10; guard += 1) {
    const current = must((await db.select().from(projects).where(eq(projects.businessId, businessId)).limit(1))[0], "The project vanished.");
    const versions = await listPreviewVersions(db, { projectId: current.id, businessId });
    if (current.status === "submitted") {
      await setProjectBuilding(db, { businessId });
    } else if (current.status === "building") {
      await sendPreview(timeline.v1, 17);
    } else if (current.status === "preview" && timeline.v2 !== null && versions.length === 1) {
      await requestProjectRevisions(db, { businessId, now: atIst(dayOf(timeline.v2 - 1), 12, 5) });
    } else if (current.status === "revisions") {
      await sendPreview(must(timeline.v2, "A project in revisions needs a second preview day."), 16);
    } else if (current.status === "preview" && target === "live") {
      await approveProjectPreview(db, { businessId, now });
    } else if (current.status === "approved") {
      await markProjectLive(db, { businessId, now: atIst(dayOf(must(timeline.live, "A live project needs a launch day.")), 15, 0) });
    } else {
      break;
    }
  }
  if (target === "live") await setBusinessWebsiteUrl(db, businessId, `https://${hostname}`);
  return hostname;
}

function sitemapFor(host: string, paths: readonly string[]): string {
  const urls = paths.map((path) => `<url><loc>https://${host}${path}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

async function seedWebsitePages(context: Context, businessId: string, host: string, paths: readonly string[]): Promise<void> {
  const xml = sitemapFor(host, paths);
  const result = await syncWebsitePages(context.db, businessId, { fetchText: async () => ({ ok: true, status: 200, text: xml }), now: context.now });
  if (result.kind !== "synced") throw new Error(`Website pages were not synced for ${host}: ${result.kind}`);
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Enquiries                                                                                                          */
/* ---------------------------------------------------------------------------------------------------------------- */

const LEAD_NAMES: readonly string[] = [
  "Rahul Phadke", "Sneha Joshi", "Vikram Bhosale", "Pooja Deshmukh", "Amit Chavan", "Neha Gokhale", "Sanjay Pawar",
  "Madhuri Kale", "Omkar Jadhav", "Ritu Bansal", "Prashant Naik", "Kavita Shinde", "Aditya Wagh", "Swati Patwardhan",
];
const PHONE_PREFIXES: readonly string[] = ["98220", "98906", "97650", "90110", "88050", "99231"];
const HOURS_BY_WEIGHT: readonly number[] = [9, 10, 10, 11, 11, 12, 13, 15, 16, 17, 17, 18, 18, 19, 19, 20, 21];

/** A moment in the last `days` days, in business and evening hours (IST), never later than 20 minutes ago. */
function enquiryMoment(random: () => number, now: Date, days: number): Date {
  const midnight = atIst(istDate(now), 0, 0).getTime();
  const day = Math.floor(random() * days);
  const hour = HOURS_BY_WEIGHT[Math.floor(random() * HOURS_BY_WEIGHT.length)] ?? 11;
  let at = midnight - day * DAY_MS + hour * HOUR_MS + Math.floor(random() * 60) * MINUTE_MS + Math.floor(random() * 60) * 1000;
  if (at > now.getTime() - 20 * MINUTE_MS) at -= DAY_MS;
  return new Date(at);
}

async function seedEnquiries(context: Context, spec: Spec, businessId: string, userId: string, host: string, slug: string, botId: number): Promise<void> {
  const { db, now } = context;
  const random = randomStream(`enquiries:${slug}`);

  let bot = (await listChatbotsForBusiness(db, businessId))[0];
  if (bot === undefined) {
    bot = await registerChatbot(db, { businessId, name: "Website assistant", oyechatsBotId: botId, websiteUrl: `https://${host}`, webhookSecret: randomBytes(24).toString("hex"), operatorKey: null });
    await setChatbotStatus(db, { chatbotId: bot.id, businessId, status: "live" });
  }
  if ((await countChatbotLeadsForBusiness(db, businessId)) === 0) {
    for (let index = 0; index < 14; index += 1) {
      const name = must(LEAD_NAMES[index], "Lead name missing");
      const prefix = PHONE_PREFIXES[Math.floor(random() * PHONE_PREFIXES.length)] ?? "98220";
      const phone = `+91 ${prefix} ${String(10000 + Math.floor(random() * 89999))}`;
      const emailed = random() < 0.45;
      const sessionId = `seed-v4-${slug}-${index + 1}`;
      await recordChatbotLead(db, {
        chatbotId: bot.id,
        businessId,
        sessionId,
        name,
        email: emailed ? `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.test` : null,
        phone: index === 5 ? null : phone,
        company: null,
        capturedAt: enquiryMoment(random, now, 30),
      });
      if (index % 3 === 0) await applyChatbotQualification(db, { chatbotId: bot.id, sessionId, tier: index % 2 === 0 ? "sql" : "mql", score: 55 + Math.floor(random() * 40) });
    }
  }

  const [tapRows] = await db.select({ n: count() }).from(siteEvents).where(eq(siteEvents.businessId, businessId));
  if ((tapRows?.n ?? 0) === 0) {
    const plan: readonly (readonly [SiteEventKind, number])[] = [["call", 23], ["whatsapp", 19], ["form", 7]];
    const rows = plan.flatMap(([kind, total]) => Array.from({ length: total }, () => ({ businessId, kind, occurredAt: enquiryMoment(random, now, 30) })));
    await db.insert(siteEvents).values(rows);
  }
  await backfillEnquiries(db, { businessId });

  // The owner has worked through the older chat leads; the newest few wait for a reply.
  const [touched] = await db.select({ n: count() }).from(enquiries).where(and(eq(enquiries.businessId, businessId), ne(enquiries.status, "new")));
  if ((touched?.n ?? 0) > 0) return;
  const chats = await db.select({ id: enquiries.id }).from(enquiries).where(and(eq(enquiries.businessId, businessId), eq(enquiries.kind, "chat"))).orderBy(enquiries.receivedAt);
  const outcomes: readonly { readonly status: "contacted" | "won" | "lost"; readonly note: string | null }[] = [
    { status: "won", note: "Booked 6 sessions for knee rehab. Starts Monday." },
    { status: "contacted", note: "Called back, will visit on Saturday." },
    { status: "lost", note: "Wanted a home visit, which we do not offer." },
    { status: "won", note: null },
    { status: "contacted", note: null },
    { status: "contacted", note: "Asked about the fee for a back pain assessment. Sent the price list." },
    { status: "won", note: "Came in for a posture check and signed up for a monthly plan." },
    { status: "lost", note: "Chose a clinic closer to home." },
    { status: "contacted", note: null },
  ];
  await asCustomer(context, { userId, businessId }, async (tx) => {
    for (const [index, outcome] of outcomes.entries()) {
      const row = chats[index];
      if (row !== undefined) await updateEnquiry(tx, row.id, outcome);
    }
  });
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Posts and pages                                                                                                    */
/* ---------------------------------------------------------------------------------------------------------------- */

type PostState = "awaiting" | "approved" | "published";

interface PostSeed {
  readonly key: string;
  readonly title: string;
  readonly caption: string;
  readonly format: PostFormat;
  readonly channel: PostChannel;
  readonly dueOn: string;
  readonly state: PostState;
  readonly linkUrl?: string;
}

async function seedPosts(context: Context, businessId: string, userId: string, posts: readonly PostSeed[]): Promise<void> {
  const { db, now } = context;
  const idOf = (post: PostSeed): string => stableUuid(`${businessId}:post:${post.key}`);
  for (const post of posts) {
    if ((await findDeliverableForBusiness(db, businessId, idOf(post))) !== null) continue;
    await insertDeliverable(db, {
      id: idOf(post),
      businessId,
      kind: "post",
      title: post.title,
      caption: post.caption,
      format: post.format,
      channel: post.channel,
      dueOn: post.dueOn,
      status: "awaiting_approval",
      staffId: context.staffId,
    });
  }
  const toApprove = posts.filter((post) => post.state !== "awaiting").map(idOf);
  const waiting: string[] = [];
  for (const id of toApprove) {
    const row = await findDeliverableForBusiness(db, businessId, id);
    if (row?.status === "awaiting_approval") waiting.push(id);
  }
  if (waiting.length > 0) await asCustomer(context, { userId, businessId }, (tx) => approveDeliverables(tx, waiting));
  for (const post of posts.filter((entry) => entry.state === "published")) {
    const row = await findDeliverableForBusiness(db, businessId, idOf(post));
    if (row?.status === "approved") {
      const publishedAt = earlier(atIst(post.dueOn, 10, 0), new Date(now.getTime() - HOUR_MS));
      await moveDeliverable(db, { id: row.id, businessId, to: "published", linkUrl: post.linkUrl ?? null, now: publishedAt });
    }
  }
}

interface WorkSeed {
  readonly key: string;
  readonly kind: "page" | "listing";
  readonly title: string;
  readonly dueOn: string;
  readonly published: boolean;
  readonly linkUrl: string | null;
}

async function seedSearchWork(context: Context, businessId: string, work: readonly WorkSeed[]): Promise<void> {
  const { db, now } = context;
  for (const item of work) {
    const id = stableUuid(`${businessId}:work:${item.key}`);
    let row = await findDeliverableForBusiness(db, businessId, id);
    if (row === null) row = await insertDeliverable(db, { id, businessId, kind: item.kind, title: item.title, caption: null, dueOn: item.dueOn, status: "planned", staffId: context.staffId });
    if (item.published && row.status === "planned") {
      await moveDeliverable(db, { id, businessId, to: "published", linkUrl: item.linkUrl, now: earlier(atIst(item.dueOn, 16, 0), new Date(now.getTime() - HOUR_MS)) });
    }
  }
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Requests                                                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */

type RequestTarget = "quoted" | "in_progress" | "preview" | "shipped";

interface RequestSeed {
  readonly key: string;
  readonly subject: string;
  readonly description: string;
  readonly page: string;
  readonly target: RequestTarget;
  readonly coverage: "included" | "free";
}

async function seedRequests(context: Context, businessId: string, userId: string, slug: string, requests: readonly RequestSeed[]): Promise<void> {
  const { db, now, staffId } = context;
  for (const request of requests) {
    // As the customer: the database refuses a ticket written any other way.
    const { ticket } = await asCustomer(context, { userId, businessId }, (tx) =>
      createSupportTicketWithOutcome(tx, {
        userId,
        businessId,
        category: "website_change",
        subject: request.subject,
        description: request.description,
        submissionKey: `seedv4-${slug}-${request.key}`,
        changeRequest: { kind: "website", page: request.page },
      }),
    );
    const stateOf = async (): Promise<{ readonly id: string; readonly state: string }> =>
      must((await db.select({ id: changeRequests.id, state: changeRequests.state }).from(changeRequests).where(eq(changeRequests.ticketId, ticket.id)).limit(1))[0], `No change request for ticket ${ticket.id}.`);
    let current = await stateOf();
    const start = async (): Promise<void> => {
      await startChangeWithoutQuote(db, { requestId: current.id, staffId, coverage: request.coverage, windowFor: monthBoundsIst, allowedPerMonth: 2 });
    };
    if (current.state === "requested") {
      if (request.target === "quoted") {
        await sendChangeQuote(db, { requestId: current.id, staffId, what: "Marathi version of Services", hours: 3, workingDays: 4, unitCents: 50_000, currency: CURRENCY, now });
      } else {
        await start();
      }
      current = await stateOf();
    }
    if (current.state === "in_progress" && (request.target === "preview" || request.target === "shipped")) {
      await moveChangeAsStaff(db, { requestId: current.id, staffId, to: "preview", now });
      current = await stateOf();
    }
    if (current.state === "preview" && request.target === "shipped") await moveChangeAsStaff(db, { requestId: current.id, staffId, to: "shipped", now });
  }
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Reports, snapshots, accounts, calls, team                                                                          */
/* ---------------------------------------------------------------------------------------------------------------- */

/** Where a day's visits came from and which pages they looked at, as shares that add up to 100. */
const VISIT_CHANNELS: readonly (readonly [string, number])[] = [["search", 48], ["direct", 22], ["social", 14], ["referral", 8], ["paid", 5], ["email", 3]];
const VISIT_PAGE_SHARES: readonly number[] = [32, 9, 18, 15, 10, 6, 10];

/**
 * Sixty days of first-party visit numbers up to yesterday (what the nightly roll-up writes as `own.*`) and the two months'
 * channel and page lists, so the customer's Website screen and Home strip can be seen. Sample numbers, local databases only.
 * Weekdays are busier than weekends. Re-running replaces the same days with the same numbers.
 */
async function seedVisits(context: Context, businessId: string, paths: readonly string[]): Promise<void> {
  const { db, today, now } = context;
  const random = randomStream(`visits:${businessId}`);
  const yesterday = shiftDate(today, -1);
  const days: { readonly day: string; readonly visits: number; readonly visitors: number; readonly pageviews: number }[] = [];
  for (let back = 59; back >= 0; back -= 1) {
    const day = shiftDate(yesterday, -back);
    const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
    const visits = Math.round((weekend ? 52 : 84) * (0.75 + random() * 0.5));
    days.push({ day, visits, visitors: Math.round(visits * 0.82), pageviews: Math.round(visits * (1.9 + random() * 0.5)) });
  }
  await upsertDailyMetrics(
    db,
    businessId,
    days.flatMap((entry) => [
      { metric: "own.visits", day: entry.day, value: entry.visits },
      { metric: "own.visitors", day: entry.day, value: entry.visitors },
      { metric: "own.pageviews", day: entry.day, value: entry.pageviews },
    ]),
    now,
  );
  await recordSourceRun(db, { businessId, source: "own", windowStart: days[0]?.day ?? yesterday, windowEnd: yesterday, error: null, now });
  const months = [monthStartOf(shiftDate(monthStartOf(today), -1)), monthStartOf(today)];
  for (const month of months) {
    const inMonth = days.filter((entry) => entry.day.startsWith(month.slice(0, 7)));
    const visits = inMonth.reduce((sum, entry) => sum + entry.visits, 0);
    const views = inMonth.reduce((sum, entry) => sum + entry.pageviews, 0);
    if (inMonth.length === 0) continue;
    await upsertBreakdown(db, { businessId, source: "own", month, dimension: "channel", rows: VISIT_CHANNELS.map(([key, share]) => ({ key, count: Math.round((visits * share) / 100) })), now });
    await upsertBreakdown(db, {
      businessId,
      source: "own",
      month,
      dimension: "page",
      rows: paths.map((path, index) => ({ key: path, count: Math.round((views * (VISIT_PAGE_SHARES[index] ?? 5)) / 100) })).sort((a, b) => b.count - a.count),
      now,
    });
  }
}

/** The searches people used before landing on a business's site, as the sample's Search Console would list them. */
const SEARCH_QUERIES: readonly (readonly [string, number])[] = [
  ["physiotherapy in kothrud", 30],
  ["physiotherapist near me", 22],
  ["knee pain treatment pune", 16],
  ["kulkarni physio", 14],
  ["back pain physiotherapy karve road", 10],
  ["sports injury clinic pune", 8],
];

/**
 * Sixty days of Search Console numbers (what the nightly pull writes as `gsc.*`), ending three days back because Google
 * finishes a day about three days late, and the two months' top searches and pages. A day with impressions but no click is a
 * measured zero; position exists on days with impressions. Sample numbers, local databases only. Re-running replaces the same
 * days with the same numbers.
 */
async function seedSearch(context: Context, businessId: string, paths: readonly string[]): Promise<void> {
  const { db, today, now } = context;
  const random = randomStream(`search:${businessId}`);
  const lastDay = shiftDate(today, -3);
  const days: { readonly day: string; readonly clicks: number; readonly impressions: number; readonly position: number }[] = [];
  for (let back = 59; back >= 0; back -= 1) {
    const day = shiftDate(lastDay, -back);
    const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
    const impressions = Math.round((weekend ? 120 : 210) * (0.7 + random() * 0.6));
    const clicks = Math.round(impressions * (0.02 + random() * 0.04));
    days.push({ day, clicks, impressions, position: Math.round((7 + random() * 4) * 10) / 10 });
  }
  await upsertDailyMetrics(
    db,
    businessId,
    days.flatMap((entry) => [
      { metric: "gsc.clicks", day: entry.day, value: entry.clicks },
      { metric: "gsc.impressions", day: entry.day, value: entry.impressions },
      { metric: "gsc.position", day: entry.day, value: entry.position },
    ]),
    now,
  );
  await recordSourceRun(db, { businessId, source: "gsc", windowStart: days[0]?.day ?? lastDay, windowEnd: lastDay, error: null, now });
  const months = [monthStartOf(shiftDate(monthStartOf(today), -1)), monthStartOf(today)];
  for (const month of months) {
    const inMonth = days.filter((entry) => entry.day.startsWith(month.slice(0, 7)));
    const clicks = inMonth.reduce((sum, entry) => sum + entry.clicks, 0);
    if (inMonth.length === 0) continue;
    await upsertBreakdown(db, { businessId, source: "gsc", month, dimension: "query", rows: SEARCH_QUERIES.map(([key, share]) => ({ key, count: Math.max(1, Math.round((clicks * share) / 100)) })), now });
    await upsertBreakdown(db, {
      businessId,
      source: "gsc",
      month,
      dimension: "page",
      rows: paths.slice(0, 5).map((path, index) => ({ key: path, count: Math.max(1, Math.round((clicks * (VISIT_PAGE_SHARES[index] ?? 5)) / 100)) })).sort((a, b) => b.count - a.count),
      now,
    });
  }
}

async function seedReports(context: Context, businessId: string, host: string): Promise<void> {
  const { db, today, now } = context;
  const thisMonth = monthStartOf(today);
  const lastMonth = monthStartOf(shiftDate(thisMonth, -1));
  const label = monthName(lastMonth);
  const sentAt = earlier(atIst(thisMonth.slice(0, 8) + "02", 10, 30), now);

  const documents: readonly { readonly service: "website" | "social" | "search"; readonly content: Record<string, unknown> }[] = [
    {
      service: "website",
      content: {
        headline: `Your website had 1,842 visits in ${label}, 14% more than the month before.`,
        figures: [
          { label: "Website visits", value: "1,842" },
          { label: "Visitors from Google", value: "1,106" },
          { label: "Calls from the site", value: "37" },
          { label: "WhatsApp taps", value: "29" },
          { label: "Enquiry forms sent", value: "9" },
          { label: "Average time on site", value: "1 min 52 s" },
        ],
        whatWeDid: [
          "Moved the booking button to the top of every page.",
          "Compressed the clinic photos so the home page opens in under two seconds on mobile.",
          "Added opening hours for the Diwali week to the contact page.",
        ],
      },
    },
    {
      service: "social",
      content: {
        headline: "11 posts went out and your ads brought 41 enquiries for ₹17,387.",
        figures: [
          { label: "Posts published", value: "11" },
          { label: "Ad spend", value: "₹17,387" },
          { label: "Enquiries from ads", value: "41" },
          { label: "Cost per enquiry", value: "₹424" },
          { label: "People reached", value: "28,640" },
          { label: "New followers", value: "57" },
        ],
        whatWeDid: [
          "Published 11 posts across Instagram, Facebook and Google Business.",
          "Ran two ad sets for back pain and knee care within 6 km of the clinic.",
          "Paused the weakest ad after the first week and moved its budget to the better one.",
        ],
      },
    },
    {
      service: "search",
      content: {
        headline: "9 of your search phrases are on page one of Google, up from 6.",
        figures: [
          { label: "Phrases on page one", value: "9" },
          { label: "Google profile views", value: "2,416" },
          { label: "Calls from Google", value: "31" },
          { label: "Direction requests", value: "74" },
          { label: "New Google reviews", value: "6" },
        ],
        whatWeDid: [
          "Rewrote the physiotherapy in Kothrud page around the phrases people search.",
          "Updated services and hours on your Google Business Profile.",
          "Replied to 6 new reviews.",
        ],
      },
    },
  ];
  for (const document of documents) {
    const composed = await composeReport(db, { businessId, service: document.service, month: lastMonth, content: document.content, contentVersion: 1, now: new Date(sentAt.getTime() - 3 * DAY_MS) });
    // Null: the report is already approved or sent, so a second run leaves it alone.
    if (composed === null) continue;
    await moveReport(db, { id: composed.id, to: "approved", staffId: context.staffId, now: new Date(sentAt.getTime() - HOUR_MS) });
    await moveReport(db, { id: composed.id, to: "sent", staffId: context.staffId, now: sentAt });
  }

  const figures = (social: Record<string, number>, search: Record<string, number>) => ({ social, search });
  const byMonth: readonly { readonly month: string; readonly values: ReturnType<typeof figures> }[] = [
    { month: lastMonth, values: figures({ spend: 1_738_650, budget: 2_000_000, enquiries: 41, published: 11, planned: 12 }, { pageOne: 9, previous: 6 }) },
    { month: thisMonth, values: figures({ spend: 162_430, budget: 2_000_000, enquiries: 5, published: 2, planned: 12 }, { pageOne: 10, previous: 9 }) },
  ];
  for (const entry of byMonth) {
    const social = entry.values.social;
    await upsertMonthlySnapshot(db, {
      businessId, service: "social", month: entry.month, staffId: context.staffId, now,
      figures: { adSpendCents: social.spend ?? null, adBudgetCents: social.budget ?? null, adEnquiries: social.enquiries ?? null, postsPublished: social.published ?? null, postsPlanned: social.planned ?? null, keywordsPageOne: null, keywordsPageOnePrev: null, reach: null, followers: null, profileVisits: null },
    });
    const search = entry.values.search;
    await upsertMonthlySnapshot(db, {
      businessId, service: "search", month: entry.month, staffId: context.staffId, now,
      figures: { adSpendCents: null, adBudgetCents: null, adEnquiries: null, postsPublished: null, postsPlanned: null, keywordsPageOne: search.pageOne ?? null, keywordsPageOnePrev: search.previous ?? null, reach: null, followers: null, profileVisits: null },
    });
  }

  await upsertReportSource(db, { businessId, source: "gsc", externalId: `sc-domain:${host}`, now });
  await setReportSourceStatus(db, { businessId, source: "gsc", status: "connected", error: null, now });
  await upsertReportSource(db, { businessId, source: "ga4", externalId: "418307256", now });
  await setReportSourceStatus(db, { businessId, source: "ga4", status: "connected", error: null, now });
  // What the go live job leaves behind for a site that is fully set up (plan 62), so the console's Google card reads true.
  const verifiedAt = new Date(now.getTime() - 20 * DAY_MS);
  await saveProvisionedSource(db, { businessId, source: "gsc", externalId: `sc-domain:${host}`, status: "connected", verifiedAt, provisionedAt: verifiedAt, secondOwnerOk: true, detail: null, now });
  await saveProvisionedSource(db, { businessId, source: "ga4", externalId: "418307256", status: "connected", measurementId: "G-KULK4PHYS1", provisionedAt: verifiedAt, detail: null, now });
}

async function seedConnectedAccounts(context: Context, businessId: string, handle: string, name: string, withProblem: boolean): Promise<void> {
  const checkedAt = new Date(context.now.getTime() - 2 * DAY_MS);
  const save = (platform: Parameters<typeof saveConnectedAccount>[1]["platform"], accountHandle: string, url: string, status: "connected" | "needs_attention" | "not_connected") =>
    saveConnectedAccount(context.db, { businessId, platform, handle: accountHandle, url, status, checkedAt: status === "not_connected" ? null : checkedAt });
  await save("instagram", `@${handle}`, `https://www.instagram.com/${handle}/`, "connected");
  await save("facebook", name, `https://www.facebook.com/${handle.replace(/\./g, "")}`, "connected");
  if (withProblem) {
    await save("google_business", name, "https://business.google.com/", "connected");
    await save("whatsapp_business", "Clinic WhatsApp", "https://wa.me/919822047316", "needs_attention");
  }
}

async function seedCalls(context: Context, businessId: string): Promise<void> {
  const { db, today, staffId } = context;
  const past = { startsAt: atIst(shiftDate(today, -12), 12, 0), endsAt: atIst(shiftDate(today, -12), 12, 30) };
  const pastCall = await recordTeamCall(db, { businessId, reason: "social", note: "Which festival offers should we promote?", ...past, providerUri: "seed-v4:kulkarni-physio:past" });
  if (pastCall.created) {
    await markTeamCallHeld(db, { id: pastCall.id, businessId, staffId, now: new Date(past.endsAt.getTime() + 5 * MINUTE_MS) });
    await saveTeamCallSummary(db, { id: pastCall.id, businessId, staffId, summary: "Agreed a Diwali week plan: two reels, one offer post, ad budget up by ₹3,000. Anjali sends clinic photos by Friday.", now: new Date(past.endsAt.getTime() + 30 * MINUTE_MS) });
  }
  const next = atIst(shiftDate(today, 3), 11, 30);
  await recordTeamCall(db, { businessId, reason: "search", note: "Review the new Kothrud and Karve Road phrases.", startsAt: next, endsAt: new Date(next.getTime() + 30 * MINUTE_MS), providerUri: "seed-v4:kulkarni-physio:upcoming" });
}

async function seedTeam(context: Context, businessId: string, ownerId: string, slug: string): Promise<void> {
  const { db } = context;
  const members = [
    { role: "editor" as const, email: `editor+${slug}@example.test`, name: "Rohan Deshpande" },
    { role: "viewer" as const, email: `viewer+${slug}@example.test`, name: "Meera Joshi" },
  ];
  const invites = await asCustomer(context, { userId: ownerId, businessId }, (tx) => listBusinessInvites(tx));
  for (const member of members) {
    const userId = await ensureAccount(context, { email: member.email, name: member.name, label: `${member.role} on Kulkarni Physio & Wellness` });
    const [already] = await db.select({ role: businessMembers.role }).from(businessMembers).where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, userId))).limit(1);
    if (already !== undefined) continue;
    const { token } = await asCustomer(context, { userId: ownerId, businessId }, (tx) => createBusinessInvite(tx, { invitedBy: ownerId, email: member.email, role: member.role }));
    const outcome = await acceptBusinessInvite(db, { token, userId, userEmail: member.email });
    if (outcome.kind !== "accepted") throw new Error(`The ${member.role} invite was refused: ${outcome.reason}`);
  }
  const openEmail = "accounts.kulkarni@example.test";
  if (!invites.some((invite) => invite.email === openEmail)) {
    await asCustomer(context, { userId: ownerId, businessId }, (tx) => createBusinessInvite(tx, { invitedBy: ownerId, email: openEmail, role: "viewer" }));
  }
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Per-state content                                                                                                  */
/* ---------------------------------------------------------------------------------------------------------------- */

function kulkarniPosts(today: string): PostSeed[] {
  const lastMonth = monthStartOf(shiftDate(monthStartOf(today), -1));
  const lastDay = (day: number): string => `${lastMonth.slice(0, 8)}${pad(day)}`;
  const thisMonth = monthStartOf(today);
  const ig = "https://www.instagram.com/p/";
  const fb = "https://www.facebook.com/kulkarniphysiopune/posts/";
  return [
    { key: "wait-1", title: "Neck pain at your desk: 3 stretches", caption: "Three stretches you can do at your desk in under two minutes. Save this for your next long day at the laptop.", format: "reel", channel: "instagram", dueOn: shiftDate(today, 5), state: "awaiting" },
    { key: "wait-2", title: "Clinic timings over Diwali week", caption: "We are open 9 am to 1 pm on Lakshmi Puja day and closed on Bhai Dooj. Book your slot early.", format: "post", channel: "google_business", dueOn: shiftDate(today, 3), state: "awaiting" },
    { key: "wait-3", title: "Monsoon back pain tips", caption: "Damp weather and stiff backs go together. Five simple habits that help, swipe through.", format: "carousel", channel: "instagram", dueOn: shiftDate(today, 7), state: "awaiting" },
    { key: "wait-4", title: "Meet Dr. Anjali at our Kothrud clinic", caption: "A short hello from Dr. Anjali Kulkarni: what to expect at your first visit and how we plan your sessions.", format: "video", channel: "facebook", dueOn: shiftDate(today, 9), state: "awaiting" },
    { key: "appr-1", title: "Free posture check camp this Saturday", caption: "Walk in this Saturday between 10 am and 1 pm for a free posture check. No booking needed.", format: "post", channel: "facebook", dueOn: shiftDate(today, 1), state: "approved" },
    { key: "pub-n1", title: "Five minute morning mobility routine", caption: "Start the day loose. Five moves, five minutes, no equipment.", format: "reel", channel: "instagram", dueOn: thisMonth, state: "published", linkUrl: `${ig}CzSeedN01/` },
    { key: "pub-n2", title: "Knee care after 40: what to expect from physio", caption: "Knee pain after 40 is common and very treatable. Here is how a typical plan runs.", format: "post", channel: "facebook", dueOn: today > thisMonth ? today : thisMonth, state: "published", linkUrl: `${fb}1002400117` },
    { key: "pub-o1", title: "Why your lower back hurts after long drives", caption: "Long drives, low seats, tight hips. What helps.", format: "carousel", channel: "instagram", dueOn: lastDay(2), state: "published", linkUrl: `${ig}CyseedO01/` },
    { key: "pub-o2", title: "Sports injury recovery in Kothrud", caption: "From a twisted ankle to a runner's knee, we help you get back on the ground.", format: "post", channel: "google_business", dueOn: lastDay(5), state: "published", linkUrl: "https://business.google.com/posts/l/seedo02" },
    { key: "pub-o3", title: "Posture check in 60 seconds", caption: "Stand against a wall and try this quick check.", format: "reel", channel: "instagram", dueOn: lastDay(8), state: "published", linkUrl: `${ig}CyseedO03/` },
    { key: "pub-o4", title: "Our Saturday walk-in hours", caption: "Walk-ins are open every Saturday from 10 am to 1 pm.", format: "post", channel: "facebook", dueOn: lastDay(12), state: "published", linkUrl: `${fb}1002300455` },
    { key: "pub-o5", title: "Desk workers: shoulder tension explained", caption: "Why your shoulders creep up while you type, and how to let them drop.", format: "carousel", channel: "instagram", dueOn: lastDay(15), state: "published", linkUrl: `${ig}CyseedO05/` },
    { key: "pub-o6", title: "What a first physio session looks like", caption: "Assessment, plan and a few exercises to take home. No surprises.", format: "video", channel: "facebook", dueOn: lastDay(19), state: "published", linkUrl: `${fb}1002250981` },
    { key: "pub-o7", title: "Festival season: stay injury free while cleaning", caption: "Cleaning and decorating before Diwali? Lift with your legs, not your back.", format: "reel", channel: "instagram", dueOn: lastDay(23), state: "published", linkUrl: `${ig}CyseedO07/` },
    { key: "pub-o9", title: "Stiff neck after sleeping: what to do", caption: "Wake up with a stiff neck? Gentle moves that help, and when to see us.", format: "reel", channel: "instagram", dueOn: lastDay(10), state: "published", linkUrl: `${ig}CyseedO09/` },
    { key: "pub-o10", title: "Warm up before your morning walk", caption: "A two minute warm-up that protects your knees and ankles.", format: "post", channel: "facebook", dueOn: lastDay(17), state: "published", linkUrl: `${fb}1002271340` },
    { key: "pub-o11", title: "Ergonomic setup for work from home", caption: "Screen height, chair, keyboard: a simple checklist for your home desk.", format: "carousel", channel: "instagram", dueOn: lastDay(25), state: "published", linkUrl: `${ig}CyseedO11/` },
    { key: "pub-o8", title: "New: evening slots until 8 pm", caption: "We now have evening slots until 8 pm on weekdays.", format: "post", channel: "google_business", dueOn: lastDay(27), state: "published", linkUrl: "https://business.google.com/posts/l/seedo08" },
  ];
}

function reddyPosts(today: string): PostSeed[] {
  const ig = "https://www.instagram.com/p/";
  return [
    { key: "pub-1", title: "Learner licence test: five rules people forget", caption: "Five road rules that come up again and again in the learner licence test.", format: "carousel", channel: "instagram", dueOn: shiftDate(today, -33), state: "published", linkUrl: `${ig}CxseedR01/` },
    { key: "pub-2", title: "Weekend batch starts at 6 am", caption: "New weekend batch for working professionals. Limited seats.", format: "post", channel: "facebook", dueOn: shiftDate(today, -41), state: "published", linkUrl: "https://www.facebook.com/reddydrivingschoolhyd/posts/1002100231" },
    { key: "pub-3", title: "How to park in a tight lane", caption: "Three steps to park calmly even on a crowded Banjara Hills lane.", format: "reel", channel: "instagram", dueOn: shiftDate(today, -48), state: "published", linkUrl: `${ig}CxseedR03/` },
    { key: "pub-4", title: "Our instructors, in one minute", caption: "Meet the instructors who will sit beside you.", format: "video", channel: "facebook", dueOn: shiftDate(today, -57), state: "published", linkUrl: "https://www.facebook.com/reddydrivingschoolhyd/posts/1002050877" },
  ];
}

const KULKARNI_REQUESTS: readonly RequestSeed[] = [
  { key: "req-quote", subject: "Add a Marathi version of the Services page", description: "Many of our older patients read Marathi. Could you add a Marathi version of the Services page, with the same prices and timings?", page: "Services", target: "quoted", coverage: "included" },
  { key: "req-progress", subject: "Update clinic timings for Diwali week", description: "We are closed on Bhai Dooj and open only 9 am to 1 pm on Lakshmi Puja day. Please change the timings on the Contact page.", page: "Contact", target: "in_progress", coverage: "included" },
  { key: "req-check", subject: "Replace the team photo on the About page", description: "We have a new team photo with Rohan included. I will send it on WhatsApp. Please replace the old one on the About page.", page: "About", target: "preview", coverage: "included" },
  { key: "req-done", subject: "Fix the phone number in the footer", description: "The footer still shows our old landline. The mobile number to show is 98220 47316.", page: "Footer", target: "shipped", coverage: "free" },
];

/* ---------------------------------------------------------------------------------------------------------------- */
/* Main                                                                                                               */
/* ---------------------------------------------------------------------------------------------------------------- */

async function seedBusiness(context: Context, spec: Spec, index: number): Promise<{ readonly email: string; readonly businessId: string }> {
  const slug = slugify(spec.name);
  const email = `owner+${slug}@example.test`;
  console.log(`${spec.name} (${spec.stage})`);
  const userId = await ensureAccount(context, { email, name: spec.ownerName, label: `owner of ${spec.name}`, phone: spec.ownerPhone });
  const businessId = await ensureBusiness(context, spec, userId);
  await seedBilling(context, spec, businessId, slug);
  const host = await seedProject(context, spec, businessId, userId, slug);
  const hasServices = (service: ServiceId): boolean => spec.services.includes(service);

  if (spec.stage === "live" || spec.stage === "failing" || spec.stage === "lapsed") {
    const siteHost = must(host, `${spec.name} has no host.`);
    const pages = spec.stage === "live" ? ["/", "/about", "/services", "/services/back-pain-physiotherapy", "/services/sports-injury-recovery", "/services/knee-and-joint-care", "/contact"] : ["/", "/about", "/services", "/contact"];
    await seedWebsitePages(context, businessId, siteHost, pages);
    if (spec.stage === "live") {
      await seedVisits(context, businessId, pages);
      await seedSearch(context, businessId, pages);
    }
  }
  if (spec.stage === "live") {
    const siteHost = must(host, `${spec.name} has no host.`);
    await seedEnquiries(context, spec, businessId, userId, siteHost, slug, 9_410_000 + index);
    await seedPosts(context, businessId, userId, kulkarniPosts(context.today));
    const lastMonth = monthStartOf(shiftDate(monthStartOf(context.today), -1));
    await seedSearchWork(context, businessId, [
      { key: "page-1", kind: "page", title: "Physiotherapy in Kothrud page rewritten", dueOn: `${lastMonth.slice(0, 8)}06`, published: true, linkUrl: `https://${siteHost}/services/back-pain-physiotherapy` },
      { key: "page-2", kind: "page", title: "Sports injury recovery page improved", dueOn: `${lastMonth.slice(0, 8)}18`, published: true, linkUrl: `https://${siteHost}/services/sports-injury-recovery` },
      { key: "listing-1", kind: "listing", title: "Google Business Profile: services and hours updated", dueOn: `${lastMonth.slice(0, 8)}21`, published: true, linkUrl: "https://business.google.com/" },
      { key: "page-3", kind: "page", title: "Knee and joint care page: new section on rehab plans", dueOn: shiftDate(context.today, 9), published: false, linkUrl: null },
    ]);
    await seedRequests(context, businessId, userId, slug, KULKARNI_REQUESTS);
    await seedReports(context, businessId, siteHost);
    await seedConnectedAccounts(context, businessId, spec.handle, spec.name, true);
    await seedCalls(context, businessId);
    await seedTeam(context, businessId, userId, slug);
  }
  if (spec.stage === "lapsed" && hasServices("digital-growth")) {
    await seedPosts(context, businessId, userId, reddyPosts(context.today));
    await seedConnectedAccounts(context, businessId, spec.handle, spec.name, false);
  }
  return { email, businessId };
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Affiliate                                                                                                          */
/* ---------------------------------------------------------------------------------------------------------------- */

const AFFILIATE_EMAIL = "affiliate+seed-v4@example.test";
const PENDING_AFFILIATE_EMAIL = "affiliate+pending-seed-v4@example.test";
/** Before this many days ago every earning was paid out in one transfer; after it they are still owed. */
const PAYOUT_CUTOFF_DAYS = 50;

type MemberCode = "main" | "friends";

/** A business that paid on one of the affiliate's codes, and how its plan stands now. */
interface MemberSpec {
  readonly name: string;
  readonly code: MemberCode;
  readonly stateCode: string;
  readonly city: string;
  readonly line1: string;
  readonly postalCode: string;
  readonly firstPaidDaysAgo: number;
  readonly renewals: number;
  readonly ending: "active" | "cancelled" | "past_due";
  /** The paid month whose payment was refunded: staff cancel the earning it made. */
  readonly refundedCycle: number | null;
  readonly method: PaymentMethodDetails;
}

const MEMBERS: readonly MemberSpec[] = [
  { name: "Sharma Dental Care", code: "main", stateCode: "dl", city: "New Delhi", line1: "B-12, Lajpat Nagar II", postalCode: "110024", firstPaidDaysAgo: 160, renewals: 5, ending: "active", refundedCycle: null, method: upi("sharma.dental@okhdfcbank") },
  { name: "Gupta Hardware Store", code: "main", stateCode: "up", city: "Lucknow", line1: "45, Aminabad Road", postalCode: "226018", firstPaidDaysAgo: 95, renewals: 3, ending: "active", refundedCycle: 3, method: card("rupay", "1190", "debit", "Punjab National Bank") },
  { name: "Nair Yoga Studio", code: "main", stateCode: "kl", city: "Kochi", line1: "2nd Floor, Marine Drive Arcade", postalCode: "682031", firstPaidDaysAgo: 125, renewals: 1, ending: "cancelled", refundedCycle: null, method: upi("nair.yoga@okaxis") },
  { name: "Bose Sweets", code: "friends", stateCode: "wb", city: "Kolkata", line1: "88, Rashbehari Avenue", postalCode: "700029", firstPaidDaysAgo: 52, renewals: 0, ending: "past_due", refundedCycle: null, method: upi("bose.sweets@oksbi") },
];

/** One payment a member made: their first, or a renewal. In date order across members, so a payout can fall between them. */
interface MemberPayment {
  readonly member: MemberSpec;
  readonly cycle: number;
  readonly paidAt: Date;
  readonly paidThroughAt: Date;
}

interface SeededMember {
  readonly spec: MemberSpec;
  readonly businessId: string;
  readonly subscriptionId: string;
  readonly providerSubscriptionId: string;
  readonly discountCents: number;
  readonly discountMonths: number | null;
}

/** The affiliate's account and record, linked the way the setup link links them (issue, then claim for the account). */
async function ensureAffiliate(context: Context): Promise<Affiliate> {
  const userId = await ensureAccount(context, { email: AFFILIATE_EMAIL, name: "Rohan Mehta", label: "affiliate, opens /affiliate (code MEHTA300)" });
  const linked = await findAffiliateByUserId(context.db, userId);
  if (linked !== null) return linked;
  const affiliate = await createAffiliate(context.db, {
    name: "Rohan Mehta",
    email: AFFILIATE_EMAIL,
    phone: "+919820145678",
    reward: { kind: "percent", basisPoints: 1000 },
    rewardCurrency: null,
    rewardCycles: 12,
    notes: "Seeded for the customer app v4 affiliate screens.",
    createdByStaffId: context.staffId,
  });
  const link = await issueAffiliateLoginLink(context.db, { affiliateId: affiliate.id, expiresInDays: AFFILIATE_LOGIN_LINK_DAYS, now: context.now });
  if (link.kind !== "issued") throw new Error(`Could not open a login link for the seeded affiliate: ${link.kind}.`);
  const claimed = await claimAffiliateLoginLink(context.db, { token: link.token, userId, now: context.now });
  if (claimed !== "claimed") throw new Error(`Could not link the seeded affiliate to its account: ${claimed}.`);
  return affiliate;
}

/** The affiliate's three codes: the live one most members used, one used up by its only member, and one that expired. */
async function ensureAffiliateCodes(context: Context, affiliate: Affiliate): Promise<Record<MemberCode, ReferralCode>> {
  const existing = await listReferralCodes(context.db, { affiliateId: affiliate.id }, 50);
  const ensure = async (input: Omit<NewReferralCode, "currency" | "affiliateId" | "createdByStaffId">): Promise<ReferralCode> =>
    existing.find((code) => code.code === input.code) ?? createReferralCode(context.db, { ...input, currency: CURRENCY, affiliateId: affiliate.id, createdByStaffId: context.staffId });
  const main = await ensure({ code: "MEHTA300", discount: { kind: "amount", amountCents: 30_000 }, discountMonths: 3, expiresAt: null, maxRedemptions: null });
  const friends = await ensure({ code: "MEHTA-FRIENDS", discount: { kind: "percent", basisPoints: 1000 }, discountMonths: null, expiresAt: null, maxRedemptions: 1 });
  await ensure({ code: "MEHTA-DIWALI", discount: { kind: "amount", amountCents: 50_000 }, discountMonths: 1, expiresAt: new Date(context.now.getTime() - 20 * DAY_MS), maxRedemptions: null });
  return { main, friends };
}

/** A member's business, billing profile and the subscription opened with their code. Found again by name on a re-run. */
async function ensureMember(context: Context, spec: MemberSpec, code: ReferralCode): Promise<SeededMember> {
  const { db } = context;
  const found = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.name, spec.name)).limit(1);
  const businessId = found[0]?.id ?? (await db.transaction(async (tx) => (await insertBusiness(tx, spec.name, CURRENCY)).id));
  await db.update(businesses).set({ countryCode: "IN", stateCode: spec.stateCode }).where(eq(businesses.id, businessId));
  await saveBillingProfile(db, { businessId, legalName: spec.name, gstin: null, addressLine1: spec.line1, addressLine2: null, city: spec.city, postalCode: spec.postalCode, stateCode: spec.stateCode, email: null, phone: null });

  const plan = must(await findActivePlan(db, CURRENCY, "managed"), `No active ${CURRENCY} managed plan. Run the migrations first.`);
  const lines = bundleFor(["managed-website"]);
  const discount = must(code.discount, `${code.code} has no discount.`);
  // The checkout's own rule: the code is worth its discount against the basket's package net, frozen on the subscription.
  const discountCents = discountCentsFor(discount, bundledNetCents(lines));
  const providerSubscriptionId = fakeSubscriptionId(`seed_v4_member_${slugify(spec.name)}`);
  const subscription =
    (await findLatestSubscriptionForBusiness(db, businessId)) ??
    (await openCheckoutSubscription(db, {
      businessId,
      planId: plan.id,
      provider: FAKE,
      providerSubscriptionId,
      replacing: null,
      now: new Date(context.now.getTime() - spec.firstPaidDaysAgo * DAY_MS),
      bundledAddOns: lines,
      referralCodeId: code.id,
      discountAmountCents: discountCents,
      discountMonthsLeft: code.discountMonths,
      adCreditCents: adCreditCentsAtCheckout({ services: ["managed-website"], forfeited: false, hasEverPaid: false }, CURRENCY),
    }));
  return { spec, businessId, subscriptionId: subscription.id, providerSubscriptionId, discountCents, discountMonths: code.discountMonths };
}

/** Every payment the members made, oldest first. Monthly plan: each renewal falls a calendar month after the last. */
function memberPayments(now: Date, termMonths: number): MemberPayment[] {
  return MEMBERS.flatMap((member) => {
    const firstPaidAt = new Date(now.getTime() - member.firstPaidDaysAgo * DAY_MS);
    const payments: MemberPayment[] = [{ member, cycle: 1, paidAt: firstPaidAt, paidThroughAt: addMonthsUtc(firstPaidAt, termMonths) }];
    for (let renewal = 1; renewal <= member.renewals; renewal += 1) {
      const paidAt = addMonthsUtc(firstPaidAt, termMonths + renewal - 1);
      payments.push({ member, cycle: renewal + 1, paidAt, paidThroughAt: addMonthsUtc(paidAt, 1) });
    }
    return payments;
  }).sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
}

/** One member payment through the apps' own activation, which writes the affiliate's earning in the same transaction. */
async function payAsMember(context: Context, member: SeededMember, payment: MemberPayment): Promise<void> {
  const plan = must(await findActivePlan(context.db, CURRENCY, "managed"), `No active ${CURRENCY} managed plan.`);
  const lines = bundleFor(["managed-website"]);
  const seedKey = `seed_v4_member_${slugify(member.spec.name)}`;
  if (payment.cycle === 1) {
    await context.db.transaction((tx) =>
      activateFirstPayment(tx, { businessId: member.businessId, subscriptionId: member.subscriptionId, plan, provider: FAKE, providerPaymentId: `${seedKey}_initial`, paidAt: payment.paidAt, discountAmountCents: member.discountCents, method: member.spec.method }),
    );
    return;
  }
  const discounted = member.discountMonths === null || payment.cycle <= member.discountMonths;
  const discountCents = discounted ? member.discountCents : 0;
  const netCents = bundledNetCents(lines);
  await context.db.transaction((tx) =>
    activateRenewalPayment(tx, {
      businessId: member.businessId,
      subscriptionId: member.subscriptionId,
      commitmentEndsAt: addMonthsUtc(new Date(context.now.getTime() - member.spec.firstPaidDaysAgo * DAY_MS), plan.initialTermMonths),
      provider: FAKE,
      providerPaymentId: `${seedKey}_renewal_${payment.cycle - 1}`,
      amountCents: chargedAmountCents(netCents, discountCents),
      currency: CURRENCY,
      paidAt: payment.paidAt,
      paidThroughAt: payment.paidThroughAt,
      periodStart: payment.paidAt,
      method: member.spec.method,
      invoicedPrice: { plan, bundledAddOns: lines, netAmountCents: 0, discountAmountCents: discountCents, retentionDiscountCents: 0 },
    }),
  );
}

/** Settles every earning owed so far in one transfer, with tax kept back, as the console's Record payout does. Once only. */
async function ensurePayout(context: Context, affiliate: Affiliate, paidOn: string): Promise<void> {
  const [made] = await context.db.select({ n: count() }).from(affiliatePayouts).where(eq(affiliatePayouts.affiliateId, affiliate.id));
  if ((made?.n ?? 0) > 0) return;
  const earningIds = await listOwedEarningIds(context.db, affiliate.id, CURRENCY);
  if (earningIds.length === 0) throw new Error("The seeded affiliate has nothing owed to pay out.");
  const owed = await context.db.select({ amountCents: affiliateEarnings.amountCents }).from(affiliateEarnings).where(and(eq(affiliateEarnings.affiliateId, affiliate.id), eq(affiliateEarnings.status, "owed")));
  const amountCents = owed.reduce((total, row) => total + row.amountCents, 0);
  // Tax deducted at source on commission (section 194H), 2%, rounded down to whole paise.
  const withheldCents = Math.floor((amountCents * 2) / 100);
  const outcome = await recordAffiliatePayout(context.db, {
    affiliateId: affiliate.id,
    currency: CURRENCY,
    earningIds,
    paidOn,
    reference: "UPI 431907652218",
    withheldCents,
    withheldReason: "TDS at 2%",
    recordedByStaffId: context.staffId,
  });
  if (outcome.kind !== "recorded") throw new Error(`The seeded payout was refused: ${outcome.kind}.`);
}

/** Members who left or stopped paying: one cancelled after two months, one whose last renewal failed. */
async function settleMemberEndings(context: Context, members: readonly SeededMember[]): Promise<void> {
  const plan = must(await findActivePlan(context.db, CURRENCY, "managed"), `No active ${CURRENCY} managed plan.`);
  for (const member of members) {
    if (member.spec.ending === "cancelled") {
      await updateSubscriptionProviderStatus(context.db, { provider: FAKE, providerSubscriptionId: member.providerSubscriptionId, status: "cancelled", providerStatus: "cancelled", now: context.now });
    }
    if (member.spec.ending === "past_due") {
      const failedAt = addMonthsUtc(new Date(context.now.getTime() - member.spec.firstPaidDaysAgo * DAY_MS), plan.initialTermMonths + member.spec.renewals);
      await recordFailedPayment(context.db, {
        businessId: member.businessId,
        provider: FAKE,
        providerPaymentId: `seed_v4_member_${slugify(member.spec.name)}_renewal_failed`,
        kind: "renewal",
        amountCents: chargedAmountCents(bundledNetCents(bundleFor(["managed-website"])), member.discountCents),
        currency: CURRENCY,
        failureReason: "The UPI mandate was paused by the customer.",
        failedAt,
      });
      await updateSubscriptionProviderStatus(context.db, { provider: FAKE, providerSubscriptionId: member.providerSubscriptionId, status: "past_due", providerStatus: "pending", now: context.now });
    }
  }
}

/** A refunded month: staff cancel the earning it made while it is still owed. Does nothing once it is cancelled. */
async function refundMemberMonths(context: Context, affiliate: Affiliate, members: readonly SeededMember[]): Promise<void> {
  for (const member of members) {
    if (member.spec.refundedCycle === null) continue;
    const rows = await context.db
      .select({ id: affiliateEarnings.id })
      .from(affiliateEarnings)
      .where(and(eq(affiliateEarnings.businessId, member.businessId), eq(affiliateEarnings.cycleNumber, member.spec.refundedCycle), eq(affiliateEarnings.status, "owed")))
      .limit(1);
    const earning = rows[0];
    if (earning !== undefined) await cancelAffiliateEarning(context.db, { affiliateId: affiliate.id, earningId: earning.id, staffUserId: context.staffId, now: context.now });
  }
}

/**
 * A second affiliate who has not opened their account yet, with a setup link open, so /affiliate/setup/<token> shows the
 * new-account form. The link goes in the logins file. A link that is still open is kept; a lapsed one is replaced.
 */
async function ensurePendingAffiliate(context: Context): Promise<void> {
  const found = await context.db.select({ id: affiliates.id, expiresAt: affiliates.loginTokenExpiresAt }).from(affiliates).where(eq(affiliates.email, PENDING_AFFILIATE_EMAIL)).limit(1);
  const existing = found[0];
  if (existing !== undefined && existing.expiresAt !== null && existing.expiresAt > context.now) return;
  const affiliateId =
    existing?.id ??
    (
      await createAffiliate(context.db, {
        name: "Kavita Rao",
        email: PENDING_AFFILIATE_EMAIL,
        phone: null,
        reward: { kind: "amount", amountCents: 20_000 },
        rewardCurrency: CURRENCY,
        rewardCycles: null,
        notes: "Seeded with an open setup link for the customer app v4.",
        createdByStaffId: context.staffId,
      })
    ).id;
  const link = await issueAffiliateLoginLink(context.db, { affiliateId, expiresInDays: AFFILIATE_LOGIN_LINK_DAYS, now: context.now });
  if (link.kind !== "issued") throw new Error(`Could not open a setup link for the pending affiliate: ${link.kind}.`);
  const heading = context.headingWritten ? "" : `\n${LOGINS_HEADING}, added ${context.today}\n`;
  appendFileSync(context.loginsFile, `${heading}${PENDING_AFFILIATE_EMAIL}  ${affiliateSetupPath(link.token)}  (pending affiliate: setup link, open on the customer app, works once, until ${istDate(link.expiresAt)})\n`);
  context.headingWritten = true;
  console.log(`  Setup link opened for ${PENDING_AFFILIATE_EMAIL} (in local-test-logins.txt)`);
}

async function seedAffiliate(context: Context): Promise<void> {
  console.log("Affiliate: Rohan Mehta");
  const affiliate = await ensureAffiliate(context);
  const codes = await ensureAffiliateCodes(context, affiliate);
  const members = new Map<string, SeededMember>();
  for (const spec of MEMBERS) members.set(spec.name, await ensureMember(context, spec, codes[spec.code]));
  const plan = must(await findActivePlan(context.db, CURRENCY, "managed"), `No active ${CURRENCY} managed plan.`);
  const cutoff = new Date(context.now.getTime() - PAYOUT_CUTOFF_DAYS * DAY_MS);
  const payments = memberPayments(context.now, plan.initialTermMonths);
  const seededOf = (payment: MemberPayment): SeededMember => must(members.get(payment.member.name), `${payment.member.name} was not seeded.`);
  for (const payment of payments.filter((entry) => entry.paidAt < cutoff)) await payAsMember(context, seededOf(payment), payment);
  await ensurePayout(context, affiliate, istDate(new Date(cutoff.getTime() + 3 * DAY_MS)));
  for (const payment of payments.filter((entry) => entry.paidAt >= cutoff)) await payAsMember(context, seededOf(payment), payment);
  // Written directly, no helper exists: a live earning is written in its payment's own transaction, so it carries the day the
  // member paid. The seed pays months in the past today, so each earning takes its payment's date the way it would have.
  await context.db.execute(
    sql`update ${affiliateEarnings} set created_at = payments.paid_at from payments where payments.id = ${affiliateEarnings.paymentId} and ${affiliateEarnings.affiliateId} = ${affiliate.id} and ${affiliateEarnings.createdAt} <> payments.paid_at`,
  );
  await refundMemberMonths(context, affiliate, [...members.values()]);
  await settleMemberEndings(context, [...members.values()]);
  await ensurePendingAffiliate(context);
}

/**
 * Databases seeded before the fake provider's id check hold subscriptions named seed_<something>, which it refuses. Each is
 * renamed to the id its old name maps to, here and in seed-kickoff-customers.ts. Safe to repeat: a renamed id no longer matches.
 */
async function repairSeedSubscriptionIds(db: Database): Promise<number> {
  const old = await db
    .select({ id: subscriptions.id, providerSubscriptionId: subscriptions.providerSubscriptionId })
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, FAKE), like(subscriptions.providerSubscriptionId, "seed\\_%")));
  for (const row of old) await db.update(subscriptions).set({ providerSubscriptionId: fakeSubscriptionId(row.providerSubscriptionId) }).where(eq(subscriptions.id, row.id));
  return old.length;
}

/** The kickoff and call screens say "We could not load the times" without a booking link. Sets the local one only when none is set. */
async function ensureBookingLink(context: Context): Promise<void> {
  if ((await findSiteSetting(context.db, "setup_call_url")) !== null) return;
  await saveSiteSetting(context.db, { key: "setup_call_url", value: LOCAL_BOOKING_LINK, staffUserId: context.staffId, now: context.now });
}

loadLocalEnv();
const staffUrl = requireEnv("DATABASE_URL_STAFF");
assertLocalDevDatabase(staffUrl);
const appOrigin = requireEnv("APP_ORIGIN");

const handle = createDatabase(staffUrl, { max: 4 });
try {
  const now = new Date();
  const context: Context = {
    db: handle.db,
    auth: createAuth({ db: handle.db, secret: requireEnv("BETTER_AUTH_SECRET"), baseURL: appOrigin, trustedOrigins: [appOrigin], nextCookies: false }),
    now,
    today: istDate(now),
    siteBaseDomain: requireEnv("CLIENT_SITE_BASE_DOMAIN").toLowerCase(),
    loginsFile: resolve(findWorkspaceRoot(), "..", "..", "local-test-logins.txt"),
    staffId: "",
    headingWritten: false,
  };
  await ensureStaff(context);
  await ensureBookingLink(context);
  const seeded: { readonly name: string; readonly stage: Stage; readonly email: string; readonly businessId: string }[] = [];
  for (const [index, spec] of SPECS.entries()) {
    const result = await seedBusiness(context, spec, index);
    seeded.push({ name: spec.name, stage: spec.stage, ...result });
  }
  await seedAffiliate(context);
  const repaired = await repairSeedSubscriptionIds(handle.db);
  if (repaired > 0) console.log(`Renamed ${repaired} seeded subscription id${repaired === 1 ? "" : "s"} to ones the fake provider accepts.`);
  console.log("\nSeeded businesses (passwords are in local-test-logins.txt):");
  for (const entry of seeded) console.log(`  ${entry.stage.padEnd(8)} ${entry.name.padEnd(28)} ${entry.email}  ${entry.businessId}`);
  console.log(`  affiliate ${"Rohan Mehta".padEnd(27)} ${AFFILIATE_EMAIL}`);
} finally {
  await handle.close();
}
