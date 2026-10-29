import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createAuth, createVerifiedEmailAccountWithGrant } from "@brandbasket/auth";
import { createDatabase, type Database } from "../src/client";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { findActivePlan, openCheckoutSubscription, recordPaymentAndActivate } from "../src/queries/billing";
import { activateBundledAddOns, bundledNetCents, type NewBundledAddOn } from "../src/queries/bundled-add-ons";
import { insertBusiness } from "../src/queries/onboarding";
import { markProjectReadyAfterKickoff, firstPreviewDueAfterKickoff } from "../src/queries/kickoff-build";
import { savePrimaryDomain } from "../src/queries/onboarding-data";
import { insertOnboardingProject } from "../src/queries/projects";
import { recordSetupCallBooking } from "../src/queries/setup-calls";
import { withTenantScope } from "../src/scope";
import { slugify } from "../src/slug";
import { businessMembers, users } from "../src/schema";

/*
 * Local test customers for previewing the staff console and the customer dashboard: Managed Website only, paid, with a
 * kickoff call. Two have had their kickoff and are waiting for the build (status submitted, as after the real kickoff
 * move); one has a kickoff booked for tomorrow and is still in onboarding. Re-running skips a customer whose owner email
 * already has a business. Nothing is ever deleted.
 */

const DEV_DATABASE_NAME = "brandbasket_platform";
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;
/** India Standard Time has no daylight saving, so a fixed offset is exact. */
const IST_OFFSET_MS = 330 * MINUTE_MS;
/** Length of a kickoff call. Assumed: the booking service does not say, so this is the usual half hour. */
const KICKOFF_LENGTH_MS = 30 * MINUTE_MS;
const KICKOFF_ENDED_HOURS_AGO = 3;
const KICKOFF_TOMORROW_HOUR_IST = 11;
const PLAN_CURRENCY = "INR";
const PLAN_TIER = "managed";

/** Managed Website at its package price, GST included, as the money model in docs/plans/25 states it. */
const WEBSITE_LINE: NewBundledAddOn = {
  addOn: "managed-website",
  listAmountCents: 299_900,
  offerDiscountAmountCents: 0,
  netAmountCents: 299_900,
  taxRateBasisPoints: 1_800,
};

type KickoffState = "ended" | "tomorrow";

interface CustomerSeed {
  readonly businessName: string;
  readonly ownerName: string;
  readonly kickoff: KickoffState;
  /** A temporary `<slug>.<CLIENT_SITE_BASE_DOMAIN>` address, as the onboarding step offers when no domain is owned. */
  readonly temporaryDomain: boolean;
}

const CUSTOMERS: readonly CustomerSeed[] = [
  { businessName: "Om Sweets", ownerName: "Sunita Deshmukh", kickoff: "ended", temporaryDomain: true },
  { businessName: "Kaveri Dental Studio", ownerName: "Kaveri Nair", kickoff: "ended", temporaryDomain: false },
  { businessName: "Rao Tutorials", ownerName: "Venkat Rao", kickoff: "tomorrow", temporaryDomain: false },
];

interface KickoffWindow {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/** Refuses anything that is not the local dev database, before a single write. The URL itself is never printed. */
function assertLocalDevDatabase(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL_STAFF is not a valid URL. Refusing to seed.");
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing to seed: the database host is "${url.hostname}", not localhost, 127.0.0.1 or ::1.`);
  }
  if (url.pathname !== `/${DEV_DATABASE_NAME}`) {
    throw new Error(`Refusing to seed: the database is not ${DEV_DATABASE_NAME}.`);
  }
  if (url.searchParams.has("host")) {
    throw new Error("Refusing to seed: the connection URL has a host query parameter, which can redirect it.");
  }
}

function kickoffWindow(state: KickoffState, now: Date): KickoffWindow {
  if (state === "ended") {
    const endsAt = new Date(now.getTime() - KICKOFF_ENDED_HOURS_AGO * HOUR_MS);
    return { startsAt: new Date(endsAt.getTime() - KICKOFF_LENGTH_MS), endsAt };
  }
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const tomorrowAtElevenIst = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, KICKOFF_TOMORROW_HOUR_IST, 0) - IST_OFFSET_MS,
  );
  return { startsAt: tomorrowAtElevenIst, endsAt: new Date(tomorrowAtElevenIst.getTime() + KICKOFF_LENGTH_MS) };
}

/** Long and random, and never printed or stored. Nobody signs in with it: customers sign in with an emailed code. */
function unknownPassword(): string {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

/** Owner email for a customer, `owner+<slug>@example.test`. example.test is reserved, so it can never be a real person. */
function ownerEmailFor(slug: string): string {
  return `owner+${slug}@example.test`;
}

/** The business the owner email already owns, or null when the customer has not been seeded yet. */
async function existingOwnership(db: Database, email: string): Promise<{ readonly userId: string; readonly businessId: string | null }> {
  const found = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const user = found[0];
  if (user === undefined) return { userId: "", businessId: null };
  const owned = await db
    .select({ businessId: businessMembers.businessId })
    .from(businessMembers)
    .where(and(eq(businessMembers.userId, user.id), eq(businessMembers.role, "owner")))
    .limit(1);
  return { userId: user.id, businessId: owned[0]?.businessId ?? null };
}

async function seedCustomer(
  db: Database,
  auth: ReturnType<typeof createAuth>,
  spec: CustomerSeed,
  siteBaseDomain: string,
  now: Date,
): Promise<void> {
  const slug = slugify(spec.businessName);
  const email = ownerEmailFor(slug);
  const existing = await existingOwnership(db, email);
  if (existing.businessId !== null) {
    console.log(`Skipped ${spec.businessName}: already seeded. Business ${existing.businessId}, owner ${existing.userId}.`);
    return;
  }

  // An account from an earlier run that stopped before its business was made is reused, not created twice.
  const userId =
    existing.userId !== ""
      ? existing.userId
      : (await createVerifiedEmailAccountWithGrant(auth, db, { email, name: spec.ownerName, password: unknownPassword() })).userId;

  const businessId = await db.transaction(async (tx) => {
    const business = await insertBusiness(tx, spec.businessName, PLAN_CURRENCY);
    await insertOnboardingProject(tx, business.id);
    await tx.insert(businessMembers).values({ businessId: business.id, userId, role: "owner" });
    return business.id;
  });

  const plan = await findActivePlan(db, PLAN_CURRENCY, PLAN_TIER);
  if (plan === null) throw new Error(`No active ${PLAN_CURRENCY} ${PLAN_TIER} plan. Run the migrations first.`);

  // Paid and active, through the same functions a first payment uses. The fake provider moves no money.
  const subscription = await openCheckoutSubscription(db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `seed_${slug}`,
    replacing: null,
    now,
    bundledAddOns: [WEBSITE_LINE],
  });
  const paidThroughAt = new Date(now.getTime() + 31 * DAY_MS);
  await recordPaymentAndActivate(db, {
    businessId,
    subscriptionId: subscription.id,
    provider: "fake",
    providerPaymentId: `seed_${slug}_initial`,
    kind: "initial",
    amountCents: plan.initialAmountCents + bundledNetCents([WEBSITE_LINE]),
    currency: PLAN_CURRENCY,
    paidAt: now,
    paidThroughAt,
    commitmentEndsAt: paidThroughAt,
    currentPeriodEnd: paidThroughAt,
  });
  await activateBundledAddOns(db, { subscriptionId: subscription.id, now });

  if (spec.temporaryDomain) {
    const hostname = `${slug}.${siteBaseDomain}`;
    // Saved the way the onboarding step saves a temporary address: while the project is still in onboarding.
    await withTenantScope(db, { userId, businessId }, (tx) => savePrimaryDomain(tx, { hostname, ownerConfirmedAt: now }));
  }

  const window = kickoffWindow(spec.kickoff, now);
  await recordSetupCallBooking(db, { businessId, inviteeUri: null, now, startsAt: window.startsAt, endsAt: window.endsAt });

  if (spec.kickoff === "ended") {
    // The real kickoff move: the project starts its build with the first preview promised from the call's end.
    const dueAt = firstPreviewDueAfterKickoff({ endsAt: window.endsAt, heldAt: null, now });
    const moved = await markProjectReadyAfterKickoff(db, { businessId, dueAt, now });
    if (!moved) throw new Error(`${spec.businessName}: the project did not move to submitted after its kickoff.`);
  }

  console.log(`Seeded ${spec.businessName}: business ${businessId}, owner ${userId}.`);
}

loadLocalEnv();
const staffUrl = requireEnv("DATABASE_URL_STAFF");
assertLocalDevDatabase(staffUrl);
const siteBaseDomain = requireEnv("CLIENT_SITE_BASE_DOMAIN").toLowerCase();
const appOrigin = requireEnv("APP_ORIGIN");

const handle = createDatabase(staffUrl, { max: 1 });
try {
  const auth = createAuth({
    db: handle.db,
    secret: requireEnv("BETTER_AUTH_SECRET"),
    baseURL: appOrigin,
    trustedOrigins: [appOrigin],
    nextCookies: false,
  });
  const now = new Date();
  for (const spec of CUSTOMERS) {
    await seedCustomer(handle.db, auth, spec, siteBaseDomain, now);
  }
} finally {
  await handle.close();
}
