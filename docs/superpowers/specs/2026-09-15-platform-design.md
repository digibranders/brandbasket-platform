# Fynix Platform: Design Spec

- **Date:** 2026-09-15
- **Status:** Draft, awaiting review
- **Scope:** The customer platform: sales funnel, customer dashboard, staff admin, tenant website renderer and billing lifecycle. The existing marketing site stays; this spec only changes its calls to action.
- **Environment:** local development first. Production hosting, real email delivery and live Razorpay keys come later and must not change the architecture.

---


> **Repository layout (changed 2026-09-17):** the single `apps/web` app was split in two repositories. The marketing
> site is its own repository, `fynix-website` (port 3000 locally); this repository is the platform: `apps/platform`
> holds the customer app, staff admin and API routes (app./admin. on port 3001), with `packages/shared` for its UI
> and helpers. The website holds no database credentials: its Get started form posts to the platform's
> `POST /api/leads` with a shared `LEADS_API_TOKEN`, and the platform validates, rate-limits and stores the lead.
> References to `apps/web` below and in the phase plans predate the split.

## 1. Business rules (decided)

| Rule | Decision |
|---|---|
| Offer | 6-page managed website for US local businesses. Hosting, SSL, maintenance, basic SEO, contact form, CMS and support included. |
| Price (changed 2026-09-16) | **$75 a month, charged monthly from the first payment.** The first payment is $75 and covers the first month; there is no 3-month start and no build fee. (Was $225 for the first 3 months, then $75.) |
| India pricing (changed 2026-09-17) | **₹3,500 a month, and the first payment is ₹3,500 covering one month** (was ₹2,500; migration 0023) (confirmed by the user; there is no 3-month start in INR). India sees INR; every other country sees USD. The country shown on the marketing page comes from the hosting platform's IP header with a manual switch, but the currency actually charged is set on the lead when staff send the setup link, never guessed from an IP. Razorpay needs a separate plan per currency. |
| Sales | No self-serve sign-up. Visitor clicks **Get started** → lead form → Calendly call → verbal agreement → staff send a **one-time setup link**. |
| Access | The customer sets their own password from the setup link. Staff never create or send passwords. |
| Payment wall | **Changed 2026-09-16:** a new customer can open and read the whole dashboard before paying, so they can see what they are buying. A banner and a locked marker on each part point at the first payment. Nothing that writes (onboarding, requests, publishing) runs until it is confirmed, and that is enforced on the server in every action. |
| Refunds | Full refund of the **first payment only**, **once per business**, requested **within 7 days** of payment and **before the build starts** (the project has not moved to `building`). *Changed 2026-09-16: payment now happens at the end of setup and sends the onboarding in the same step, so "before onboarding is submitted" could never apply.* The customer uses a "Request refund" button; staff call them and process it within 1 business day. The request time counts toward the 7 days. Monthly and reactivation payments are never refundable. |
| Payment provider | **Razorpay** (subscriptions in USD, international cards). |
| Cancellation | Cancel anytime, no notice period (2026-09-16). The site stays online until `paid_through_at`, then goes offline; data is kept. The customer is reminded before every renewal. |
| Failed renewals | **No grace period (changed 2026-09-16).** The site goes offline the moment a payment is due and unpaid, even while Razorpay is still retrying (`pending`); it comes back as soon as a payment succeeds. Access ends when `paid_through_at` passes without a new payment. (Earlier: online while Razorpay retried.) |
| Reactivation | A successful payment brings the site back automatically, with no rebuild. Missed months are not charged. |
| Data | Lapsing, halting or cancelling never deletes the website, content, images or tenant. |
| Domains | The customer owns the domain and registrar account. Fynix only gives DNS instructions. **Onboarding cannot be submitted without a domain the customer owns.** There is no Fynix fallback address. Staff never take registrar logins. |
| Revisions | **2 revision rounds** before launch. A round is one submission of many change items. Staff can grant extra rounds (logged). Staff can mark individual items out of scope. |
| Design control | Fynix controls design, layout, code and all structured business data. After launch, customers can edit **only blog posts, text and images** (see "Content updates after launch"). |
| Blog | Optional extra, off by default, **not** one of the 6 pages. Posts are written and published **by the customer only**; Fynix does not write posts. Fixed design. Publishing or updating a post uses the monthly content-update allowance. |
| Change and blog pricing (changed 2026-09-17) | **Changes:** the customer's first hour of changes is free, once (not each month); every hour after that is **$15** (₹1,425). **Blog posts:** up to **100** are included; after that they are sold in blocks of 100 at **$5** (₹475) a block. Rupee amounts are the dollar prices at ₹95 to US$1. Stored on `plans` (migration 0026: `included_change_hours`, `extra_hour_amount_cents`, `included_blog_posts`, `blog_post_block_size`, `extra_blog_posts_amount_cents`). **This replaces the 3-publishes-a-month / $3-per-publish rule below**; `included_publishes_per_month` and `extra_publish_amount_cents` remain on `plans` only until the publish workflow is redesigned around the new prices. The customer also now provides only their domain (a free temporary domain if they have none); Fynix creates the design, words and photos. |
| Content updates after launch | **Customers can edit only three things:** (1) **text** in customer-editable fields of existing page sections, (2) **images**, meaning replacing images in existing image slots and adding, removing or reordering gallery photos, and (3) **blog posts** (write, edit, publish, unpublish). Everything else is changed by Fynix through a support request: services, testimonials, business details (name, phone, email, address, service areas, hours, special hours, social links), pages, SEO settings and design. Saving drafts is unlimited and free. **Publishing is limited to 3 free publishes per billing month**; each further publish costs **$3**, paid at publish time. One publish can include any number of edits. Unused publishes don't roll over. Free and outside the allowance: unpublishing a blog post, rolling back to an earlier version, and publishes made by Fynix staff. |

## 2. System architecture

### 2.1 Surfaces

| Host (production) | Host (local) | App | Purpose |
|---|---|---|---|
| `fynix.digital` | `localhost:3000` | `apps/web` | Marketing site (existing) |
| `app.fynix.digital` | `app.localhost:3000` | `apps/web` | Setup link, login, payment, onboarding, customer dashboard, CMS, preview |
| `admin.fynix.digital` | `admin.localhost:3000` | `apps/web` | Staff console |
| Customer domains | `*.localhost:3001` and `/etc/hosts` test domains | `apps/sites` | Tenant website renderer |

Local subdomains of `localhost` resolve automatically in Chrome and Firefox; use one of those for local testing.

### 2.2 Repository layout

The current single Next.js app becomes a pnpm workspace:

```
apps/
  web/        Marketing + customer app + admin, routed by hostname in proxy.ts
  sites/      Tenant renderer only; read-only DB role; no billing secrets
  worker/     Background job worker (pg-boss)
packages/
  db/         Drizzle schema, migrations, DB roles, RLS policies, tenant-scoped data access
  auth/       Better Auth factory and the invite-only account-creation gate
  domain/     Pure business logic: state machines, visibility, refund eligibility, pricing
  billing/    BillingProvider interface + Razorpay adapter + fake adapter for local testing
  content/    Section type registry, zod schemas, release snapshot builder
  templates/  Tenant website components (used by apps/sites and the preview route)
  email/      Email templates + transports (local outbox now, provider later)
  ui/         Shared dashboard/admin components
```

**Why two web apps.** A bad dashboard deploy must not take down every customer site, and the public renderer must not hold write credentials or billing secrets.

**Why `packages/domain` is pure.** State transitions, visibility and refund eligibility are the rules most likely to be wrong and most costly when wrong. As pure functions they are fully unit-testable without a database.

### 2.3 Infrastructure choices

| Concern | Local (now) | Production (later) |
|---|---|---|
| Database | Local PostgreSQL, database `fynix` | Managed PostgreSQL (e.g. Neon) |
| ORM / migrations | Drizzle | Drizzle |
| Auth | Better Auth, email + password | + Google sign-in; staff 2FA required |
| Billing | `BILLING_PROVIDER=fake`, then `razorpay` with test keys and a local tunnel for webhooks | Razorpay live keys |
| Email | `EMAIL_TRANSPORT=outbox`: stored in `email_log`, viewable in the admin Dev Outbox | Transactional provider (e.g. Resend) |
| Media storage | Local filesystem adapter (`.data/media`) | S3-compatible object storage |
| Jobs | pg-boss on the same Postgres, run by `apps/worker` | Same |
| Domains/TLS | `/etc/hosts` entries | Platform domains API (decided in Phase 6) |

Every external dependency sits behind an interface (`BillingProvider`, `EmailTransport`, `MediaStorage`, `DomainProvider`), so moving from local to production means changing configuration, not code.

## 3. Customer journey

```
Marketing "Get started"
  → Lead form (saved as lead, team notified)
  → Calendly booking (https://calendly.com/steve-fynix/30min)
  → Call → verbal agreement
  → Staff: "Send setup link" (7-day, single-use)
  → Customer sets password
  → PAYMENT WALL: first month ($75 or ₹3,500) via Razorpay
  → Payment confirmed → Welcome
  → Onboarding: 01 Business · 02 Content (pages, services) · 03 Brand (images) · 04 Domain · 05 Review
  → Submit (locks onboarding; starts 48h build window; ends refund eligibility)
  → Staff build → Private preview
  → Customer: Approve  |  Request changes (max 2 rounds unless staff grant more)
  → Approved → Connect domain (DNS instructions) → DNS verified
  → Launch → LIVE
  → CMS: customer edits ONLY text, images and blog posts
      drafts free · 3 free publishes per billing month · then $3 per publish
      anything else (services, testimonials, business details, pages, design) → support request → Fynix
  → Support; $75 (or ₹3,500) a month, renewing monthly
  → payment due and unpaid → site offline immediately (data kept) → customer pays → site online
```

### 3.1 Marketing site changes

- The "Free preview" CTA becomes **Get started** in the navbar, hero and closing sections. A **Log in** link goes to `app.` host `/login`.
- `/get-started` has a lead form: name, business name, email, phone, "Do you have a domain?" (yes / no / not sure), optional message.
  - On success the page shows the Calendly inline embed, prefilled with name and email.
- The WhatsApp preview-request flow is retired.
- `lib/pricing.ts` shows "$75 a month" from the first payment (2026-09-16; earlier drafts said $225 for the first 3 months).
  - The change-pricing block changes to "3 free content publishes per month, then $3 per publish", replacing the quarterly small-change and new-page extras.
  - All pricing copy follows it.

### 3.2 Dashboard home

The home screen is driven by state and shows one primary "next action" card. It is computed from `(subscription, project, domain, refund_request)`:

| Condition | Card |
|---|---|
| No confirmed payment | Dashboard in preview: banner with the pay button, every feature readable and marked locked |
| Onboarding in progress | "Continue setup" + step progress + refund notice if eligible |
| Submitted / building | "Your website is being built. First preview within 48 hours." + progress list |
| Preview ready | "Your website is ready to review" → View · Approve · Request changes (rounds left) |
| Revisions in progress | "We're making your changes" |
| Approved, domain not active | "Connect your domain" |
| Domain active, not launched | "Launch website" |
| Live | Overview + CMS navigation + allowance meter: "2 of 3 free updates left this month · resets Oct 12" |
| Subscription pending | Banner: "Your payment didn't go through. Update your card." |
| Subscription halted/cancelled past paid period | "Your website is offline. Your content is safe." → Reactivate |

## 4. Data model

**Conventions.**
- SQL table names are plural (`users`, `businesses`, `leads`), because `user` is a reserved word in PostgreSQL. This spec names entities in the singular.
- UUIDv7 primary keys, generated in the app. The exception is auth tables, whose text IDs come from the auth library.
- `timestamptz` for all times, stored in UTC.
- Money in integer cents with an explicit currency.
- Emails and hostnames are stored lowercase, normalised in application code. Better Auth already lowercases account emails, so no `citext` extension is needed.
- **Every tenant-owned table has a non-null `business_id`**, even where it could be derived through joins.
- Soft delete (`deleted_at`) only for items a customer removes. There are no hard deletes in application code.

### 4.1 Sales and identity

**`lead`**
- Contact: id, name, business_name, email, phone, has_domain (`yes` | `no` | `not_sure`), message.
- Pipeline: status (`new` | `call_booked` | `call_done` | `agreed` | `invite_sent` | `account_created` | `paid` | `lost` | `refunded`), notes, owner_staff_id.
- Links and timestamps: business_id (set once converted), created_at, updated_at.

**`setup_invite`**
- id, lead_id, business_id, email, token_hash (SHA-256 of a 32-byte random token), expires_at (created + 7 days), redeemed_at, revoked_at, created_by_staff_id, created_at.
- Resending revokes any open invite and creates a new one.

**`user`** (plus Better Auth's session, account and verification tables): id, email (unique), name, email_verified_at, created_at.

**`business`**: id, slug (unique), name, lead_id, created_at. **Business = tenant.**

**`business_member`**: business_id, user_id, role (`owner` | `editor`), created_at. Unique (business_id, user_id).

**`staff_member`**: user_id (PK), role (`admin` | `builder` | `support`), active, created_at. This is a separate table from customer membership.

**`audit_log`**: id, actor_type (`user` | `staff` | `system`), actor_id, business_id, action, target_type, target_id, metadata, ip, created_at.

### 4.2 Billing

**`plan`**: id, code, name, currency (`USD`), initial_amount_cents (7500 since migration 0021; was 22500), initial_term_months (1; was 3), recurring_amount_cents (7500), interval (`month`), provider_plan_id, page_limit (6), included_publishes_per_month (3), extra_publish_amount_cents (300), active.

**`billing_customer`**: business_id (unique), provider (`razorpay` | `fake`), provider_customer_id (unique per provider).

**`subscription`**
- Identity: id, business_id, plan_id, provider, provider_subscription_id (unique per provider).
- Provider state: provider_status (raw), status (`incomplete` | `active` | `past_due` | `inactive` | `cancelled`).
- Dates:
  - activated_at (first payment confirmed), commitment_ends_at, current_period_end.
  - `paid_through_at`: the end of the period the customer has paid for.
  - cancel_requested_at, cancelled_at, last_synced_at.
- Rule: one non-cancelled subscription per business (partial unique index).

**`payment`**: id, business_id, subscription_id, provider_payment_id (unique), kind (`initial` | `renewal` | `reactivation` | `extra_publish`), provider_order_id, amount_cents, currency, status (`captured` | `failed` | `refunded`), paid_at, failure_reason, created_at.

**`refund_request`**
- Request: id, business_id, payment_id, status (`requested` | `withdrawn` | `refunded`), reason, requested_by_user_id, requested_at.
- Resolution: resolved_by_staff_id, resolved_at, provider_refund_id, amount_cents.

**`payment_event`**: provider, event_id (PK with provider), type, payload, received_at, processed_at, attempts, last_error. This is the webhook inbox and makes processing idempotent.

### 4.3 Project and revisions

**`project`**
- Identity: id, business_id, kind (`initial_build` | `redesign`), status (see §5.3), assigned_staff_id.
- Build timing: onboarding_submitted_at, sla_due_at, on_hold_reason.
- Review: preview_release_id, approved_release_id, approved_by_user_id, approved_at.
- Rounds: revision_rounds_included (2), revision_rounds_granted (0).
- Launch: launched_at, created_at.
- Rule: one open project per business (partial unique index).

**`onboarding_progress`**: project_id, business_id, step (`business` | `content` | `brand` | `domain` | `review`), completed_at, updated_at.

**`project_brief`**: project_id, business_id, notes_for_builder, style_likes, reference_urls.

**`project_event`**: id, project_id, business_id, type, actor_type, actor_id, data, created_at. Powers the timeline and SLA history.

**`revision_round`**: id, project_id, business_id, round_number, release_id (the preview reviewed), status (`submitted` | `in_progress` | `completed`), is_granted_extra, submitted_by_user_id, submitted_at, completed_at.

**`revision_item`**: id, round_id, business_id, category (`text` | `image` | `layout` | `business_info` | `other`), page_id, description, media_ids, status (`pending` | `in_progress` | `completed` | `out_of_scope`), staff_note.

### 4.4 Website and content

**`website`**: id, business_id (unique), template_key, template_version, theme (staff-only tokens), live_release_id, blog_enabled (default false), suspended_at, suspended_reason.

**`page`**: id, business_id, website_id, key (`home` | `about` | `services` | `gallery` | `reviews` | `contact`), slug, nav_label, title, seo_title, seo_description, position. Only staff create or remove pages; `plan.page_limit` is enforced on the server.

**`page_section`**: id, business_id, page_id, type, variant, position, schema_version, content (jsonb), visible.

**Profile and contact details**
- **`business_profile`**: business_id (PK), display_name, tagline, description, phone, email, address_line1, address_line2, city, region, postal_code, country, service_areas, timezone, google_business_url.
- **`business_hours`**: business_id, day_of_week, opens_at, closes_at, closed. Supports split shifts via multiple rows.
- **`special_hours`**: business_id, date, opens_at, closes_at, closed, label.
- **`social_link`**: id, business_id, platform, url, position.

**Collections**
- **`service`**: id, business_id, name, slug, summary, body (rich-text JSON), image_media_id, price_mode (`none` | `fixed` | `from` | `range` | `text`), price_min_cents, price_max_cents, price_text, cta_type (`none` | `call` | `contact` | `link`), cta_label, cta_url, position, published, deleted_at.
- **`testimonial`**: id, business_id, author_name, author_context, quote, rating, source, source_url, received_on, position, published, genuine_attested_at, deleted_at.
- **`gallery_item`**: id, business_id, media_id, caption, position, deleted_at.
- **`blog_post`**: id, business_id, title, slug, excerpt, body (rich-text JSON), cover_media_id, status (`draft` | `published`), published_at, seo_title, seo_description, deleted_at. Unique (business_id, slug).
- **`media_asset`**: id, business_id, storage_key, original_filename, mime_type, bytes, width, height, placeholder, alt_text, sha256, status (`uploading` | `processing` | `ready` | `rejected`), rejection_reason, uploaded_by_user_id, created_at, deleted_at.

**`site_release`**: id, business_id, website_id, number, purpose (`preview` | `production`), snapshot (jsonb render model), schema_version, content_hash, created_by_type, created_by_id, created_at. **Immutable**: no updates, ever.

**`content_publish`**: one row per customer or staff publish after launch.
- Identity: id, business_id, target (`site` | `blog_post`), site_release_id, blog_post_id, action (`publish` | `unpublish` | `rollback`).
- Allowance: allowance_period_start, charge_type (`included` | `paid_extra` | `exempt` | `staff`).
- Status: `awaiting_payment` | `published` | `expired` | `failed`.
- Payment: provider_order_id (unique when set), payment_id.
- Timestamps: requested_by_user_id, requested_at, published_at.

**`publish_allowance_grant`**: id, business_id, allowance_period_start, extra_free_publishes, reason, granted_by_staff_id, created_at. Staff use it to add free publishes for one period; every grant is audit-logged.

### 4.5 Domains and operations

**`domain`**
- Identity: id, business_id, website_id, hostname (unique among rows where removed_at is null), is_primary.
- State: status (see §5.5), required_records (from the provider, never hardcoded), verification_token.
- Checks: last_checked_at, last_check_result, tls_status, provider_ref.
- Timestamps: verified_at, connected_at, last_healthy_at, removed_at.

**`form_submission`**: id, business_id, page_id, name, email, phone, message, fields, spam_score, status (`new` | `read` | `archived`), created_at.

**`email_log`**: id, business_id, to_address, template, subject, html, text, transport, provider_message_id, status, created_at.

**`support_ticket`** / **`support_message`**: added in Phase 7.

### 4.6 Relationships

```
lead ──> setup_invite ──> business
user ──< business_member >── business (TENANT)
staff_member ── user
business ├── billing_customer
         ├──< subscription ──< payment ──< refund_request
         ├──< project ──< project_event, onboarding_progress, project_brief
         │        └──< revision_round ──< revision_item
         ├── website ──< page ──< page_section
         │        ├──< site_release
         │        └──< domain
         ├── business_profile, business_hours, special_hours, social_link
         └──< service, testimonial, gallery_item, blog_post, media_asset, form_submission
```

## 5. Lifecycles

Each lifecycle is a pure transition function in `packages/domain` with an explicit allowed-transition table. An illegal transition throws `InvalidTransitionError(entity, from, to)`.

### 5.1 Lead

`new → call_booked → call_done → agreed → invite_sent → account_created → paid`. It can also go to `lost` from any pre-paid state, and to `refunded` after a refund.

- Staff set `call_booked`, `call_done`, `agreed` and `lost` manually.
- The system sets `invite_sent`, `account_created`, `paid` and `refunded`.

### 5.2 Subscription (Razorpay)

**Creating the subscription** happens when the customer clicks "Continue to payment":
- Plan: $75/month USD, or ₹3,500/month INR.
- No add-on and no delayed start (changed 2026-09-16): the first charge is the first month at the plan price, and
  the subscription renews monthly from the first payment. (Earlier: a $225 add-on and `start_at` 3 months out.)
- `total_count`: 120 monthly cycles. The worker alerts staff 90 days before the last cycle.
- If an unpaid subscription created in the last 24 hours exists, reuse it. Otherwise cancel the stale one and create a new one.

**Status mapping** (`packages/billing`, pure function):

| Razorpay status | Fynix status | Notes |
|---|---|---|
| `created` | `incomplete` | Awaiting first payment |
| `authenticated` | `active` | First month paid; renews monthly |
| `active` | `active` | |
| `pending` | `past_due` | Razorpay retrying; site offline once `paid_through_at` has passed |
| `halted` | `inactive` | Retries exhausted; site offline |
| `paused` | `inactive` | |
| `cancelled`, `completed`, `expired` | `cancelled` | Online until `paid_through_at` |

**Setting `paid_through_at`:**
- The initial payment sets it to `start_at`.
- Each successful renewal sets it to the end of that billing cycle.
- A refund sets it to the refund time.

**Billing access** (pure function):

```
hasBillingAccess(sub, now) =
     sub.status ∈ {active, past_due, cancelled}
  ∧ now < sub.paid_through_at
```

(As built in `packages/billing/src/access.ts`. A renewal that fails leaves `paid_through_at` in the past, so the site
goes offline at once; `incomplete` and `inactive` never have access.)

**Payment confirmation:**
1. Razorpay Checkout returns `razorpay_payment_id`, `razorpay_subscription_id` and `razorpay_signature`.
2. The server verifies HMAC-SHA256(`payment_id|subscription_id`, key_secret). If valid, it records the payment and unlocks the wall immediately.
3. The webhook later reconciles the same payment idempotently.

**Webhooks:**
1. Verify `X-Razorpay-Signature` (HMAC-SHA256 of the raw body with the webhook secret).
2. Insert into `payment_event`; duplicate event IDs are ignored.
3. Return 200.
4. A job processes the event: **fetch the subscription from the Razorpay API** (never trust event order), update `subscription` and `payment`, update lead status, and invalidate the tenant access cache.

Handled events: `subscription.authenticated`, `.activated`, `.charged`, `.pending`, `.halted`, `.cancelled`, `.paused`, `.resumed`, `.completed`, `payment.failed`, `refund.processed`, `refund.failed`, and `order.paid` (extra publish payments).

**Scheduled jobs:**
- **Nightly reconciliation:** fetch every non-cancelled subscription from Razorpay and correct any drift.
- **Every 15 minutes:** invalidate the access cache for cancelled subscriptions whose `paid_through_at` has just passed.

**Safety brake:** if one reconciliation run would move more than 10 sites or 5% of live sites to offline, apply none of those changes and alert staff. If Razorpay or the database is unreachable, keep the last known state. **Never take a site offline because Fynix is failing.**

**Local testing:** `FakeBillingProvider` implements the same interface. It has a fake checkout page (Pay / Decline), and an admin "Billing simulator" emits the same normalised events: renewal charged, charge failed (`pending`), retries exhausted (`halted`), card updated (`active`), cancelled, refund processed, one-time payment paid, and one-time payment failed.

### 5.3 Project

| From | To | Actor | Guard |
|---|---|---|---|
| (created at payment) | `onboarding` | system | Payment confirmed |
| `onboarding` | `submitted` | customer | Required checklist passes on the server, including a domain; no open refund request. Sets `sla_due_at`; locks onboarding data. Happens together with the first payment (decided 2026-09-16). Refund eligibility now ends at `building`, not here |
| `submitted` | `building` | staff | Assigned builder |
| `building` | `preview` | staff | Creates a preview `site_release`; sets `preview_release_id` |
| `preview` | `revisions` | customer | Rounds used < included + granted; ≥ 1 item |
| `revisions` | `preview` | staff | All items `completed` or `out_of_scope`; creates a new preview release |
| `preview` | `approved` | customer | Sets `approved_release_id` = current preview release |
| `approved` | `live` | customer/system | `hasBillingAccess`, domain `active`; sets `website.live_release_id` |
| `submitted`, `building`, `revisions` | `on_hold` / back | staff | Reason required; pauses the SLA |
| any pre-`live` | `cancelled` | system | Subscription cancelled or refunded |

- **Rounds:** `rounds_used = count(revision_round)`. The "Request changes" button is available while `rounds_used < revision_rounds_included + revision_rounds_granted`. The staff action "Allow an extra round" increments `revision_rounds_granted` and writes an audit entry.
- **Onboarding lock:** after submission, onboarding data is read-only for the customer. Changes during the build go in a "note to your builder".

### 5.4 Website visibility (derived, never stored)

```
isPubliclyVisible(host, now) =
     domain(host).status = active
  ∧ website.live_release_id ≠ null
  ∧ website.suspended_at = null
  ∧ hasBillingAccess(subscription, now)
```

When not visible, a known host shows the Fynix offline page:
- HTTP 503 with `Retry-After`, plus `X-Robots-Tag: noindex`.
- Copy: "This website is temporarily unavailable" and the business phone number if present.
- The site's contact form is disabled.

An unknown host returns 404. Reactivation writes only to `subscription`; the site returns with no website writes.

### 5.5 Domain

| From | To | Trigger |
|---|---|---|
| (onboarding) | `pending` | Customer enters the domain they own |
| `pending` | `awaiting_dns` | Project approved; provider registration returns `required_records` |
| `awaiting_dns` / `misconfigured` | `verifying` | "Check connection" or scheduled check (rate-limited, backoff) |
| `verifying` | `misconfigured` | Records wrong; show what was found versus what's expected |
| `verifying` | `active` | DNS correct and TLS issued |
| `active` | `degraded` → `active` | Daily health check fails, then recovers |

- Apex and `www` are separate rows; one is primary and the other redirects to it with a 308.
- If the hostname is claimed by another business, require TXT verification.
- Instructions only touch A and `www` CNAME records. They state explicitly: do not change nameservers or MX (email) records.
- On the DNS screen, "Launch automatically once connected" is pre-ticked.
- The admin view "Approved, waiting on DNS" shows days waiting; customers get a reminder every 3 days.

### 5.6 Refund request

**Eligibility** (pure function) requires all of:
- The payment kind is `initial`.
- `now − payment.paid_at < 7 days`.
- The project status is `onboarding`.
- The business has no `refund_request` with status `refunded`.
- There is no open (`requested`) refund request.

**Flow:**
1. The customer requests a refund, with an optional reason.
2. The dashboard shows "Refund requested. We'll contact you within 1 business day." Onboarding submission is blocked while the request is open.
3. Staff either:
   - **Withdraw** it (the customer stays; they may request again while eligible), or
   - **Issue refund**: provider refund of the initial payment → cancel the subscription immediately → `paid_through_at = now` → project `cancelled` → lead `refunded` → account returns to the payment wall.

The eligibility window is judged at `requested_at`, not at processing time.

### 5.7 Content publishing allowance (after launch)

**Allowance period.** Monthly, anchored to the day of `subscription.activated_at`. A day beyond the end of a shorter month clamps to that month's last day; for example, an activation on the 31st gives a period starting Feb 28 or 29. It's computed by the pure function `allowancePeriod(activatedAt, now) → { start, end }`.

**What is one publish.**
- One click of **Publish changes** for the site (creates a production `site_release`), or **Publish** / **Update** on a blog post.
- A publish can contain any number of edits.
- Saving drafts never counts.

**Charge type** (pure function `classifyPublish`):

| Action | Charge type |
|---|---|
| Staff publish (any) | `staff`, never counts |
| Rollback to an earlier release | `exempt` |
| Unpublish a blog post | `exempt` |
| Site publish or blog publish/update by customer, within allowance | `included` |
| Same, allowance used up | `paid_extra` ($3) |

**What customers can publish.** Only changes to customer-editable text fields, image slots, gallery photos and blog posts. The server rejects any other change with `FieldNotEditableError`, regardless of what the UI sends.

**Everything else goes through support.** The customer submits a support request for services, testimonials, business details, pages, SEO or design. Staff make the change and publish it with charge type `staff`, which never counts toward the allowance.

**Allowance check.**

```
remaining = plan.included_publishes_per_month
          + sum(publish_allowance_grant.extra_free_publishes for period)
          − count(content_publish where charge_type = included
                                    ∧ status = published
                                    ∧ allowance_period_start = period.start)
```

**Publish flow.**
1. Guards: the project is `live`, `hasBillingAccess` is true, and there is a change to publish.
2. If `remaining > 0`: publish in one transaction and record `included`.
3. Otherwise the action returns `PublishPaymentRequiredError`. The UI asks: *"You've used your 3 free updates this month. Publish this update for $3?"*
   1. Create a `content_publish` row (`awaiting_payment`) and a $3 one-time Razorpay order.
   2. Checkout returns a signature. The server verifies it, records the `payment` (kind `extra_publish`), and publishes the **current** working copy. The row moves to `published` / `paid_extra`.
   3. If the publish step fails after payment, the `order.paid` webhook job retries it. The `awaiting_payment → published` transition is guarded and `provider_order_id` is unique, so a paid publish happens exactly once and is never charged twice.
   4. If the publish still can't complete after the retries, the row becomes `failed`, staff are alerted, and staff refund the $3.
4. Rows still `awaiting_payment` after 1 hour become `expired`.

**Other rules.**
- Extra publish payments are not refundable, except in the failure case in step 3.4.
- Unused free publishes don't roll over.
- Customers see an allowance meter: "2 of 3 free updates left this month · resets Oct 12".
- Staff can **Grant free update** for the current period. It's audit-logged.

## 6. Content model and design control

- **Section registry** (`packages/content`): each section type declares a zod schema with per-field `editableBy: 'customer' | 'staff'`, max lengths, required fields and image aspect ratios.
- **Customer edits** go through `updateSectionContent(ctx, sectionId, patch)`, which:
  1. loads the section scoped to `ctx.businessId`;
  2. rejects any staff-only field in the patch (`FieldNotEditableError`);
  3. validates against the schema.
- **Customers can edit only:**
  - text fields marked `editableBy: 'customer'` in existing sections;
  - image slots marked `editableBy: 'customer'` (replace only);
  - gallery photos (add, remove, reorder, caption);
  - blog posts.
- **Customers cannot:**
  - create or delete pages; add, remove or reorder sections; change variants or theme;
  - edit services, testimonials, business details, navigation or SEO settings;
  - submit HTML, CSS or scripts.
  - These are enforced on the server. The CMS shows those areas read-only, with a "Request a change" link to support.
- **Rich text** is a restricted JSON document: paragraph, heading levels 2–3, bold, italic, link, bulleted and numbered lists. Links must be `http(s)`, `mailto:` or `tel:`. It is rendered by Fynix components, never as raw HTML.
- **Releases:** `buildReleaseSnapshot(websiteId)` resolves pages, sections, business profile, hours, special hours, social links, services, testimonials and gallery into one validated render model.
  - **Blog posts** are not in the snapshot; they are read from published `blog_post` rows with per-tenant cache tags.
- **After launch, editing is autosave to the working tables** plus one **Publish changes** button, which creates a production release and moves `live_release_id`.
  - Every customer publish goes through the allowance check in §5.7.
  - **Roll back** points `live_release_id` at an earlier release; it is free.
- **Media:**
  1. Uploads go through the `MediaStorage` interface. Allowlist: JPEG, PNG, WebP (HEIC deferred until conversion exists). SVG only via staff. Max 8 MB per request, sent to a dedicated upload route rather than a server action, after the browser has shrunk the image (changed 2026-09-16 after the Phase 2 security review).
  2. A worker job checks the real file type, converts HEIC, **strips EXIF including GPS**, generates responsive variants and a placeholder, then marks the asset `ready`.
  3. Storage keys are `t/{business_id}/{media_id}/{variant}`; original filenames are never used in paths.
- **Alt text** is required before an image can appear on a published page.
- **Testimonials** require the customer to confirm they are genuine.

## 7. Authentication and authorization

- **Customers:** Better Auth email and password, sessions stored in Postgres, host-only cookies on the app host.
  - An account is created **only** by redeeming a valid setup invite. There is no public registration endpoint.
  - The invite email is fixed, not editable.
- **Staff:** use the same identity system, but the admin host requires an active `staff_member` row and uses its own host-only session cookie.
  - The first staff account is created with a CLI seed command.
  - Production requires 2FA for staff.
- **Tenant context:** `requireTenantContext()` resolves `{ userId, businessId, role }` on the server from the session and `business_member`.
  - Tenant data-access functions accept only this context type, never a raw `businessId`.
  - Every lookup filters by both `id` and `ctx.businessId`.
- **Payment wall:** `requireBillingAccess()` guards every mutating customer action except payment, refund request, support and logout. Pages are readable without it (decided 2026-09-16), so the guard sits on the actions, never on routing.
  - It redirects to `/pay` when the business has no `payment` of kind `initial` with status `captured`.
  - A refunded initial payment has status `refunded`, so the wall returns after a refund.
  - Later billing problems (`past_due`, `inactive`, `cancelled`) never trigger the wall. The customer keeps dashboard access and sees the reactivate state instead.
- **Row-level security:** enabled on every tenant table.
  - The app runtime connects as `fynix_app` (not a superuser, not the table owner, no BYPASSRLS).
  - Each request transaction runs `SET LOCAL app.business_id`.
  - Migrations run as the owner role.
  - The renderer uses `fynix_platform_branch`, which has read-only access to published data.
  - Staff and worker operations use `fynix_staff`, and every staff read or write of tenant data is audit-logged.
  - Tenant policies must check both `business_id = app_current_business_id()` and membership of the current user. They never rely on the setting alone.
  - **Threat model:**
    - RLS guards against query mistakes, not against code running as `fynix_app`. That role can call `set_config` itself.
    - It also reads and writes the auth tables, including staff sessions and password hashes.
    - Before production, give staff auth its own connection, or move session-token lookups behind SECURITY DEFINER functions.
  - Application roles cannot create objects in `public` (`REVOKE CREATE ON SCHEMA public FROM PUBLIC`). RLS helper functions reference `pg_catalog` explicitly.
- **Before staff 2FA or production (from the Phase 1A security review):**
  - **Bind each session to the surface it was created on**, and require `staff` in the staff access check. Today host-only cookies separate the panels only inside the browser. A token copied from `app.` is accepted on `admin.`, so 2FA added only to the admin login could be bypassed.
  - **Deploy only on Vercel, or behind a proxy that overwrites `X-Forwarded-For`.** `next start` keeps a client-supplied value, which would let an attacker rotate IPs past the sign-in rate limits.
  - **Operational items:**
    - Add a scheduled cleanup of old `rate_limit_buckets` rows.
    - Use a pooled connection string with small pool sizes.
    - Revoke a previous session when a different user signs in on the same browser.
    - Before mounting Better Auth's HTTP handler (for Google sign-in), set `disabledPaths` for sign-up, email change, password change and account deletion routes.
  - **From the Phase 1B security review:**
    - `fynix_public` can read and delete every `rate_limit_buckets` row, so a flaw on the public form could reset its own throttle. Scope that grant, or move stale-window cleanup to an owner-run job.
    - `email_messages` stores full message bodies, including live setup links, and every staff member can read them. Before real email: redact the token, add retention, and narrow staff access to the bodies.
    - `REVOKE TEMPORARY ON DATABASE … FROM PUBLIC` for consistency with the `public` schema hardening.
- **Server actions:** every action re-checks the session, validates input with zod, and checks the transition guard.
- **Preview:** `app.` host `/preview/{projectId}/[[...path]]` requires membership or staff. Responses carry `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`.
- **Rate limits:** login, invite redemption, lead form, refund request, contact forms and domain checks.
- **Secrets:** only in `.env.local`, never committed. `.env.example` lists names only.

## 8. Multi-tenant routing and caching

```
Request to apps/sites
 → proxy.ts: normalise host (lowercase, strip port, strip trailing dot); rewrite to /site/[host]/[[...path]]
   (not /_site: an underscore folder is private in the App Router and is never routed)
   (no database access in proxy)
 → resolveHost(host)            cache tag host:{hostname}
      unknown → 404; non-primary → 308 to primary
 → getVisibility(businessId)    cache tag tenant:{businessId}:access; max age 5 minutes
      not visible → offline page (503)
 → getRelease(liveReleaseId)    cached indefinitely (immutable)
 → render templates
```

- **Invalidated by:** publish, subscription change, refund, domain change, suspension, and the `paid_through_at` sweep.
- **Per-tenant generated files:** `sitemap.xml`, `robots.txt`, favicon, social image, and LocalBusiness JSON-LD built from structured profile and hours.
- **Contact forms** post to the tenant host. The server derives `business_id` from the hostname, never from form fields.
  - Spam protection, then store, then an email job.

## 9. Background jobs (pg-boss, `apps/worker`)

| Job | Schedule / trigger |
|---|---|
| `process-payment-event` | On webhook insert; retries with backoff |
| `billing-reconcile` | Nightly |
| `paid-through-sweep` | Every 15 minutes |
| `send-email` | On demand |
| `complete-paid-publish` | On `order.paid` webhook; retries with backoff, then marks the publish `failed` and alerts staff |
| `expire-publish-payments` | Every 15 minutes: `awaiting_payment` publishes older than 1 hour become `expired` |
| `invite-reminders` | Unpaid invites at 1, 3, 6 days after sending |
| `onboarding-reminders` | Paid but not submitted at 1, 3, 7 days |
| `renewal-reminders` | 3 days before each monthly renewal: amount, date, and that the site goes offline at once if the payment fails (promised on the marketing site, 2026-09-16) |
| `renewal-receipts` | After each successful renewal: the invoice |
| `media-process` | On upload (Phase 2) |
| `domain-check` / `domain-health` | Backoff while awaiting DNS; daily when active (Phase 6) |
| `subscription-cycle-alert` | Monthly check for subscriptions within 90 days of `total_count` |

## 10. Error handling

- **Expected failures are typed domain errors:**
  - `InvalidTransitionError`
  - `TenantAccessDeniedError`
  - `PaymentRequiredError`
  - `RefundNotEligibleError`
  - `RevisionLimitReachedError`
  - `FieldNotEditableError`
  - `InviteInvalidError` (expired, revoked or used)
  - `DomainClaimConflictError`
  - `PublishPaymentRequiredError`
- **Server actions return a discriminated result** (`{ ok: true, data } | { ok: false, code, message }`) for expected failures. They show plain-English copy and never leak internals.
- **Unexpected errors are logged** with request ID and business ID, and the user sees a generic message.
- **Webhooks return 2xx only after the durable insert.** Processing failures stay in `payment_event` with `attempts` and `last_error`, and are visible in admin.
- **Emails never block the user flow.** They are always queued.

## 11. Testing strategy

- **Unit tests (Vitest), written first:**
  - every transition table;
  - `hasBillingAccess`, `isPubliclyVisible`, refund eligibility and the revision-round limit;
  - Razorpay status mapping and signature verification;
  - `allowancePeriod` (including month-end clamping), `classifyPublish` and remaining-allowance calculation with grants;
  - section field-permission enforcement;
  - release snapshot building.
- **Integration tests** against a separate local database `fynix_platform_test`:
  - RLS isolation: business A cannot read or write business B through any data-access function;
  - webhook idempotency (duplicate event IDs);
  - invite redemption (expired, revoked, reused);
  - the payment wall on every protected route;
  - the safety brake;
  - paid publish: payment succeeds but the publish step fails → completed from the webhook exactly once, never charged twice; allowance counters under concurrent publishes.
- **End-to-end tests (Playwright)** with `BILLING_PROVIDER=fake` and `EMAIL_TRANSPORT=outbox`:
  - lead → invite → set password → pay → onboarding → submit;
  - refund request;
  - staff preview → revisions ×2 → approve;
  - halted → offline → pay → online.

## 12. Implementation phases

1. **Foundation and sales funnel**, delivered as three plans. Each is built and verified before the next is written.
   - **1A Foundation:** workspace restructure; database, roles, RLS and migrations; auth; host routing; staff seed; admin and customer sign-in shells.
   - **1B Sales funnel:** marketing CTA and pricing copy; `/get-started` lead form + Calendly; admin Leads; setup invites; email outbox + Dev Outbox; invite redemption.
   - **1C Payments:** plans; payment wall with the fake billing provider, then the Razorpay test adapter; webhooks inbox and worker; welcome screen; refund requests.
2. **Onboarding:** business info, pages, services, media uploads, domain entry, review and submit.
3. **Admin project management:** queue sorted by SLA, project detail, assignment, on hold, timeline, audit log.
4. **Rendering:** section registry, first template, release snapshots, `apps/sites` host routing, offline page, preview route.
5. **Revisions and approval:** rounds, items, extra-round grants, approval bound to the release.
6. **Domains and launch:** domain provider adapter, DNS instructions, verification, auto-launch.
7. **Customer CMS:** text and image editing, gallery photos, customer-written blog, publish changes, rollback, monthly publish allowance with $3 paid publishes, support requests for everything else, and form submissions.
8. **Subscription lifecycle hardening:** reconciliation, paid-through sweep, safety brake, reactivation UX, card update.
9. **Polish:** responsive pass, loading, empty and error states, accessibility audit (WCAG 2.2 AA).

## 13. Local development

- **Database:** the local PostgreSQL 14 database `fynix` is the development DB. It was verified reachable on `localhost:5432` as the local superuser with no password, and was empty on 2026-09-15.
  - Create `fynix_platform_test` for integration tests.
  - `pnpm env:init` writes `.env.local` with generated passwords.
  - `pnpm db:roles`, run over the superuser connection, creates `fynix_app` and `fynix_staff`. Locally, migrations run as the superuser, which owns the tables. `fynix_platform_branch` arrives with the renderer in Phase 4.
  - UUIDv7 IDs are generated in the app, because PostgreSQL 14 has no built-in generator.
- **`.env.local` (`apps/web`):**
  - `DATABASE_URL`, `DATABASE_URL_OWNER`
  - `BETTER_AUTH_SECRET`
  - `BILLING_PROVIDER=fake`
  - `EMAIL_TRANSPORT=outbox`
  - `NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/steve-fynix/30min`
  - Razorpay test keys and the webhook secret when switching `BILLING_PROVIDER=razorpay`.
- **Hosts:** `localhost:3000` (marketing), `app.localhost:3000`, `admin.localhost:3000`, and tenant sites on `:3001` via `*.localhost` or `/etc/hosts` test domains.
- **Razorpay webhooks locally** need a tunnel (e.g. `cloudflared`) only when testing the real Razorpay adapter.

## 14. Risks and later decisions

**Risks carried forward**
- Razorpay must enable international, USD and recurring payments on international cards for the live account.
- US cardholders may pay foreign transaction fees.
- Cross-border renewals decline more often.
- Razorpay's retry duration is undocumented; measure it in test mode.

**Later decisions, with defaults to confirm before their phase**

| Decision | Default until confirmed | Phase |
|---|---|---|
| Does the 48-hour window count weekends? | Weekdays only, US Eastern | 3 |
| Returning after cancellation: price and commitment | $75/month from reactivation, no new upfront | 8 |
| Customer deletion requests (privacy law) | Staff delete on verified owner request; otherwise never delete | 8 |
| Domain/TLS provider | Vercel Domains API | 6 |
| Analytics provider | Privacy-friendly hosted analytics with a per-site API; never raw page views in Postgres | 7 |
| Tenant template visual design | Designed with the user's references before build | 4 |
| Google sign-in for customers | After local testing | After 1 |
