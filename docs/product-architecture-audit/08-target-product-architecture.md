# Target product architecture (proposal)

Status: PROPOSAL for owner approval. Principle: unify and wire what already works; do not rewrite secure parts because the UI is weak. What to keep is as important as what to change.

## 1. Keep (verified strong)

- Three database roles with row level security and scoped queries; host-only session cookies per app (`docs/STAFF-ACCESS.md`).
- Idempotent payment recording: unique `(provider, provider_payment_id)`, per-business advisory lock, post-lock re-read, raw-body HMAC check, tax invoice in the same transaction.
- The email outbox (`email_messages`) and its redaction.
- The website project state model and its customer headline mapping (`project-customer-line.ts`).
- The existing design systems and tokens.
- Staff role checks via `requireStaffCan` (needs tests, not replacement).

## 2. Domain boundaries

| Boundary | Owns | Source of truth |
|---|---|---|
| Identity and access | users, sessions, memberships, invites, staff roles | auth tables, `memberships` |
| Catalog and pricing | services, prices, GST, offers | one pricing module (`add-ons.ts`), exposed by `/api/pricing` |
| Billing | subscription, lines, payments, invoices, refunds, lapse | `subscriptions`, `bundled_add_ons`, `payments` |
| Entitlement | which services a business holds and may write to | derived from billing lines only (one function) |
| Service delivery | one lifecycle per service: Website, Social, Paid Ads (Monitoring later) | per-service tables; a single `work item` view for owner, due and state |
| Communication | requests, tickets, notifications, email | tickets, `email_messages`, notification topics |
| Compliance | privacy requests, breaches, closure and erasure | existing tables, with owners and deadlines |

## 3. Canonical entitlement model

Problem: one `social` key stands for two sold products (finding 1 in `00`).

Proposal (smallest safe version, from the domain audit):
1. Add an `ads` service key beside `website`, `social`, `search`. Map `paid-ads` to `ads` in the three places that map add-ons to services (`service-setup.ts`, `billing/rules.ts`, `start/rules.ts`).
2. `/ads` checks `ads`; `/social*` checks `social`; the Paid Ads menu item, its NotBought pitch (Paid Ads, price, `?add=ads`) and the admin campaign gate follow.
3. Keep ads figures in `monthly_snapshots.service = 'social'` for the first release so no migration is needed; later widen the two CHECK constraints and move to `ads`.
4. Use one cancellation rule for all services: the service stays writable until the paid month ends (the Website already works this way).
5. Treat `search` as legacy: keep for old rows, remove from new surfaces, plan its retirement after confirming production data.

Decision needed: whether a bundled website basket should ever imply Social. Recommended answer: no, lines are independent.

## 4. Service lifecycle: setup, delivery, monthly cycle

Separate three states that are currently blurred:

| Layer | Question it answers | Today | Target |
|---|---|---|---|
| Entitlement | Does the customer hold and pay for this service? | billing lines | unchanged, plus `ads` key |
| Setup | What do we need from them before work starts? | website: checklist and kickoff; Social and Ads: `service_setup` answers nobody reads | per-service setup with a visible staff view and an owner |
| Delivery | What is staff working on now, who owns it, what is due? | website project stages; Social deliverables; Ads: nothing | one work item per service with owner, state, due date |
| Monthly cycle | What did we promise this month and was it done? | report job (may be off); Social commitments are not data | per-service monthly commitments recorded as data, report built from them |

## 5. Ownership and queue model

Every customer request or paid obligation becomes a work item with: type, business, service, owner (nullable but shown as Unowned), state, due date, last customer-visible status and audit trail. Existing owner columns (leads, projects, tickets, app errors) are reused; add owner and state to deliverables, change requests, domain moves, privacy requests, closures and account connections. Auto-assignment is a policy decision (see `14`); the minimum is that Unowned is visible on Today and counted in the rail.

Roles proposed: support (reply, work), builder or service owner (cancel build, free rounds, domain changes, live emails), finance (money), admin (staff, compliance). The new role can start as a permission flag on support staff to avoid a schema change if a migration is not wanted.

## 6. Cross-app events

One rule: an action either produces a customer-visible state and a staff-visible state, or it is not finished. The matrix is `11`. Missing events to add: post sent for approval (notify customer), post approved (notify owner), approved preview (Today row), domain move requested (Today row), past due or lapsed (Today row for finance), refund recorded (customer notice), contacted add-on (customer-visible "we have started setting up").

## 7. Billing and payment architecture

- Collapse the two billing code trees into one shared module consumed by webhook and checkout (the `platform/` ported copy and `features/checkout/server`). Do this behind characterization tests, as its own change.
- Reconciliation: extend the first-payment job to ordinary first charges, keep page-load recovery as the second path, record method on recovery.
- Refund: either call the provider and issue a credit note, or label the action "Record a refund made elsewhere" and send the customer notice.
- Self-serve payment method change to replace the staff request loop (gate G7), as a P1.

## 8. Navigation and information architecture

See `09`. Customer: task first (Home, Needs your OK, Messages, Services, Business, Account). Staff: work first (Today, Work lanes, Clients, Inbox, Money, Compliance, System).

## 9. Failure handling and observability

Add per-form error handling through one shared action hook that catches dropped requests; add loading and empty states with route-level `loading.tsx`; scheduled retry for failed emails; webhook replay for Razorpay, Cal.com and OyeChats; rail counts computed only for what the role sees.

## 10. Trade-offs and options not chosen

- Separate Razorpay subscriptions per service were not chosen: one basket, one payment is simpler for small businesses and is what the code and tax invoicing assume.
- A full new CRM or ticketing system was not chosen: reuse the existing tickets and add owner and due where missing.
- Deleting the dormant directory code now was not chosen: `kind = 'listing'` is live, so remove only after a data check.
