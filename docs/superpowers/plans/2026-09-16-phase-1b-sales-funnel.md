# Phase 1B: Sales Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a visitor who clicks **Get started** into a Fynix customer account: they leave their details, book a call through Calendly, the team works the lead in the staff console, sends a one-time setup link, and the customer sets a password, which creates their account and business.

**Architecture:**
- A new `fynix_public` database role can only insert leads, so the public marketing form never uses a broad connection.
- Leads, setup invites and outgoing emails are three new tables, readable only by staff.
- Emails are not sent anywhere in Phase 1B: an outbox transport records them, and staff read them in a Dev Outbox page.
- Setup links carry a random token; only its SHA-256 hash is stored. Redeeming one creates the account (through the existing invite-only gate), the business and the owner membership in a single transaction.

**Tech Stack:** Next.js 16.3.5, React 19.2, TypeScript, Tailwind 4, zod 4, PostgreSQL 14, drizzle-orm 0.45.2, Better Auth 1.7.5, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-15-fynix-platform-design.md` (§3 customer journey, §4.1 identity tables, §7 auth, §12 admin).

**Builds on Phase 1A** (`docs/superpowers/plans/2026-09-15-phase-1a-foundation.md`), which is complete: workspace, database with row-level security, invite-only Better Auth, host routing, sign-in for both panels.

**Not in this plan (Phase 1C):** the payment wall, Razorpay, the welcome screen and refunds. After redeeming a setup link the customer lands on the dashboard home built in Phase 1A.

---

## Ground rules for the engineer

- **Do not commit.** The user keeps this work uncommitted. "Checkpoint" means run the checks and confirm they pass.
- **This is Next.js 16.** Read the matching guide in `apps/web/node_modules/next/dist/docs/` before using an API you are unsure about.
- **Never print `apps/web/.env.local`.** Commands may `source` it; never `cat` or `echo` it.
- **No `any`.** Explicit return types, `readonly` props, doc comments in the existing style.
- **Another session owns these marketing files:** `apps/web/app/(marketing)/privacy`, `apps/web/app/(marketing)/terms`, `apps/web/components/site-footer.tsx`, `apps/web/content/legal.ts`. Do not edit them.
- **Integration tests** run against `fynix_platform_test` only, serially.
- All commands run from the repo root `/Users/siddiqueahmed/projects/fynix-platform`.

## File map

```
packages/db/
  src/schema/leads.ts             leads table + status enums
  src/schema/setup-invites.ts     setup_invites table
  src/schema/emails.ts            email_messages table (the outbox)
  src/roles.ts                    + fynix_public
  src/queries/leads.ts            create/list/find/update
  src/queries/invites.ts          create, look up by token, redeem
  src/queries/emails.ts           record, list, find
  src/queries/onboarding.ts       redeemInviteIntoBusiness (one transaction)
  src/local-env-template.ts       + public URL and password
  migrations/0003_funnel.sql      tables, grants, RLS
packages/email/
  src/message.ts                  EmailMessage type + render helpers
  src/templates/lead-received.ts  internal notification
  src/templates/setup-link.ts     customer invite
  src/outbox.ts                   transport that records to email_messages
apps/web/
  lib/lead-form.ts (+test)        lead form validation (pure)
  lib/setup-form.ts (+test)       password form validation (pure)
  lib/server/leads.ts             submitLead server action
  lib/server/invites.ts           send-invite and redeem server actions
  app/(marketing)/get-started/    page + LeadForm client component
  components/lead-form.tsx        client form, then the Calendly embed
  components/calendly-embed.tsx   inline widget
  app/admin-host/(protected)/leads/             list + detail + actions
  app/admin-host/(protected)/outbox/            dev outbox list + detail
  app/app-host/setup/[token]/     redemption page + action
```

---

### Task 0: Baseline

**Files:** none

- [ ] **Step 1: Confirm the workspace is green before changing anything**

Run:
```bash
pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm test:integration && pnpm build
```
Expected: lint clean; typecheck clean; 23 db, 17 auth and 92 web unit tests pass; 23 db and 12 auth integration tests pass; the build succeeds. If anything fails, stop and report: it predates this plan.

---

### Task 1: Funnel tables, the public role and the migration

**Files:**
- Create: `packages/db/src/schema/leads.ts`, `packages/db/src/schema/setup-invites.ts`, `packages/db/src/schema/emails.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/roles.ts`, `packages/db/src/local-env-template.ts`, `packages/db/src/local-env-template.test.ts`, `apps/web/.env.example`
- Generate: `packages/db/migrations/0003_funnel.sql`

- [ ] **Step 1: Leads**

Create `packages/db/src/schema/leads.ts`:
```ts
import { index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt, updatedAt } from "./columns";

/** Sales pipeline, from the Get started form to a paying customer. */
export const leadStatus = pgEnum("lead_status", [
  "new",
  "call_booked",
  "call_done",
  "agreed",
  "invite_sent",
  "account_created",
  "paid",
  "lost",
]);
export type LeadStatus = (typeof leadStatus.enumValues)[number];

export const leadDomainAnswer = pgEnum("lead_domain_answer", ["yes", "no", "not_sure"]);
export type LeadDomainAnswer = (typeof leadDomainAnswer.enumValues)[number];

export const leads = pgTable(
  "leads",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    businessName: text("business_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    hasDomain: leadDomainAnswer("has_domain").notNull(),
    message: text("message"),
    status: leadStatus("status").notNull().default("new"),
    /** Private to the team: what was agreed on the call. */
    notes: text("notes"),
    businessId: uuid("business_id").references(() => businesses.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("leads_status_created_at_idx").on(table.status, table.createdAt)],
);
```

- [ ] **Step 2: Setup invites**

Create `packages/db/src/schema/setup-invites.ts`:
```ts
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { businesses } from "./businesses";
import { createdAt } from "./columns";
import { leads } from "./leads";
import { staffMembers } from "./staff";

/**
 * A one-time link that lets exactly one person create exactly one account. Only the SHA-256 hash of the token is
 * stored, so a database copy cannot be used to redeem invites.
 */
export const setupInvites = pgTable(
  "setup_invites",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    email: text("email").notNull(),
    businessName: text("business_name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByStaffId: text("created_by_staff_id")
      .notNull()
      .references(() => staffMembers.userId),
    businessId: uuid("business_id").references(() => businesses.id),
    createdAt: createdAt(),
  },
  (table) => [index("setup_invites_lead_id_idx").on(table.leadId)],
);
```

- [ ] **Step 3: The outbox**

Create `packages/db/src/schema/emails.ts`:
```ts
import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { createdAt } from "./columns";

/**
 * Every email the platform produces. In local development nothing is actually sent: the outbox transport records
 * the message here and staff read it in the Dev Outbox page.
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    /** Template name, e.g. "setup-link". */
    template: text("template").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html").notNull(),
    /** "outbox" locally; a provider name once real sending exists. */
    transport: text("transport").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("email_messages_created_at_idx").on(table.createdAt)],
);
```

In `packages/db/src/schema/index.ts`, add these exports after the existing `./businesses` line, keeping the list alphabetical:
```ts
export * from "./emails";
export * from "./leads";
export * from "./setup-invites";
```

- [ ] **Step 4: The public role**

Replace `packages/db/src/roles.ts` with:
```ts
/** Login roles the application uses. Created by `pnpm db:roles`; migrations grant their privileges. */
export const APPLICATION_ROLES = [
  { name: "fynix_app", passwordEnv: "FYNIX_APP_PASSWORD" },
  { name: "fynix_staff", passwordEnv: "FYNIX_STAFF_PASSWORD" },
  // The public marketing form writes leads and rate-limit rows and can do nothing else.
  { name: "fynix_public", passwordEnv: "FYNIX_PUBLIC_PASSWORD" },
] as const;
```

- [ ] **Step 5: Add the new variables to the generated env file**

In `packages/db/src/local-env-template.ts`, add a `publicPassword` field to `LocalEnvSecrets` (documented like the others), and add these lines to `buildLocalEnvFile`, after the staff password and staff URLs respectively:
```ts
    `FYNIX_PUBLIC_PASSWORD=${secrets.publicPassword}`,
```
```ts
    `DATABASE_URL_PUBLIC=${roleUrl("fynix_public", secrets.publicPassword, DEV_DATABASE)}`,
    `DATABASE_URL_PUBLIC_TEST=${roleUrl("fynix_public", secrets.publicPassword, TEST_DATABASE)}`,
```
And in the "Auth" block, after `BETTER_AUTH_SECRET`:
```ts
    "",
    "# Where lead notifications go while email is local-only.",
    "FYNIX_TEAM_EMAIL=team@example.com",
    "",
    "# Public site values (inlined into the browser bundle).",
    "NEXT_PUBLIC_APP_URL=http://app.localhost:3000",
    "NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/stevjson1/30min",
```

In `packages/db/src/local-env-template.test.ts`, add `publicPassword: "public-pass"` to the `secrets` fixture and extend the second test with:
```ts
    expect(env.DATABASE_URL_PUBLIC).toBe("postgresql://fynix_public:public-pass@localhost:5432/fynix_platform");
    expect(env.DATABASE_URL_PUBLIC_TEST).toBe("postgresql://fynix_public:public-pass@localhost:5432/fynix_platform_test");
    expect(env.FYNIX_PUBLIC_PASSWORD).toBe("public-pass");
```
And add a third-test assertion:
```ts
    expect(env.FYNIX_TEAM_EMAIL).toBe("team@example.com");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://app.localhost:3000");
    expect(env.NEXT_PUBLIC_CALENDLY_URL).toBe("https://calendly.com/stevjson1/30min");
```
In `packages/db/scripts/init-local-env.ts`, add `publicPassword: randomBytes(24).toString("hex"),` to the secrets object.

Run `pnpm --filter @fynix/db test`.
Expected: the template tests fail first (they assert values the template does not produce yet), then pass once the template is updated. Run them before and after the template edit to see both.

- [ ] **Step 6: Document the variables**

In `apps/web/.env.example`, add after the existing database lines:
```
# Lead form connection (insert-only).
DATABASE_URL_PUBLIC=
DATABASE_URL_PUBLIC_TEST=
FYNIX_PUBLIC_PASSWORD=

# Inbox that receives lead notifications.
FYNIX_TEAM_EMAIL=

# Public site values.
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_CALENDLY_URL=
```

- [ ] **Step 7: Generate the table migration**

Run:
```bash
pnpm --filter @fynix/db exec drizzle-kit generate --name funnel && ls packages/db/migrations
```
Expected: `0003_funnel.sql` exists and creates `leads`, `setup_invites` and `email_messages` plus the two new enums and the three indexes. Read it and confirm it contains no `DROP`.

- [ ] **Step 8: Grants and row-level security for the new tables**

Run `pnpm --filter @fynix/db exec drizzle-kit generate --custom --name funnel_grants`, then replace the whole content of the generated `packages/db/migrations/0004_funnel_grants.sql` with:
```sql
-- fynix_public is the marketing site's connection: it may only create leads.
GRANT USAGE ON SCHEMA public TO fynix_public;
--> statement-breakpoint

GRANT INSERT ON leads TO fynix_public;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO fynix_public;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON leads, setup_invites TO fynix_staff;
--> statement-breakpoint

GRANT SELECT, INSERT ON email_messages TO fynix_staff;
--> statement-breakpoint

GRANT INSERT ON email_messages TO fynix_public;
--> statement-breakpoint

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE setup_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- The public role writes but never reads: no SELECT policy exists for it.
CREATE POLICY leads_public_insert ON leads
  FOR INSERT TO fynix_public WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY email_messages_public_insert ON email_messages
  FOR INSERT TO fynix_public WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY leads_staff_all ON leads
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY setup_invites_staff_all ON setup_invites
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
--> statement-breakpoint

CREATE POLICY email_messages_staff_all ON email_messages
  FOR ALL TO fynix_staff USING (true) WITH CHECK (true);
```

- [ ] **Step 9: Create the role and migrate both databases**

Run:
```bash
pnpm env:init 2>/dev/null || true
pnpm db:roles && pnpm db:migrate && pnpm db:migrate:test
```
Expected: `pnpm env:init` refuses because `.env.local` exists (that is fine, and the `|| true` keeps the chain going). Because the file already exists, **add the six new variables by hand**: generate a password with `openssl rand -hex 24`, then append `FYNIX_PUBLIC_PASSWORD`, `DATABASE_URL_PUBLIC`, `DATABASE_URL_PUBLIC_TEST` (same shape as the staff URLs), `FYNIX_TEAM_EMAIL=team@example.com`, `NEXT_PUBLIC_APP_URL=http://app.localhost:3000` and `NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/stevjson1/30min`. Do not print the file afterwards. Then `pnpm db:roles` prints "Created role fynix_public" and both migrate commands report success.

- [ ] **Step 10: Prove the public role is limited**

Run:
```bash
set -a && source apps/web/.env.local && set +a
psql "$DATABASE_URL_PUBLIC" -c "select count(*) from leads"
psql "$DATABASE_URL_PUBLIC" -c "insert into leads (name, business_name, email, phone, has_domain) values ('A','B','a@b.co','1','yes')"
psql "$DATABASE_URL_PUBLIC" -c "select count(*) from businesses"
```
Expected: the first fails with `permission denied for table leads` (it has INSERT only), the insert succeeds, and the third fails with `permission denied for table businesses`. Then clean up: `psql "$DATABASE_URL_OWNER" -c "delete from leads"`.

- [ ] **Step 11: Checkpoint**

Run `pnpm --filter @fynix/db typecheck && pnpm --filter @fynix/db test`.
Expected: typecheck clean; unit tests pass.

---

### Task 2: Lead and invite queries (TDD against the test database)

**Files:**
- Create: `packages/db/src/queries/leads.ts`, `packages/db/src/queries/invites.ts`, `packages/db/src/queries/emails.ts`
- Create: `packages/db/src/funnel.integration.test.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `packages/db/src/funnel.integration.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordEmail, listRecentEmails } from "./queries/emails";
import { createSetupInvite, findRedeemableInvite, revokeOpenInvites } from "./queries/invites";
import { createLead, findLead, listLeads, updateLead } from "./queries/leads";
import { staffMembers, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF_USER = "staff-1";

let dbs: TestDatabases;

async function seedStaff(): Promise<void> {
  await dbs.staff.db.insert(users).values({ id: STAFF_USER, name: "Sam Staff", email: "sam@fynix.test" });
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF_USER, role: "admin" });
}

async function seedLead(businessName = "Riverside Plumbing"): Promise<string> {
  const lead = await createLead(dbs.staff.db, {
    name: "Riley Owner",
    businessName,
    email: "owner@example.com",
    phone: "+1 555 0100",
    hasDomain: "yes",
    message: "We need a new site.",
  });
  return lead.id;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedStaff();
});

describe("leads", () => {
  it("stores a lead as new and lists it", async () => {
    const id = await seedLead();

    const stored = await findLead(dbs.staff.db, id);
    expect(stored).toMatchObject({
      id,
      name: "Riley Owner",
      businessName: "Riverside Plumbing",
      email: "owner@example.com",
      hasDomain: "yes",
      status: "new",
    });
    expect((await listLeads(dbs.staff.db, {})).map((lead) => lead.id)).toEqual([id]);
  });

  it("filters by status and lists newest first", async () => {
    const first = await seedLead("First Co");
    const second = await seedLead("Second Co");
    await updateLead(dbs.staff.db, second, { status: "agreed", notes: "Wants it before June." });

    expect((await listLeads(dbs.staff.db, {})).map((lead) => lead.businessName)).toEqual(["Second Co", "First Co"]);
    expect((await listLeads(dbs.staff.db, { status: "agreed" })).map((lead) => lead.id)).toEqual([second]);
    expect((await listLeads(dbs.staff.db, { status: "new" })).map((lead) => lead.id)).toEqual([first]);
    expect(await findLead(dbs.staff.db, second)).toMatchObject({ status: "agreed", notes: "Wants it before June." });
  });

  it("returns null for an unknown lead", async () => {
    expect(await findLead(dbs.staff.db, "0192f3c4-0000-7000-8000-00000000dead")).toBeNull();
  });

  it("refuses to insert a lead through the app connection", async () => {
    const message = await captureErrorText(
      createLead(dbs.app.db, {
        name: "Nope",
        businessName: "Nope",
        email: "nope@example.com",
        phone: "1",
        hasDomain: "no",
        message: null,
      }),
    );
    expect(message).toMatch(/permission denied for table leads/);
  });
});

describe("setup invites", () => {
  it("returns a token that is not stored, and finds the invite by it", async () => {
    const leadId = await seedLead();

    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.invite.tokenHash).not.toBe(created.token);

    const found = await findRedeemableInvite(dbs.staff.db, created.token);
    expect(found).toMatchObject({ id: created.invite.id, email: "owner@example.com", leadId });
  });

  it("does not find an unknown, revoked or expired invite", async () => {
    const leadId = await seedLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    expect(await findRedeemableInvite(dbs.staff.db, "not-a-real-token")).toBeNull();

    await revokeOpenInvites(dbs.staff.db, leadId);
    expect(await findRedeemableInvite(dbs.staff.db, created.token)).toBeNull();

    const expired = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: -1,
    });
    expect(await findRedeemableInvite(dbs.staff.db, expired.token)).toBeNull();
  });

  it("revokes earlier invites when a new one is sent", async () => {
    const leadId = await seedLead();
    const first = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    await revokeOpenInvites(dbs.staff.db, leadId);
    const second = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });

    expect(await findRedeemableInvite(dbs.staff.db, first.token)).toBeNull();
    expect(await findRedeemableInvite(dbs.staff.db, second.token)).not.toBeNull();
  });
});

describe("email outbox", () => {
  it("records a message and lists it newest first", async () => {
    await recordEmail(dbs.staff.db, {
      toAddress: "team@example.com",
      subject: "New lead: Riverside Plumbing",
      template: "lead-received",
      bodyText: "Riley Owner got in touch.",
      bodyHtml: "<p>Riley Owner got in touch.</p>",
      transport: "outbox",
    });
    await recordEmail(dbs.staff.db, {
      toAddress: "owner@example.com",
      subject: "Your Fynix setup link",
      template: "setup-link",
      bodyText: "Set your password.",
      bodyHtml: "<p>Set your password.</p>",
      transport: "outbox",
    });

    const messages = await listRecentEmails(dbs.staff.db, 10);
    expect(messages.map((message) => message.template)).toEqual(["setup-link", "lead-received"]);
    expect(messages[0]).toMatchObject({ toAddress: "owner@example.com", transport: "outbox" });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run `pnpm --filter @fynix/db test:integration`.
Expected: FAIL, unable to resolve `./queries/leads`, `./queries/invites` and `./queries/emails`.

- [ ] **Step 3: Implement the lead queries**

Create `packages/db/src/queries/leads.ts`:
```ts
import { desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { leads, type LeadDomainAnswer, type LeadStatus } from "../schema";

export interface NewLead {
  readonly name: string;
  readonly businessName: string;
  readonly email: string;
  readonly phone: string;
  readonly hasDomain: LeadDomainAnswer;
  readonly message: string | null;
}

export interface Lead {
  readonly id: string;
  readonly name: string;
  readonly businessName: string;
  readonly email: string;
  readonly phone: string;
  readonly hasDomain: LeadDomainAnswer;
  readonly message: string | null;
  readonly status: LeadStatus;
  readonly notes: string | null;
  readonly businessId: string | null;
  readonly createdAt: Date;
}

const LEAD_COLUMNS = {
  id: leads.id,
  name: leads.name,
  businessName: leads.businessName,
  email: leads.email,
  phone: leads.phone,
  hasDomain: leads.hasDomain,
  message: leads.message,
  status: leads.status,
  notes: leads.notes,
  businessId: leads.businessId,
  createdAt: leads.createdAt,
} as const;

/** Called from the public marketing form, so it returns only the new id. */
export async function createLead(db: Database, lead: NewLead): Promise<{ readonly id: string }> {
  const rows = await db.insert(leads).values(lead).returning({ id: leads.id });
  const row = rows[0];
  if (row === undefined) throw new Error("Lead insert returned no row");
  return row;
}

export async function listLeads(db: Database, filter: { readonly status?: LeadStatus }): Promise<Lead[]> {
  const query = db.select(LEAD_COLUMNS).from(leads).orderBy(desc(leads.createdAt));
  return filter.status === undefined ? query : query.where(eq(leads.status, filter.status));
}

export async function findLead(db: Database, id: string): Promise<Lead | null> {
  const rows = await db.select(LEAD_COLUMNS).from(leads).where(eq(leads.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface LeadUpdate {
  readonly status?: LeadStatus;
  readonly notes?: string | null;
  readonly businessId?: string;
}

export async function updateLead(db: Database, id: string, update: LeadUpdate): Promise<void> {
  await db
    .update(leads)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(leads.id, id));
}
```

- [ ] **Step 4: Implement the invite queries**

Create `packages/db/src/queries/invites.ts`:
```ts
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { setupInvites } from "../schema";

const TOKEN_BYTES = 32;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The link carries the token; the database only ever holds this hash. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export interface NewSetupInvite {
  readonly leadId: string;
  readonly email: string;
  readonly businessName: string;
  readonly createdByStaffId: string;
  readonly expiresInDays: number;
}

export interface SetupInvite {
  readonly id: string;
  readonly leadId: string;
  readonly email: string;
  readonly businessName: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

const INVITE_COLUMNS = {
  id: setupInvites.id,
  leadId: setupInvites.leadId,
  email: setupInvites.email,
  businessName: setupInvites.businessName,
  tokenHash: setupInvites.tokenHash,
  expiresAt: setupInvites.expiresAt,
} as const;

export interface CreatedSetupInvite {
  /** Shown once, in the email. It is never stored. */
  readonly token: string;
  readonly invite: SetupInvite;
}

export async function createSetupInvite(db: Database, input: NewSetupInvite): Promise<CreatedSetupInvite> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const rows = await db
    .insert(setupInvites)
    .values({
      leadId: input.leadId,
      email: input.email,
      businessName: input.businessName,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + input.expiresInDays * MILLISECONDS_PER_DAY),
      createdByStaffId: input.createdByStaffId,
    })
    .returning(INVITE_COLUMNS);
  const invite = rows[0];
  if (invite === undefined) throw new Error("Setup invite insert returned no row");
  return { token, invite };
}

/** An invite is redeemable while it is unredeemed, unrevoked and unexpired. */
export async function findRedeemableInvite(db: Database, token: string, now: Date = new Date()): Promise<SetupInvite | null> {
  const rows = await db
    .select(INVITE_COLUMNS)
    .from(setupInvites)
    .where(
      and(
        eq(setupInvites.tokenHash, hashInviteToken(token)),
        isNull(setupInvites.redeemedAt),
        isNull(setupInvites.revokedAt),
        gt(setupInvites.expiresAt, now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Sending a new link invalidates any earlier one for that lead. */
export async function revokeOpenInvites(db: Database, leadId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(setupInvites)
    .set({ revokedAt: now })
    .where(and(eq(setupInvites.leadId, leadId), isNull(setupInvites.redeemedAt), isNull(setupInvites.revokedAt)));
}
```

- [ ] **Step 5: Implement the email queries**

Create `packages/db/src/queries/emails.ts`:
```ts
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { emailMessages } from "../schema";

export interface RecordedEmail {
  readonly toAddress: string;
  readonly subject: string;
  readonly template: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
  readonly transport: string;
}

export interface StoredEmail extends RecordedEmail {
  readonly id: string;
  readonly createdAt: Date;
}

const EMAIL_COLUMNS = {
  id: emailMessages.id,
  toAddress: emailMessages.toAddress,
  subject: emailMessages.subject,
  template: emailMessages.template,
  bodyText: emailMessages.bodyText,
  bodyHtml: emailMessages.bodyHtml,
  transport: emailMessages.transport,
  createdAt: emailMessages.createdAt,
} as const;

export async function recordEmail(db: Database, email: RecordedEmail): Promise<void> {
  await db.insert(emailMessages).values(email);
}

export async function listRecentEmails(db: Database, limit: number): Promise<StoredEmail[]> {
  return db.select(EMAIL_COLUMNS).from(emailMessages).orderBy(desc(emailMessages.createdAt)).limit(limit);
}

export async function findEmail(db: Database, id: string): Promise<StoredEmail | null> {
  const rows = await db.select(EMAIL_COLUMNS).from(emailMessages).where(eq(emailMessages.id, id)).limit(1);
  return rows[0] ?? null;
}
```

In `packages/db/src/index.ts`, add after the existing query exports:
```ts
export { findEmail, listRecentEmails, recordEmail, type RecordedEmail, type StoredEmail } from "./queries/emails";
export {
  createSetupInvite,
  findRedeemableInvite,
  hashInviteToken,
  revokeOpenInvites,
  type CreatedSetupInvite,
  type NewSetupInvite,
  type SetupInvite,
} from "./queries/invites";
export { createLead, findLead, listLeads, updateLead, type Lead, type LeadUpdate, type NewLead } from "./queries/leads";
```

- [ ] **Step 6: Run to see it pass**

Run `pnpm --filter @fynix/db test:integration`.
Expected: PASS.

> **Review fix applied after implementation:** `createLead` generates the id with `uuidv7()` and does not use
> `RETURNING`, because `RETURNING` needs SELECT privilege and `fynix_public` deliberately has none on `leads`.
> Without this the public form fails with "permission denied for table leads". `testing/index.ts` also exposes a
> `publicRole` handle, and `funnel.integration.test.ts` inserts through it, so the public path is actually covered:
> 28 unit and 34 integration tests.

- [ ] **Step 7: Checkpoint**

Run `pnpm --filter @fynix/db typecheck && pnpm --filter @fynix/db test`.

---

### Task 3: Redeeming an invite into a business (one transaction)

**Files:**
- Create: `packages/db/src/slug.ts`, `packages/db/src/slug.test.ts`
- Create: `packages/db/src/queries/onboarding.ts`
- Modify: `packages/db/src/funnel.integration.test.ts`, `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing slug tests**

Create `packages/db/src/slug.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("Riverside Plumbing")).toBe("riverside-plumbing");
  });

  it("strips punctuation and accents", () => {
    expect(slugify("Café Niño & Co.")).toBe("cafe-nino-co");
  });

  it("collapses repeated separators and trims them", () => {
    expect(slugify("  --Bella   Vista--  ")).toBe("bella-vista");
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("business");
  });

  it("caps the length", () => {
    expect(slugify("a".repeat(100))).toHaveLength(60);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run `pnpm --filter @fynix/db test`.
Expected: FAIL, unable to resolve `./slug`.

- [ ] **Step 3: Implement the slug helper**

Create `packages/db/src/slug.ts`:
```ts
const MAX_SLUG_LENGTH = 60;
const FALLBACK_SLUG = "business";

/** URL-safe form of a business name, used for the business slug. */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug === "" ? FALLBACK_SLUG : slug;
}
```

- [ ] **Step 4: Run to see it pass**

Run `pnpm --filter @fynix/db test`.
Expected: PASS (5 new tests).

- [ ] **Step 5: Write the failing redemption test**

Append to `packages/db/src/funnel.integration.test.ts` (and add `redeemInviteIntoBusiness` to the imports from `./queries/onboarding`, plus `businesses`, `businessMembers` to the schema import):
```ts
describe("redeemInviteIntoBusiness", () => {
  it("creates the business and owner membership, and closes the invite and lead", async () => {
    const leadId = await seedLead();
    const created = await createSetupInvite(dbs.staff.db, {
      leadId,
      email: "owner@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values({ id: "customer-1", name: "Riley Owner", email: "owner@example.com" });

    const result = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: created.invite.id,
      leadId,
      businessName: "Riverside Plumbing",
      userId: "customer-1",
    });

    const business = await dbs.staff.db.select().from(businesses).where(eq(businesses.id, result.businessId));
    expect(business[0]).toMatchObject({ name: "Riverside Plumbing", slug: "riverside-plumbing" });
    const membership = await dbs.staff.db.select().from(businessMembers);
    expect(membership).toHaveLength(1);
    expect(membership[0]).toMatchObject({ businessId: result.businessId, userId: "customer-1", role: "owner" });
    expect(await findRedeemableInvite(dbs.staff.db, created.token)).toBeNull();
    expect(await findLead(dbs.staff.db, leadId)).toMatchObject({
      status: "account_created",
      businessId: result.businessId,
    });
  });

  it("gives the second business with the same name a distinct slug", async () => {
    const firstLead = await seedLead();
    const secondLead = await seedLead();
    const firstInvite = await createSetupInvite(dbs.staff.db, {
      leadId: firstLead,
      email: "one@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    const secondInvite = await createSetupInvite(dbs.staff.db, {
      leadId: secondLead,
      email: "two@example.com",
      businessName: "Riverside Plumbing",
      createdByStaffId: STAFF_USER,
      expiresInDays: 7,
    });
    await dbs.staff.db.insert(users).values([
      { id: "customer-a", name: "One", email: "one@example.com" },
      { id: "customer-b", name: "Two", email: "two@example.com" },
    ]);

    const first = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: firstInvite.invite.id,
      leadId: firstLead,
      businessName: "Riverside Plumbing",
      userId: "customer-a",
    });
    const second = await redeemInviteIntoBusiness(dbs.staff.db, {
      inviteId: secondInvite.invite.id,
      leadId: secondLead,
      businessName: "Riverside Plumbing",
      userId: "customer-b",
    });

    const rows = await dbs.staff.db.select({ id: businesses.id, slug: businesses.slug }).from(businesses);
    const slugs = rows.map((row) => row.slug).sort();
    expect(slugs[0]).toBe("riverside-plumbing");
    expect(slugs[1]).toMatch(/^riverside-plumbing-[a-z0-9]{6}$/);
    expect(first.businessId).not.toBe(second.businessId);
  });
});
```

- [ ] **Step 6: Run to see it fail**

Run `pnpm --filter @fynix/db test:integration`.
Expected: FAIL, unable to resolve `./queries/onboarding`.

- [ ] **Step 7: Implement the redemption**

Create `packages/db/src/queries/onboarding.ts`:
```ts
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { businesses, businessMembers, leads, setupInvites } from "../schema";
import { slugify } from "../slug";

export interface InviteRedemption {
  readonly inviteId: string;
  readonly leadId: string;
  readonly businessName: string;
  readonly userId: string;
}

/**
 * Creates the tenant for a redeemed invite: business, owner membership, closed invite and updated lead, all or
 * nothing. The account itself is created first by @fynix/auth, which owns the invite-only gate.
 */
export async function redeemInviteIntoBusiness(
  db: Database,
  redemption: InviteRedemption,
): Promise<{ readonly businessId: string }> {
  const now = new Date();
  return db.transaction(async (tx) => {
    let slug = slugify(redemption.businessName);
    const taken = await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).limit(1);
    if (taken.length > 0) slug = `${slug}-${randomBytes(3).toString("hex")}`;

    const created = await tx
      .insert(businesses)
      .values({ name: redemption.businessName, slug })
      .returning({ id: businesses.id });
    const business = created[0];
    if (business === undefined) throw new Error("Business insert returned no row");

    await tx.insert(businessMembers).values({ businessId: business.id, userId: redemption.userId, role: "owner" });
    await tx
      .update(setupInvites)
      .set({ redeemedAt: now, businessId: business.id })
      .where(eq(setupInvites.id, redemption.inviteId));
    await tx
      .update(leads)
      .set({ status: "account_created", businessId: business.id, updatedAt: now })
      .where(eq(leads.id, redemption.leadId));

    return { businessId: business.id };
  });
}
```

In `packages/db/src/index.ts`, add:
```ts
export { redeemInviteIntoBusiness, type InviteRedemption } from "./queries/onboarding";
export { slugify } from "./slug";
```

- [ ] **Step 8: Run to see it pass**

Run `pnpm --filter @fynix/db test:integration && pnpm --filter @fynix/db test`.
Expected: both pass.

---

### Task 4: `@fynix/email` templates and the outbox transport

**Files:**
- Create: `packages/email/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/email/src/message.ts`, `src/templates/lead-received.ts`, `src/templates/setup-link.ts`, `src/outbox.ts`, `src/index.ts`
- Create: `packages/email/src/templates/templates.test.ts`

- [ ] **Step 1: Package files**

Create `packages/email/package.json`:
```json
{
  "name": "@fynix/email",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "@fynix/db": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.13.4",
    "typescript": "^5",
    "vitest": "^5.0.0"
  }
}
```

Create `packages/email/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "vitest.config.ts"]
}
```

Create `packages/email/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Run `pnpm install`.

- [ ] **Step 2: Write the failing template tests**

Create `packages/email/src/templates/templates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { leadReceivedEmail } from "./lead-received";
import { setupLinkEmail } from "./setup-link";

describe("leadReceivedEmail", () => {
  const email = leadReceivedEmail({
    to: "team@example.com",
    name: "Riley Owner",
    businessName: "Riverside Plumbing",
    email: "owner@example.com",
    phone: "+1 555 0100",
    hasDomain: "not_sure",
    message: "We need a site before summer.",
    leadUrl: "http://admin.localhost:3000/leads/0192f3c4",
  });

  it("names the business in the subject", () => {
    expect(email.subject).toBe("New lead: Riverside Plumbing");
  });

  it("carries every detail the team needs to make the call", () => {
    for (const detail of ["Riley Owner", "owner@example.com", "+1 555 0100", "Not sure", "summer"]) {
      expect(email.bodyText).toContain(detail);
      expect(email.bodyHtml).toContain(detail);
    }
    expect(email.bodyHtml).toContain("http://admin.localhost:3000/leads/0192f3c4");
  });

  it("escapes HTML in customer-supplied values", () => {
    const risky = leadReceivedEmail({
      to: "team@example.com",
      name: "<script>alert(1)</script>",
      businessName: "Bella & Co",
      email: "owner@example.com",
      phone: "1",
      hasDomain: "yes",
      message: null,
      leadUrl: "http://admin.localhost:3000/leads/1",
    });
    expect(risky.bodyHtml).not.toContain("<script>");
    expect(risky.bodyHtml).toContain("&lt;script&gt;");
    expect(risky.bodyHtml).toContain("Bella &amp; Co");
  });
});

describe("setupLinkEmail", () => {
  const email = setupLinkEmail({
    to: "owner@example.com",
    businessName: "Riverside Plumbing",
    setupUrl: "http://app.localhost:3000/setup/token-123",
    expiresInDays: 7,
  });

  it("addresses the business and states how long the link lasts", () => {
    expect(email.subject).toBe("Set up your Fynix account");
    expect(email.bodyText).toContain("Riverside Plumbing");
    expect(email.bodyText).toContain("7 days");
    expect(email.bodyHtml).toContain("7 days");
  });

  it("includes the link in both bodies", () => {
    expect(email.bodyText).toContain("http://app.localhost:3000/setup/token-123");
    expect(email.bodyHtml).toContain('href="http://app.localhost:3000/setup/token-123"');
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run `pnpm --filter @fynix/email test`.
Expected: FAIL, unable to resolve `./lead-received` and `./setup-link`.

- [ ] **Step 4: Implement the message helper**

Create `packages/email/src/message.ts`:
```ts
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly template: string;
  readonly bodyText: string;
  readonly bodyHtml: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Values from customers end up in staff inboxes, so everything interpolated into HTML is escaped. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/** Wraps body paragraphs in the plain layout both templates share. */
export function htmlDocument(title: string, paragraphs: readonly string[]): string {
  const body = paragraphs.map((paragraph) => `    <p style="margin:0 0 16px">${paragraph}</p>`).join("\n");
  return [
    '<!doctype html>',
    '<html lang="en">',
    "  <body style=\"margin:0;padding:24px;background:#f6efe6;color:#2a0d10;font-family:system-ui,sans-serif\">",
    `    <h1 style="margin:0 0 20px;font-size:20px">${escapeHtml(title)}</h1>`,
    body,
    "  </body>",
    "</html>",
  ].join("\n");
}
```

- [ ] **Step 5: Implement the templates**

Create `packages/email/src/templates/lead-received.ts`:
```ts
import { escapeHtml, htmlDocument, type EmailMessage } from "../message";

export interface LeadReceivedInput {
  readonly to: string;
  readonly name: string;
  readonly businessName: string;
  readonly email: string;
  readonly phone: string;
  readonly hasDomain: "yes" | "no" | "not_sure";
  readonly message: string | null;
  readonly leadUrl: string;
}

const DOMAIN_LABELS: Readonly<Record<LeadReceivedInput["hasDomain"], string>> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure",
};

/** Internal notification: everything needed to call the lead back. */
export function leadReceivedEmail(input: LeadReceivedInput): EmailMessage {
  const lines = [
    `${input.name} got in touch about ${input.businessName}.`,
    `Email: ${input.email}`,
    `Phone: ${input.phone}`,
    `Has a domain: ${DOMAIN_LABELS[input.hasDomain]}`,
    input.message === null ? "No message." : `Message: ${input.message}`,
    `Open the lead: ${input.leadUrl}`,
  ];

  return {
    to: input.to,
    subject: `New lead: ${input.businessName}`,
    template: "lead-received",
    bodyText: lines.join("\n"),
    bodyHtml: htmlDocument(`New lead: ${input.businessName}`, [
      ...lines.slice(0, -1).map((line) => escapeHtml(line)),
      `<a href="${escapeHtml(input.leadUrl)}">Open the lead</a> (${escapeHtml(input.leadUrl)})`,
    ]),
  };
}
```

Create `packages/email/src/templates/setup-link.ts`:
```ts
import { escapeHtml, htmlDocument, type EmailMessage } from "../message";

export interface SetupLinkInput {
  readonly to: string;
  readonly businessName: string;
  readonly setupUrl: string;
  readonly expiresInDays: number;
}

/** Sent after the call: the one-time link that creates the customer's account. */
export function setupLinkEmail(input: SetupLinkInput): EmailMessage {
  const validity = `This link works once and expires in ${input.expiresInDays} days.`;
  const lines = [
    `Thanks for talking to us about ${input.businessName}.`,
    "Set your password to open your Fynix dashboard:",
    input.setupUrl,
    validity,
    "If you didn't expect this email, you can ignore it.",
  ];

  return {
    to: input.to,
    subject: "Set up your Fynix account",
    template: "setup-link",
    bodyText: lines.join("\n\n"),
    bodyHtml: htmlDocument("Set up your Fynix account", [
      escapeHtml(`Thanks for talking to us about ${input.businessName}.`),
      `<a href="${escapeHtml(input.setupUrl)}">Set your password</a>`,
      escapeHtml(validity),
      escapeHtml("If you didn't expect this email, you can ignore it."),
    ]),
  };
}
```

- [ ] **Step 6: Implement the transport and the entry point**

Create `packages/email/src/outbox.ts`:
```ts
import { recordEmail, type Database } from "@fynix/db";
import type { EmailMessage } from "./message";

export interface EmailTransport {
  readonly send: (message: EmailMessage) => Promise<void>;
}

export const OUTBOX_TRANSPORT_NAME = "outbox";

/**
 * Records the message instead of sending it. Staff read it in the admin Dev Outbox. A provider-backed transport
 * replaces this when real sending is set up; callers only see EmailTransport.
 */
export function createOutboxTransport(db: Database): EmailTransport {
  return {
    send: async (message) => {
      await recordEmail(db, {
        toAddress: message.to,
        subject: message.subject,
        template: message.template,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        transport: OUTBOX_TRANSPORT_NAME,
      });
    },
  };
}
```

Create `packages/email/src/index.ts`:
```ts
export { escapeHtml, htmlDocument, type EmailMessage } from "./message";
export { createOutboxTransport, OUTBOX_TRANSPORT_NAME, type EmailTransport } from "./outbox";
export { leadReceivedEmail, type LeadReceivedInput } from "./templates/lead-received";
export { setupLinkEmail, type SetupLinkInput } from "./templates/setup-link";
```

- [ ] **Step 7: Run to see it pass**

Run `pnpm --filter @fynix/email test && pnpm --filter @fynix/email typecheck`.
Expected: PASS (7 tests) and a clean typecheck.

---

### Task 5: Lead form validation (pure)

**Files:**
- Create: `apps/web/lib/lead-form.ts`, `apps/web/lib/lead-form.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/lead-form.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseLeadForm } from "./lead-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const valid = {
  name: "  Riley Owner ",
  businessName: " Riverside Plumbing ",
  email: " Owner@Example.COM ",
  phone: " +1 555 0100 ",
  hasDomain: "not_sure",
  message: "  We need a site before summer.  ",
};

describe("parseLeadForm", () => {
  it("trims, lowercases the email and keeps the message", () => {
    expect(parseLeadForm(form(valid))).toEqual({
      success: true,
      data: {
        name: "Riley Owner",
        businessName: "Riverside Plumbing",
        email: "owner@example.com",
        phone: "+1 555 0100",
        hasDomain: "not_sure",
        message: "We need a site before summer.",
      },
    });
  });

  it("treats a blank message as none", () => {
    const result = parseLeadForm(form({ ...valid, message: "   " }));
    expect(result).toMatchObject({ success: true, data: { message: null } });
  });

  it("requires a name, business name, phone and a domain answer", () => {
    expect(parseLeadForm(form({ ...valid, name: " " })).success).toBe(false);
    expect(parseLeadForm(form({ ...valid, businessName: "" })).success).toBe(false);
    expect(parseLeadForm(form({ ...valid, phone: "" })).success).toBe(false);
    expect(parseLeadForm(form({ ...valid, hasDomain: "maybe" })).success).toBe(false);
  });

  it("reports the first problem with the field it belongs to", () => {
    expect(parseLeadForm(form({ ...valid, email: "owner@" }))).toMatchObject({
      success: false,
      field: "email",
      message: "Enter a valid email address.",
    });
  });

  it("rejects a message that is too long", () => {
    expect(parseLeadForm(form({ ...valid, message: "x".repeat(1001) })).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run `pnpm --filter @fynix/web test`.
Expected: FAIL, unable to resolve `./lead-form`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/lead-form.ts`:
```ts
import { z } from "zod";

export const LEAD_FIELDS = ["name", "businessName", "email", "phone", "hasDomain", "message"] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 1000;

const leadSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120, "That name is too long."),
  businessName: z.string().trim().min(1, "Tell us your business name.").max(120, "That business name is too long."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter your email address.")
    .max(MAX_EMAIL_LENGTH, "That email address is too long.")
    .pipe(z.email("Enter a valid email address.")),
  phone: z.string().trim().min(5, "Enter a phone number we can reach you on.").max(40, "That phone number is too long."),
  hasDomain: z.enum(["yes", "no", "not_sure"], "Let us know if you already have a domain."),
  message: z
    .string()
    .trim()
    .max(MAX_MESSAGE_LENGTH, "Please keep this under 1000 characters.")
    .transform((value) => (value === "" ? null : value)),
});

export type LeadInput = z.output<typeof leadSchema>;

export type LeadFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly field: LeadField | null }
  | { readonly status: "sent"; readonly name: string; readonly email: string };

export const initialLeadFormState: LeadFormState = { status: "idle" };

export type LeadParseResult =
  | { readonly success: true; readonly data: LeadInput }
  | { readonly success: false; readonly message: string; readonly field: LeadField | null };

function isLeadField(value: unknown): value is LeadField {
  return typeof value === "string" && (LEAD_FIELDS as readonly string[]).includes(value);
}

export function parseLeadForm(formData: FormData): LeadParseResult {
  const input = Object.fromEntries(
    LEAD_FIELDS.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  );

  const result = leadSchema.safeParse(input);
  if (result.success) return { success: true, data: result.data };

  const issue = result.error.issues[0];
  const field = issue === undefined ? null : issue.path[0];
  return {
    success: false,
    message: issue?.message ?? "Check the form and try again.",
    field: isLeadField(field) ? field : null,
  };
}
```

- [ ] **Step 4: Run to see it pass**

Run `pnpm --filter @fynix/web test`.
Expected: PASS.

> **Review fix applied after implementation:** `lib/lead-form.ts` also strips control characters. `cleanLine` (name,
> business name, phone) removes line breaks and other control characters, because those values reach email subject
> lines; `cleanMultiline` (message) keeps real line breaks and normalises CRLF. Tests cover stripping, the field named
> in each failure, and the maximum lengths. The file on disk supersedes the code block above: 101 web tests.

---

### Task 6: The Get started page

**Files:**
- Modify: `apps/web/package.json` (add `@fynix/email`), `apps/web/next.config.ts` (transpile it), `apps/web/lib/site-config.ts`
- Create: `apps/web/lib/server/public-db.ts`, `apps/web/lib/server/leads.ts`
- Create: `apps/web/components/calendly-embed.tsx`, `apps/web/components/lead-form.tsx`
- Create: `apps/web/app/(marketing)/get-started/page.tsx`

- [ ] **Step 1: Wire up the package and public config**

Run:
```bash
pnpm --filter @fynix/web add @fynix/email@workspace:*
```
In `apps/web/next.config.ts`, change the transpile list to:
```ts
  transpilePackages: ["@fynix/auth", "@fynix/db", "@fynix/email"],
```

In `apps/web/lib/site-config.ts`, add two variables to `publicEnvSchema`:
```ts
  NEXT_PUBLIC_APP_URL: z.url("NEXT_PUBLIC_APP_URL must be an absolute URL").optional(),
  NEXT_PUBLIC_CALENDLY_URL: z.url("NEXT_PUBLIC_CALENDLY_URL must be an absolute URL").optional(),
```
to the parsed object:
```ts
  NEXT_PUBLIC_APP_URL: emptyToUndefined(process.env.NEXT_PUBLIC_APP_URL),
  NEXT_PUBLIC_CALENDLY_URL: emptyToUndefined(process.env.NEXT_PUBLIC_CALENDLY_URL),
```
to `SiteConfig`:
```ts
  /** Where customers sign in. */
  readonly appUrl: string;
  /** Booking page shown after the Get started form. Null hides the embed. */
  readonly calendlyUrl: string | null;
```
and to `siteConfig`:
```ts
  appUrl: parsedEnv.data.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:3000",
  calendlyUrl: parsedEnv.data.NEXT_PUBLIC_CALENDLY_URL ?? null,
```

- [ ] **Step 2: The insert-only database connection**

Create `apps/web/lib/server/public-db.ts`:
```ts
import "server-only";
import { createDatabase, type Database } from "@fynix/db";
import { z } from "zod";

// Kept on globalThis so hot reloads reuse the pool instead of opening new ones.
const holder = globalThis as typeof globalThis & { fynixPublicDb?: Database };

const publicEnvSchema = z.object({
  DATABASE_URL_PUBLIC: z.url({ protocol: /^postgres(ql)?$/ }),
});

/**
 * The marketing site's connection. The fynix_public role may only insert leads, rate-limit rows and outbox
 * messages, so a mistake on a public page cannot read customer data.
 */
export function getPublicDb(): Database {
  if (holder.fynixPublicDb === undefined) {
    const parsed = publicEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error('DATABASE_URL_PUBLIC is missing or not a postgres URL. Add it to apps/web/.env.local.');
    }
    holder.fynixPublicDb = createDatabase(parsed.data.DATABASE_URL_PUBLIC, { max: 5 }).db;
  }
  return holder.fynixPublicDb;
}
```

- [ ] **Step 3: The submit action**

Create `apps/web/lib/server/leads.ts`:
```ts
"use server";

import { createLead, consumeRateLimit, type RateLimitRule } from "@fynix/db";
import { createOutboxTransport, leadReceivedEmail } from "@fynix/email";
import { headers } from "next/headers";
import { clientIpFrom } from "@/lib/client-ip";
import { parseLeadForm, type LeadFormState } from "@/lib/lead-form";
import { getPublicDb } from "./public-db";

const ONE_HOUR = 60 * 60;
/** Enough for a shared office, low enough that nobody can flood the inbox. */
const PER_CLIENT_RULE: RateLimitRule = { limit: 5, windowSeconds: ONE_HOUR };
const PER_EMAIL_RULE: RateLimitRule = { limit: 3, windowSeconds: ONE_HOUR };

const TOO_MANY_MESSAGE = "You've sent this a few times already. Give us a little while, or email us directly.";

export async function submitLead(_previous: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const parsed = parseLeadForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, field: parsed.field };

  const lead = parsed.data;
  const db = getPublicDb();
  const clientIp = clientIpFrom(await headers());

  for (const check of [
    { key: `lead:client:${clientIp}`, rule: PER_CLIENT_RULE },
    { key: `lead:email:${lead.email}`, rule: PER_EMAIL_RULE },
  ]) {
    const result = await consumeRateLimit(db, check.key, check.rule);
    if (!result.allowed) return { status: "error", message: TOO_MANY_MESSAGE, field: null };
  }

  const created = await createLead(db, lead);

  const teamInbox = process.env.FYNIX_TEAM_EMAIL;
  if (teamInbox !== undefined && teamInbox.trim() !== "") {
    const adminOrigin = process.env.ADMIN_ORIGIN ?? "http://admin.localhost:3000";
    await createOutboxTransport(db).send(
      leadReceivedEmail({
        to: teamInbox,
        name: lead.name,
        businessName: lead.businessName,
        email: lead.email,
        phone: lead.phone,
        hasDomain: lead.hasDomain,
        message: lead.message,
        leadUrl: new URL(`/leads/${created.id}`, adminOrigin).toString(),
      }),
    );
  }

  return { status: "sent", name: lead.name, email: lead.email };
}
```

- [ ] **Step 4: The Calendly embed**

Create `apps/web/components/calendly-embed.tsx`:
```tsx
"use client";

import Script from "next/script";
import { useState, type ReactElement } from "react";

interface CalendlyEmbedProps {
  readonly url: string;
  /** Prefilled so the customer does not retype what they just gave us. */
  readonly name: string;
  readonly email: string;
}

const WIDGET_SCRIPT = "https://assets.calendly.com/assets/external/widget.js";

/** Calendly's inline widget. Until its script loads, the same booking page is offered as a plain link. */
export function CalendlyEmbed({ url, name, email }: CalendlyEmbedProps): ReactElement {
  const [loaded, setLoaded] = useState(false);
  const bookingUrl = new URL(url);
  bookingUrl.searchParams.set("name", name);
  bookingUrl.searchParams.set("email", email);
  bookingUrl.searchParams.set("hide_gdpr_banner", "1");

  return (
    <div>
      <div
        className="calendly-inline-widget min-h-[42rem] w-full overflow-hidden rounded-3xl border border-line bg-card"
        data-url={bookingUrl.toString()}
      />
      <Script src={WIDGET_SCRIPT} strategy="afterInteractive" onReady={() => setLoaded(true)} />
      {loaded ? null : (
        <p className="mt-4 text-sm text-ink-soft">
          Booking calendar loading.{" "}
          <a href={bookingUrl.toString()} className="link-underline" target="_blank" rel="noopener noreferrer">
            Open it in a new tab
          </a>{" "}
          if it doesn’t appear.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: The form**

Create `apps/web/components/lead-form.tsx`:
```tsx
"use client";

import { useActionState, type ReactElement } from "react";
import { CalendlyEmbed } from "@/components/calendly-embed";
import { initialLeadFormState, type LeadFormState } from "@/lib/lead-form";

interface LeadFormProps {
  readonly action: (state: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  readonly calendlyUrl: string | null;
}

const ERROR_ID = "lead-form-error";
const FIELD_CLASSES =
  "mt-2 block w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent";

export function LeadForm({ action, calendlyUrl }: LeadFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialLeadFormState);

  if (state.status === "sent") {
    return (
      <div>
        <h2 className="font-serif text-3xl">Thanks, {state.name}. Now pick a time.</h2>
        <p className="mt-3 max-w-xl leading-relaxed text-ink-soft">
          We have your details. Choose a slot that suits you and we’ll walk you through how Fynix works, what your
          website will include and what it costs.
        </p>
        <div className="mt-8">
          {calendlyUrl === null ? (
            <p className="rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
              We’ll email you to arrange a time.
            </p>
          ) : (
            <CalendlyEmbed url={calendlyUrl} name={state.name} email={state.email} />
          )}
        </div>
      </div>
    );
  }

  const errorMessage = state.status === "error" && !isPending ? state.message : null;

  return (
    <form action={formAction} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lead-name" className="block text-sm font-medium">
            Your name
          </label>
          <input id="lead-name" name="name" required autoComplete="name" maxLength={120} className={FIELD_CLASSES} />
        </div>
        <div>
          <label htmlFor="lead-business" className="block text-sm font-medium">
            Business name
          </label>
          <input
            id="lead-business"
            name="businessName"
            required
            autoComplete="organization"
            maxLength={120}
            className={FIELD_CLASSES}
          />
        </div>
        <div>
          <label htmlFor="lead-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="lead-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            spellCheck={false}
            autoCapitalize="none"
            maxLength={254}
            className={FIELD_CLASSES}
          />
        </div>
        <div>
          <label htmlFor="lead-phone" className="block text-sm font-medium">
            Phone
          </label>
          <input id="lead-phone" name="phone" type="tel" required autoComplete="tel" maxLength={40} className={FIELD_CLASSES} />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Do you already have a domain?</legend>
        <div className="mt-3 flex flex-wrap gap-4">
          {[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "not_sure", label: "Not sure" },
          ].map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-base">
              <input type="radio" name="hasDomain" value={option.value} required className="size-4 accent-accent" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="lead-message" className="block text-sm font-medium">
          Anything you’d like us to know <span className="text-ink-soft">(optional)</span>
        </label>
        <textarea id="lead-message" name="message" rows={4} maxLength={1000} className={FIELD_CLASSES} />
      </div>

      {errorMessage === null ? null : (
        <p id={ERROR_ID} role="alert" className="rounded-2xl bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-ink px-7 py-4 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {isPending ? "Sending…" : "Book my call"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: The page**

Create `apps/web/app/(marketing)/get-started/page.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Container } from "@/components/container";
import { LeadForm } from "@/components/lead-form";
import { PageIntro } from "@/components/page-intro";
import { SectionWave } from "@/components/section-wave";
import { submitLead } from "@/lib/server/leads";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Tell us about your business and book a call. We'll explain how Fynix works, what your website includes and what it costs.",
  alternates: { canonical: "/get-started" },
};

const WHAT_HAPPENS = [
  {
    title: "A short call",
    body: "Fifteen minutes. We look at your business, answer your questions and explain exactly what you get.",
  },
  {
    title: "Your private setup link",
    body: "If it suits you, we email a link that creates your account. Only you can use it.",
  },
  {
    title: "We build",
    body: "You fill in your details and photos, and your website is ready to review within 48 hours.",
  },
];

export default function GetStartedPage(): ReactElement {
  return (
    <>
      <PageIntro
        seed={31}
        title={
          <>
            Let’s get your business <em>online.</em>
          </>
        }
        lede="Leave your details and pick a time. We'll talk it through first, so you know exactly what you're getting before anything is agreed."
      />

      <section className="relative pb-24 sm:pb-32">
        <Container className="grid gap-16 py-16 sm:py-24 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
          <div className="rise">
            <LeadForm action={submitLead} calendlyUrl={siteConfig.calendlyUrl} />
          </div>

          <aside className="space-y-8">
            <h2 className="font-serif text-2xl">What happens next</h2>
            <ol className="space-y-7">
              {WHAT_HAPPENS.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-3">
                  <span aria-hidden="true" className="font-serif text-lg italic text-accent-deep">
                    {`0${index + 1}`}
                  </span>
                  <div>
                    <h3 className="font-serif text-xl leading-snug">{step.title}</h3>
                    <p className="mt-1.5 leading-relaxed text-ink-soft">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="rounded-3xl border border-line bg-card p-6 leading-relaxed text-ink-soft">
              Already a customer?{" "}
              <a href={new URL("/login", siteConfig.appUrl).toString()} className="link-underline text-ink">
                Sign in to your dashboard
              </a>
              .
            </p>
          </aside>
        </Container>
        <SectionWave edge="bottom" className="text-dark-surface" />
      </section>
    </>
  );
}
```

- [ ] **Step 7: Checkpoint**

Run `pnpm lint && pnpm --filter @fynix/web typecheck && pnpm --filter @fynix/web test && pnpm build`.
Expected: all pass, and the build lists `/get-started`.

---

### Task 7: Marketing entry points

**Files:**
- Modify: `apps/web/components/site-nav.tsx`, `apps/web/app/(marketing)/page.tsx`, `apps/web/components/closing-cta.tsx`, `apps/web/app/(marketing)/pricing/page.tsx`, `apps/web/app/(marketing)/contact/page.tsx`
- Delete: `apps/web/components/preview-request-form.tsx`, `apps/web/lib/preview-request.ts`, `apps/web/lib/preview-request.test.ts`

- [ ] **Step 1: Navbar**

In `apps/web/components/site-nav.tsx`:
- replace `const CONTACT_HREF = "/contact";` with `const GET_STARTED_HREF = "/get-started";`
- replace every other use of `CONTACT_HREF` with `GET_STARTED_HREF`
- change the call-to-action label from `Free preview` to `Get started`
- add a Log in link immediately before that call to action:
```tsx
      <a
        href={new URL("/login", siteConfig.appUrl).toString()}
        className="hidden justify-self-end rounded-full px-4 py-2 text-[0.92rem] text-paper/75 transition-colors duration-300 hover:text-paper lg:block"
      >
        Log in
      </a>
```
and import `siteConfig` from `@/lib/site-config`. Because the pill is a grid, wrap the Log in link and the call to action in a single `<div className="hidden items-center gap-1 justify-self-end lg:flex">` so they share one grid cell.
In the mobile panel list, append a Log in item after the mapped links:
```tsx
          <li>
            <a
              href={new URL("/login", siteConfig.appUrl).toString()}
              className="flex items-center justify-between rounded-2xl px-5 py-4 text-lg transition-colors hover:bg-paper/5"
            >
              Log in
            </a>
          </li>
```

- [ ] **Step 2: Home and closing call to action**

In `apps/web/app/(marketing)/page.tsx`, change both `href="/contact"` buttons to `href="/get-started"`, and the label `Get my free preview` to `Get started`.
In `apps/web/components/closing-cta.tsx`, change `href="/contact"` to `href="/get-started"`, the button label to `Get started`, the heading `Start with a free preview` to `Start with a call`, and the paragraph `Tell us about your business in two minutes. We’ll build a private preview, and you decide from there.` to `Tell us about your business in two minutes, then pick a time to talk. We’ll explain exactly what you get before anything is agreed.`
In `apps/web/app/(marketing)/pricing/page.tsx`, change the call to action `href="/contact"` to `href="/get-started"` and its label to `Get started`.

- [ ] **Step 3: Contact page keeps contact only**

Replace the form column in `apps/web/app/(marketing)/contact/page.tsx`. Remove the `PreviewRequestForm` import and its `<div className="rise">…</div>`, and the `afterRequestSteps`/`formatStepNumber` imports and their block. Replace the page body with a single column: keep `PageIntro` (change the title to `Talk to <em>a person.</em>` and the lede to `Questions before you start? Message us, or go straight to booking a call.`), then a Container with the direct-contact card that is already there, plus:
```tsx
          <ButtonLink href="/get-started" className="mt-10">
            Get started
          </ButtonLink>
```
importing `ButtonLink` from `@/components/button-link`. Update the page metadata title to `Contact` and the description to `Questions about Fynix? Message us, or book a call and we'll walk you through it.`

- [ ] **Step 4: Delete the preview request flow**

Run:
```bash
rm apps/web/components/preview-request-form.tsx apps/web/lib/preview-request.ts apps/web/lib/preview-request.test.ts
grep -rn "preview-request\|PreviewRequestForm\|WHATSAPP_NUMBER_PATTERN" apps/web --include='*.ts' --include='*.tsx' | grep -v node_modules
```
Expected: the grep prints only `apps/web/lib/site-config.ts`, which imports `WHATSAPP_NUMBER_PATTERN`. Move that constant into `site-config.ts` itself:
```ts
/** International number as wa.me expects it: digits only, country code first. */
const WHATSAPP_NUMBER_PATTERN = /^[1-9]\d{7,14}$/;
```
and delete the now-unused import.

- [ ] **Step 5: Checkpoint**

Run `pnpm lint && pnpm --filter @fynix/web typecheck && pnpm --filter @fynix/web test && pnpm build`.
Expected: all pass. The web unit test count drops by the preview-request tests and gains the lead-form tests.

---

### Task 8: Leads in the staff console

**Files:**
- Create: `apps/web/app/admin-host/(protected)/leads/page.tsx`, `leads/[leadId]/page.tsx`, `leads/[leadId]/actions.ts`
- Create: `apps/web/lib/lead-status.ts`, `apps/web/lib/lead-status.test.ts`
- Modify: `apps/web/components/panel/panel-shell.tsx` (navigation), `apps/web/app/admin-host/(protected)/page.tsx` (link to leads)

- [ ] **Step 1: Write the failing status-label tests**

Create `apps/web/lib/lead-status.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, nextStatusOptions } from "./lead-status";

describe("lead status", () => {
  it("labels every status in plain English", () => {
    expect(LEAD_STATUS_ORDER.map((status) => LEAD_STATUS_LABELS[status])).toEqual([
      "New",
      "Call booked",
      "Call done",
      "Agreed",
      "Setup link sent",
      "Account created",
      "Paid",
      "Lost",
    ]);
  });

  it("offers every status except the current one", () => {
    expect(nextStatusOptions("new")).not.toContain("new");
    expect(nextStatusOptions("new")).toHaveLength(LEAD_STATUS_ORDER.length - 1);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run `pnpm --filter @fynix/web test`.
Expected: FAIL, unable to resolve `./lead-status`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/lead-status.ts`:
```ts
import type { LeadStatus } from "@fynix/db";

/** Pipeline order, used for the filter bar and the status picker. */
export const LEAD_STATUS_ORDER = [
  "new",
  "call_booked",
  "call_done",
  "agreed",
  "invite_sent",
  "account_created",
  "paid",
  "lost",
] as const satisfies readonly LeadStatus[];

export const LEAD_STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
  new: "New",
  call_booked: "Call booked",
  call_done: "Call done",
  agreed: "Agreed",
  invite_sent: "Setup link sent",
  account_created: "Account created",
  paid: "Paid",
  lost: "Lost",
};

export function nextStatusOptions(current: LeadStatus): readonly LeadStatus[] {
  return LEAD_STATUS_ORDER.filter((status) => status !== current);
}
```

- [ ] **Step 4: Run to see it pass**

Run `pnpm --filter @fynix/web test`.

- [ ] **Step 5: Panel navigation**

In `apps/web/components/panel/panel-shell.tsx`, add an optional navigation prop so the staff console can show links:
```tsx
export interface PanelNavItem {
  readonly href: string;
  readonly label: string;
}
```
Add `readonly nav?: readonly PanelNavItem[];` to `PanelShellProps`, and render it under the header bar inside the same `<header>`, after the existing flex row:
```tsx
        {nav === undefined || nav.length === 0 ? null : (
          <nav aria-label="Sections" className="mx-auto w-full max-w-6xl px-5 pb-3 sm:px-8">
            <ul className="flex flex-wrap gap-2">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-full px-3 py-1.5 text-sm text-ink-soft transition-colors duration-300 ease-calm hover:bg-paper-deep hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
```
importing `Link` from `next/link` and destructuring `nav` in the component signature.

In `apps/web/app/admin-host/(protected)/layout.tsx`, pass the links:
```tsx
const STAFF_NAV = [
  { href: "/", label: "Overview" },
  { href: "/leads", label: "Leads" },
  { href: "/outbox", label: "Dev outbox" },
] as const;
```
and `<PanelShell surfaceName="Staff console" userEmail={user.email} nav={STAFF_NAV}>`.

- [ ] **Step 6: The leads list**

Create `apps/web/app/admin-host/(protected)/leads/page.tsx`:
```tsx
import { listLeads, type LeadStatus } from "@fynix/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/lead-status";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Leads" };

function isLeadStatus(value: string | undefined): value is LeadStatus {
  return value !== undefined && (LEAD_STATUS_ORDER as readonly string[]).includes(value);
}

export default async function LeadsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireStaffAccess();
  const params = await searchParams;
  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const status = isLeadStatus(requested) ? requested : undefined;
  const leads = await listLeads(getStaffDb(), status === undefined ? {} : { status });

  return (
    <>
      <h1 className="heading-display text-[clamp(2.2rem,5vw,3.2rem)]">
        Leads<em>.</em>
      </h1>

      <nav aria-label="Filter by status" className="mt-8 flex flex-wrap gap-2">
        <Link
          href="/leads"
          className={`rounded-full px-3 py-1.5 text-sm ${status === undefined ? "bg-ink text-paper" : "bg-paper-deep text-ink-soft"}`}
        >
          All
        </Link>
        {LEAD_STATUS_ORDER.map((option) => (
          <Link
            key={option}
            href={`/leads?status=${option}`}
            className={`rounded-full px-3 py-1.5 text-sm ${status === option ? "bg-ink text-paper" : "bg-paper-deep text-ink-soft"}`}
          >
            {LEAD_STATUS_LABELS[option]}
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <p className="mt-10 rounded-3xl border border-line bg-card p-6 text-ink-soft">
          No leads here yet. They appear as soon as someone sends the Get started form.
        </p>
      ) : (
        <ul className="mt-10 space-y-3">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className="flex flex-wrap items-baseline justify-between gap-3 rounded-3xl border border-line bg-card px-6 py-5 transition-colors duration-300 ease-calm hover:bg-paper-deep"
              >
                <span>
                  <span className="font-serif text-xl">{lead.businessName}</span>
                  <span className="ml-3 text-sm text-ink-soft">{lead.name}</span>
                </span>
                <span className="flex items-center gap-4 text-sm text-ink-soft">
                  <span className="rounded-full bg-paper-deep px-3 py-1">{LEAD_STATUS_LABELS[lead.status]}</span>
                  <time dateTime={lead.createdAt.toISOString()}>{lead.createdAt.toLocaleDateString("en-GB")}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Step 7: The overview links to leads**

In `apps/web/app/admin-host/(protected)/page.tsx`, after the stats list, add:
```tsx
      <p className="mt-10">
        <Link href="/leads" className="link-underline">
          Open the leads list
        </Link>
      </p>
```
and import `Link` from `next/link`.

- [ ] **Step 8: Checkpoint**

Run `pnpm lint && pnpm --filter @fynix/web typecheck && pnpm --filter @fynix/web test && pnpm build`.
Expected: all pass; the build lists `/admin-host/leads`.

---

### Task 9: Lead detail, status changes and the setup link

**Files:**
- Create: `apps/web/app/admin-host/(protected)/leads/[leadId]/page.tsx`, `.../actions.ts`
- Create: `apps/web/lib/server/invites.ts`

- [ ] **Step 1: The send-invite service**

Create `apps/web/lib/server/invites.ts`:
```ts
import "server-only";
import { createSetupInvite, findLead, revokeOpenInvites, updateLead } from "@fynix/db";
import { createOutboxTransport, setupLinkEmail } from "@fynix/email";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";

export const INVITE_EXPIRY_DAYS = 7;

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`No lead with id ${leadId}`);
    this.name = "LeadNotFoundError";
  }
}

/**
 * Issues a fresh setup link for a lead and emails it. Any earlier link for that lead is revoked first, so only the
 * newest one works.
 */
export async function sendSetupLink(leadId: string, staffUserId: string): Promise<void> {
  const db = getStaffDb();
  const lead = await findLead(db, leadId);
  if (lead === null) throw new LeadNotFoundError(leadId);

  await revokeOpenInvites(db, leadId);
  const created = await createSetupInvite(db, {
    leadId,
    email: lead.email,
    businessName: lead.businessName,
    createdByStaffId: staffUserId,
    expiresInDays: INVITE_EXPIRY_DAYS,
  });

  await createOutboxTransport(db).send(
    setupLinkEmail({
      to: lead.email,
      businessName: lead.businessName,
      setupUrl: new URL(`/setup/${created.token}`, serverEnv().APP_ORIGIN).toString(),
      expiresInDays: INVITE_EXPIRY_DAYS,
    }),
  );

  await updateLead(db, leadId, { status: "invite_sent" });
}
```

- [ ] **Step 2: The actions**

Create `apps/web/app/admin-host/(protected)/leads/[leadId]/actions.ts`:
```ts
"use server";

import { updateLead, type LeadStatus } from "@fynix/db";
import { revalidatePath } from "next/cache";
import { LEAD_STATUS_ORDER } from "@/lib/lead-status";
import { getStaffDb } from "@/lib/server/db";
import { sendSetupLink } from "@/lib/server/invites";
import { requireStaffAccess } from "@/lib/server/staff-access";

function readStatus(value: FormDataEntryValue | null): LeadStatus {
  if (typeof value !== "string" || !(LEAD_STATUS_ORDER as readonly string[]).includes(value)) {
    throw new Error(`Unknown lead status: ${String(value)}`);
  }
  return value as LeadStatus;
}

function readLeadId(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || value === "") throw new Error("Missing lead id");
  return value;
}

export async function updateLeadDetails(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const leadId = readLeadId(formData.get("leadId"));
  const notes = formData.get("notes");
  await updateLead(getStaffDb(), leadId, {
    status: readStatus(formData.get("status")),
    notes: typeof notes === "string" && notes.trim() !== "" ? notes.trim() : null,
  });
  revalidatePath(`/admin-host/leads/${leadId}`);
}

export async function sendSetupLinkAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const leadId = readLeadId(formData.get("leadId"));
  await sendSetupLink(leadId, user.id);
  revalidatePath(`/admin-host/leads/${leadId}`);
}
```

- [ ] **Step 3: The detail page**

Create `apps/web/app/admin-host/(protected)/leads/[leadId]/page.tsx`:
```tsx
import { findLead } from "@fynix/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/lead-status";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { sendSetupLinkAction, updateLeadDetails } from "./actions";

export const metadata: Metadata = { title: "Lead" };

const DOMAIN_LABELS = { yes: "Yes", no: "No", not_sure: "Not sure" } as const;

export default async function LeadDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly leadId: string }>;
}): Promise<ReactElement> {
  await requireStaffAccess();
  const { leadId } = await params;
  const lead = await findLead(getStaffDb(), leadId);
  if (lead === null) notFound();

  return (
    <>
      <Link href="/leads" className="link-underline text-sm">
        Back to leads
      </Link>
      <h1 className="heading-display mt-4 text-[clamp(2.2rem,5vw,3.2rem)]">
        {lead.businessName}
        <em>.</em>
      </h1>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          { label: "Contact", value: lead.name },
          { label: "Email", value: lead.email },
          { label: "Phone", value: lead.phone },
          { label: "Has a domain", value: DOMAIN_LABELS[lead.hasDomain] },
          { label: "Status", value: LEAD_STATUS_LABELS[lead.status] },
          { label: "Received", value: lead.createdAt.toLocaleString("en-GB") },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-line bg-card p-5">
            <dt className="text-sm text-ink-soft">{item.label}</dt>
            <dd className="mt-1 break-words text-lg">{item.value}</dd>
          </div>
        ))}
      </dl>

      {lead.message === null ? null : (
        <div className="mt-4 rounded-3xl border border-line bg-card p-5">
          <h2 className="text-sm text-ink-soft">Their message</h2>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{lead.message}</p>
        </div>
      )}

      <form action={updateLeadDetails} className="mt-10 rounded-3xl border border-line bg-card p-6">
        <input type="hidden" name="leadId" value={lead.id} />
        <h2 className="font-serif text-2xl">Update this lead</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="lead-status" className="block text-sm font-medium">
              Status
            </label>
            <select
              id="lead-status"
              name="status"
              defaultValue={lead.status}
              className="mt-2 block w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base"
            >
              {LEAD_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lead-notes" className="block text-sm font-medium">
              Notes (private)
            </label>
            <textarea
              id="lead-notes"
              name="notes"
              rows={3}
              defaultValue={lead.notes ?? ""}
              className="mt-2 block w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base"
            />
          </div>
        </div>
        <button
          type="submit"
          className="mt-5 rounded-full bg-ink px-6 py-3 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep"
        >
          Save
        </button>
      </form>

      <form action={sendSetupLinkAction} className="mt-4 rounded-3xl border border-line bg-card p-6">
        <input type="hidden" name="leadId" value={lead.id} />
        <h2 className="font-serif text-2xl">Send the setup link</h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">
          Emails {lead.email} a one-time link that creates their account. Any link sent earlier stops working, and the
          new one expires in 7 days.
        </p>
        <button
          type="submit"
          className="mt-5 rounded-full border border-ink px-6 py-3 text-[0.78rem] font-bold uppercase tracking-[0.14em] transition-colors duration-300 ease-calm hover:bg-ink hover:text-paper"
        >
          Send setup link
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 4: Checkpoint**

Run `pnpm lint && pnpm --filter @fynix/web typecheck && pnpm build`.
Expected: all pass; the build lists `/admin-host/leads/[leadId]`.

---

### Task 10: The Dev Outbox

**Files:**
- Create: `apps/web/app/admin-host/(protected)/outbox/page.tsx`, `outbox/[emailId]/page.tsx`

- [ ] **Step 1: The list**

Create `apps/web/app/admin-host/(protected)/outbox/page.tsx`:
```tsx
import { listRecentEmails } from "@fynix/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Dev outbox" };

const MAX_MESSAGES = 50;

export default async function OutboxPage(): Promise<ReactElement> {
  await requireStaffAccess();
  const messages = await listRecentEmails(getStaffDb(), MAX_MESSAGES);

  return (
    <>
      <h1 className="heading-display text-[clamp(2.2rem,5vw,3.2rem)]">
        Dev outbox<em>.</em>
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-soft">
        Email isn’t sent anywhere yet. Every message the platform produces is recorded here so you can read it and
        follow its links.
      </p>

      {messages.length === 0 ? (
        <p className="mt-10 rounded-3xl border border-line bg-card p-6 text-ink-soft">Nothing sent yet.</p>
      ) : (
        <ul className="mt-10 space-y-3">
          {messages.map((message) => (
            <li key={message.id}>
              <Link
                href={`/outbox/${message.id}`}
                className="flex flex-wrap items-baseline justify-between gap-3 rounded-3xl border border-line bg-card px-6 py-5 transition-colors duration-300 ease-calm hover:bg-paper-deep"
              >
                <span>
                  <span className="font-serif text-xl">{message.subject}</span>
                  <span className="ml-3 text-sm text-ink-soft">{message.toAddress}</span>
                </span>
                <time dateTime={message.createdAt.toISOString()} className="text-sm text-ink-soft">
                  {message.createdAt.toLocaleString("en-GB")}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Step 2: The message**

Create `apps/web/app/admin-host/(protected)/outbox/[emailId]/page.tsx`:
```tsx
import { findEmail } from "@fynix/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "Message" };

export default async function OutboxMessagePage({
  params,
}: {
  readonly params: Promise<{ readonly emailId: string }>;
}): Promise<ReactElement> {
  await requireStaffAccess();
  const { emailId } = await params;
  const message = await findEmail(getStaffDb(), emailId);
  if (message === null) notFound();

  return (
    <>
      <Link href="/outbox" className="link-underline text-sm">
        Back to the outbox
      </Link>
      <h1 className="heading-display mt-4 text-[clamp(2rem,4vw,2.8rem)]">{message.subject}</h1>
      <p className="mt-3 text-ink-soft">
        To {message.toAddress} · template {message.template} · {message.createdAt.toLocaleString("en-GB")}
      </p>

      <h2 className="mt-10 font-serif text-2xl">Plain text</h2>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-3xl border border-line bg-card p-6 text-sm leading-relaxed">
        {message.bodyText}
      </pre>

      <h2 className="mt-10 font-serif text-2xl">HTML</h2>
      {/* Sandboxed: the body is rendered email markup, never trusted as part of this page. */}
      <iframe
        title="HTML version"
        sandbox=""
        srcDoc={message.bodyHtml}
        className="mt-3 h-[28rem] w-full rounded-3xl border border-line bg-white"
      />
    </>
  );
}
```

- [ ] **Step 3: Checkpoint**

Run `pnpm lint && pnpm --filter @fynix/web typecheck && pnpm build`.

---

### Task 11: Redeeming the setup link

**Files:**
- Create: `apps/web/lib/setup-form.ts`, `apps/web/lib/setup-form.test.ts`
- Create: `apps/web/lib/server/setup.ts`
- Create: `apps/web/app/app-host/setup/[token]/page.tsx`, `.../actions.ts`, `apps/web/components/panel/setup-form.tsx`

- [ ] **Step 1: Write the failing password-form tests**

Create `apps/web/lib/setup-form.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseSetupForm, SETUP_PASSWORD_MIN_LENGTH } from "./setup-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const valid = { name: " Riley Owner ", password: "correct-horse-battery", confirmPassword: "correct-horse-battery" };

describe("parseSetupForm", () => {
  it("trims the name and keeps the password as typed", () => {
    expect(parseSetupForm(form(valid))).toEqual({
      success: true,
      data: { name: "Riley Owner", password: "correct-horse-battery" },
    });
  });

  it("requires a name", () => {
    expect(parseSetupForm(form({ ...valid, name: "  " }))).toMatchObject({
      success: false,
      message: "Tell us your name.",
    });
  });

  it(`requires at least ${SETUP_PASSWORD_MIN_LENGTH} characters`, () => {
    const short = "a".repeat(SETUP_PASSWORD_MIN_LENGTH - 1);
    expect(parseSetupForm(form({ ...valid, password: short, confirmPassword: short }))).toMatchObject({
      success: false,
      message: `Use at least ${SETUP_PASSWORD_MIN_LENGTH} characters.`,
    });
  });

  it("requires both passwords to match", () => {
    expect(parseSetupForm(form({ ...valid, confirmPassword: "something-else" }))).toMatchObject({
      success: false,
      message: "Both passwords must match.",
    });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run `pnpm --filter @fynix/web test`.
Expected: FAIL, unable to resolve `./setup-form`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/setup-form.ts`:
```ts
import { z } from "zod";

/** Matches PASSWORD_MIN_LENGTH in @fynix/auth; kept here so this module stays browser-safe. */
export const SETUP_PASSWORD_MIN_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 128;

const setupSchema = z
  .object({
    name: z.string().trim().min(1, "Tell us your name.").max(120, "That name is too long."),
    password: z
      .string()
      .min(SETUP_PASSWORD_MIN_LENGTH, `Use at least ${SETUP_PASSWORD_MIN_LENGTH} characters.`)
      .max(MAX_PASSWORD_LENGTH, "That password is too long."),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

export interface SetupInput {
  readonly name: string;
  readonly password: string;
}

export type SetupFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string };

export const initialSetupFormState: SetupFormState = { status: "idle" };

export type SetupParseResult =
  | { readonly success: true; readonly data: SetupInput }
  | { readonly success: false; readonly message: string };

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function parseSetupForm(formData: FormData): SetupParseResult {
  const result = setupSchema.safeParse({
    name: textValue(formData, "name"),
    password: textValue(formData, "password"),
    confirmPassword: textValue(formData, "confirmPassword"),
  });
  if (!result.success) {
    return { success: false, message: result.error.issues[0]?.message ?? "Check the form and try again." };
  }
  return { success: true, data: { name: result.data.name, password: result.data.password } };
}
```

- [ ] **Step 4: Run to see it pass**

Run `pnpm --filter @fynix/web test`.

- [ ] **Step 5: The redemption service**

Create `apps/web/lib/server/setup.ts`:
```ts
import "server-only";
import { createAccountWithGrant } from "@fynix/auth";
import { findRedeemableInvite, redeemInviteIntoBusiness, type SetupInvite } from "@fynix/db";
import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getStaffDb } from "./db";

export class InviteNotUsableError extends Error {
  constructor() {
    super("This setup link has already been used, was replaced, or has expired.");
    this.name = "InviteNotUsableError";
  }
}

export async function findInviteForToken(token: string): Promise<SetupInvite | null> {
  return findRedeemableInvite(getStaffDb(), token);
}

export interface SetupAccount {
  readonly name: string;
  readonly password: string;
}

/**
 * Creates the account, the business and the owner membership for a valid setup link, then signs the customer in.
 * The invite is re-read here, so a link redeemed in another tab cannot be used twice.
 */
export async function redeemSetupInvite(token: string, account: SetupAccount): Promise<void> {
  const db = getStaffDb();
  const invite = await findRedeemableInvite(db, token);
  if (invite === null) throw new InviteNotUsableError();

  const created = await createAccountWithGrant(getAuth(), db, {
    email: invite.email,
    name: account.name,
    password: account.password,
  });

  await redeemInviteIntoBusiness(db, {
    inviteId: invite.id,
    leadId: invite.leadId,
    businessName: invite.businessName,
    userId: created.userId,
  });

  await getAuth().api.signInEmail({
    body: { email: invite.email, password: account.password },
    headers: await headers(),
  });
}
```

- [ ] **Step 6: The action and the form**

Create `apps/web/app/app-host/setup/[token]/actions.ts`:
```ts
"use server";

import { AccountAlreadyExistsError } from "@fynix/auth";
import { redirect } from "next/navigation";
import { parseSetupForm, type SetupFormState } from "@/lib/setup-form";
import { InviteNotUsableError, redeemSetupInvite } from "@/lib/server/setup";

export async function completeSetup(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token === "") {
    return { status: "error", message: "This setup link is incomplete. Open the link from your email again." };
  }

  const parsed = parseSetupForm(formData);
  if (!parsed.success) return { status: "error", message: parsed.message };

  try {
    await redeemSetupInvite(token, parsed.data);
  } catch (error) {
    if (error instanceof InviteNotUsableError) return { status: "error", message: error.message };
    if (error instanceof AccountAlreadyExistsError) {
      return { status: "error", message: "You already have an account. Sign in instead." };
    }
    throw error;
  }
  redirect("/");
}
```

Create `apps/web/components/panel/setup-form.tsx`:
```tsx
"use client";

import { useActionState, type ReactElement } from "react";
import { initialSetupFormState, SETUP_PASSWORD_MIN_LENGTH, type SetupFormState } from "@/lib/setup-form";

interface SetupFormProps {
  readonly action: (state: SetupFormState, formData: FormData) => Promise<SetupFormState>;
  readonly token: string;
}

const ERROR_ID = "setup-error";
const INPUT_CLASSES =
  "mt-2 block w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink transition-colors duration-300 ease-calm focus:border-accent";

export function SetupForm({ action, token }: SetupFormProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialSetupFormState);
  const errorMessage = state.status === "error" && !isPending ? state.message : null;

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="setup-name" className="block text-sm font-medium">
          Your name
        </label>
        <input id="setup-name" name="name" required autoComplete="name" maxLength={120} className={INPUT_CLASSES} />
      </div>
      <div>
        <label htmlFor="setup-password" className="block text-sm font-medium">
          Choose a password
        </label>
        <input
          id="setup-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={SETUP_PASSWORD_MIN_LENGTH}
          className={INPUT_CLASSES}
        />
        <p className="mt-2 text-sm text-ink-soft">At least {SETUP_PASSWORD_MIN_LENGTH} characters.</p>
      </div>
      <div>
        <label htmlFor="setup-confirm" className="block text-sm font-medium">
          Repeat the password
        </label>
        <input
          id="setup-confirm"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className={INPUT_CLASSES}
        />
      </div>

      {errorMessage === null ? null : (
        <p id={ERROR_ID} role="alert" className="rounded-2xl bg-accent-pale px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-ink px-7 py-4 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-paper transition-colors duration-300 ease-calm hover:bg-accent-deep disabled:cursor-wait disabled:opacity-70"
      >
        {isPending ? "Creating your account…" : "Create my account"}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: The page**

Create `apps/web/app/app-host/setup/[token]/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { AuthScreen } from "@/components/panel/auth-screen";
import { SetupForm } from "@/components/panel/setup-form";
import { findInviteForToken } from "@/lib/server/setup";
import { completeSetup } from "./actions";

export const metadata: Metadata = { title: "Set up your account" };

export default async function SetupPage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<ReactElement> {
  const { token } = await params;
  const invite = await findInviteForToken(token);

  if (invite === null) {
    return (
      <AuthScreen
        title={
          <>
            This link no longer <em>works.</em>
          </>
        }
        lede="Setup links work once and expire after 7 days. Ask us for a new one and we'll send it straight away."
      >
        <Link href="/login" className="link-underline">
          Go to sign in
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={
        <>
          Welcome to <em>Fynix.</em>
        </>
      }
      lede={`Set a password for ${invite.email} and we'll open the dashboard for ${invite.businessName}.`}
    >
      <SetupForm action={completeSetup} token={token} />
    </AuthScreen>
  );
}
```

- [ ] **Step 8: Checkpoint**

Run `pnpm lint && pnpm --filter @fynix/web typecheck && pnpm --filter @fynix/web test && pnpm build`.
Expected: all pass; the build lists `/app-host/setup/[token]`.

---

### Task 12: Copy that still describes the old model

The site says the build is free and paid quarterly. The agreed model is $225 for the first three months, then $75 a month, after a call.

**Files:**
- Modify: `apps/web/lib/pricing.ts`, `apps/web/lib/pricing.test.ts`, `apps/web/content/faqs.ts`, `apps/web/content/process.ts`, `apps/web/components/plan-highlight.tsx`, `apps/web/app/(marketing)/pricing/page.tsx`, `apps/web/lib/site-config.ts`

- [ ] **Step 1: Prices**

In `apps/web/lib/pricing.ts`, replace `carePlan` and `changePricing` with:
```ts
export const carePlan = {
  name: "Care",
  monthlyCents: 7_500,
  firstTermCents: 22_500,
  firstTermMonths: 3,
  includes: [
    "A six-page website, written with you",
    "Hosting and SSL certificate",
    "Security and software updates",
    "Google Business Profile setup",
    "Basic local SEO",
    "Contact form and click-to-call",
    "Google Map and directions",
    "Your own domain, owned by you",
  ],
} as const;

export const changePricing = {
  /** Publishes included each month before extras are charged. */
  includedPublishesPerMonth: 3,
  extraPublishCents: 300,
} as const;
```
Update `apps/web/lib/pricing.test.ts` so its assertions use the new field names, keeping the existing `formatPrice` tests unchanged:
```ts
  it("prices the first term and the monthly fee", () => {
    expect(formatPrice(carePlan.firstTermCents)).toBe("$225");
    expect(formatPrice(carePlan.monthlyCents)).toBe("$75");
    expect(carePlan.firstTermMonths).toBe(3);
  });

  it("prices extra publishes", () => {
    expect(changePricing.includedPublishesPerMonth).toBe(3);
    expect(formatPrice(changePricing.extraPublishCents)).toBe("$3");
  });
```
Then run `grep -rn "quarterlyCents\|monthlyEquivalentCents\|freeChangesAfterLaunch\|includedSmallChangesPerQuarter\|extraSmallChangeCents\|newPageCents" apps/web --include='*.ts' --include='*.tsx' | grep -v node_modules` and update every remaining use to the new fields.

- [ ] **Step 2: Pricing page**

In `apps/web/app/(marketing)/pricing/page.tsx`:
- the metadata description becomes `${formatPrice(carePlan.firstTermCents)} for your first three months, then ${formatPrice(carePlan.monthlyCents)} a month. Hosting, updates and support included.`
- the lede becomes `One plan. ${formatPrice(carePlan.firstTermCents)} covers your first three months, then it's ${formatPrice(carePlan.monthlyCents)} a month for as long as you want us looking after it.`
- the price rows become:
```tsx
              <PriceRow label="First three months" value={formatPrice(carePlan.firstTermCents)} />
              <PriceRow label="Every month after that" value={formatPrice(carePlan.monthlyCents)} emphasis />
```
- the changes table rows become:
```tsx
  { label: `${changePricing.includedPublishesPerMonth} content updates a month`, price: "Included" },
  { label: "Each extra update", price: formatPrice(changePricing.extraPublishCents) },
  { label: "Changes we make for you", price: "Ask us" },
```

- [ ] **Step 3: FAQs**

In `apps/web/content/faqs.ts`, replace the free-preview and quarterly answers:
```ts
  {
    question: "Is there anything to pay up front?",
    answer: `Your first payment is ${formatPrice(carePlan.firstTermCents)}, which covers your first three months. There's no separate build fee: the website, hosting and support are all part of the plan.`,
  },
  {
    question: "What happens on the call?",
    answer:
      "About fifteen minutes. We ask what your business does, what you want the website to do, and answer anything you'd like to know. If it suits you, we send a private setup link afterwards.",
  },
  {
    question: "When do I pay after that?",
    answer: `After the first three months it's ${formatPrice(carePlan.monthlyCents)} a month, charged automatically. You can cancel whenever you like; your website stays online while the plan is active.`,
  },
  {
    question: "Can I change things myself later?",
    answer: `Yes. You can edit text, photos and blog posts from your dashboard, and publish ${changePricing.includedPublishesPerMonth} updates a month at no extra cost. After that each update is ${formatPrice(changePricing.extraPublishCents)}. Anything bigger, just ask us.`,
  },
```
Keep every other entry. Delete any entry that promises a free preview.

- [ ] **Step 4: Payment steps and after-request steps**

In `apps/web/content/process.ts`, replace `paymentSteps` and `afterRequestSteps` with:
```ts
export const paymentSteps: readonly RouteStep[] = [
  {
    title: "Book a call",
    body: "Tell us about your business through the Get started form and pick a time that suits you.",
    cost: "Free",
  },
  {
    title: "Talk it through",
    body: "We explain what your website will include, what it costs and how long it takes. Ask us anything.",
    cost: "Free",
  },
  {
    title: "Start your plan",
    body: `If it's right for you, we send a private setup link and you pay for your first three months.`,
    cost: `${formatPrice(carePlan.firstTermCents)} for 3 months`,
    highlight: true,
  },
  {
    title: "Every month after that",
    body: "Your plan renews automatically, with a reminder before each payment and an invoice after.",
    cost: `${formatPrice(carePlan.monthlyCents)} a month`,
  },
];

/** What happens after someone books a call. */
export const afterRequestSteps: readonly TitledText[] = [
  {
    title: "We look you up",
    body: "Before the call we check how your business shows up on Google and Maps today.",
  },
  {
    title: "We talk",
    body: "Fifteen minutes on the phone. You'll know exactly what you get and what it costs.",
  },
  {
    title: "You decide",
    body: "If it's a yes, we email your setup link. If it isn't, that's genuinely fine.",
  },
];
```

- [ ] **Step 5: Plan highlight and site description**

In `apps/web/components/plan-highlight.tsx`, replace the price block with:
```tsx
              {formatPrice(carePlan.monthlyCents)}
```
and the line beneath it with:
```tsx
            {formatPrice(carePlan.firstTermCents)} covers your first three months, then {formatPrice(carePlan.monthlyCents)} a month.
```
In `apps/web/lib/site-config.ts`, replace the description with:
```ts
  description:
    "Professionally built websites for local businesses, looked after for you. $225 for your first three months, then $75 a month.",
```

- [ ] **Step 6: Check nothing still promises a free preview**

Run:
```bash
grep -rni "free preview\|free build\|billed quarterly\|every three months\|quarter" apps/web/app apps/web/components apps/web/content apps/web/lib --include='*.ts' --include='*.tsx' | grep -v node_modules
```
Expected: no matches outside `content/legal.ts` (owned by another session; leave it and report it).

- [ ] **Step 7: Checkpoint**

Run `pnpm lint && pnpm --filter @fynix/web typecheck && pnpm --filter @fynix/web test && pnpm build`.

---

### Task 13: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Every automated check**

Run:
```bash
pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm test:integration && pnpm build
```
Expected: all pass. Report the test counts.

- [ ] **Step 2: Walk the funnel in a browser**

Start the app (`pnpm dev`, or a production build on another port if a dev server is already using 3000) and, in Chrome:

1. `http://localhost:3000` — the navbar shows **Get started** and **Log in**, and the home and closing calls to action both lead to `/get-started`.
2. `/get-started` — submit the form with your own details. The page thanks you by name and shows the Calendly booking widget.
3. `http://admin.localhost:3000/leads` — the lead appears as **New**. Open it: every detail is there.
4. `http://admin.localhost:3000/outbox` — the lead notification is listed. Open it and check both the plain text and HTML versions.
5. Back on the lead: set the status to **Agreed**, add a note, save. Then press **Send setup link**. The status becomes **Setup link sent**.
6. `http://admin.localhost:3000/outbox` — open the setup-link email and copy the link.
7. Open the link in a private window: set a name and password. You land on the customer dashboard, which greets you with the business name.
8. Open the same link again: it says the link no longer works.
9. `http://admin.localhost:3000/leads` — the lead now shows **Account created**.
10. Sign out, then sign in again at `http://app.localhost:3000/login` with that email and password.

- [ ] **Step 3: Clean up the trial data**

Run:
```bash
set -a && source apps/web/.env.local && set +a
psql "$DATABASE_URL_OWNER" -c "delete from business_members; delete from setup_invites; delete from businesses; delete from leads; delete from email_messages; delete from accounts; delete from sessions; delete from users where id not in (select user_id from staff_members);"
```
Expected: the commands succeed and your staff account still works.

- [ ] **Step 4: Report**

Do not commit. Report:
- the results of Step 1 with counts;
- each browser step from Step 2 with what you saw;
- anything that felt wrong in the copy or the flow;
- that Phase 1C (payment wall, Razorpay, welcome screen, refunds) is next.
