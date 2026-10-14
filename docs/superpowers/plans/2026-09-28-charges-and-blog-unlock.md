# Charges (paid extras) and Blog Post Unlock — Spec and Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer pay for one-off extras (change hours, extra publishes, blog-post blocks, anything custom)
from the Billing page, with staff able to add, mark paid and waive them from the staff console, and make the 100
included blog posts a real limit that the customer unlocks by paying for the next block.

**Decisions (user, 2026-09-28):**
- Extras are **one-off charges beside the monthly plan**; the plan's subscription is never touched.
- Customers **pay online** (Razorpay one-time payment); staff can also **mark a charge paid** (bank transfer) or
  **waive** it.
- Staff add charges from the client's page in the staff console; no toggles.
- Blog posts: at the included limit, the customer **must pay for the next block before creating another post**.
- Appointments stay free and are out of scope. Monthly add-ons are out of scope (none exist).

**Defaults (stated to the user, not objected to):** every post counts toward the limit, drafts included;
deleting a post frees a slot; a bought block adds `blog_post_block_size` posts permanently.

**Architecture:** A new `charges` table holds what a business owes (kind, description, quantity, net unit price,
tax rate, the gross amount, status open → paid | waived). Paying creates a `payments` row of a new kind `charge`
(no subscription) and marks the charge paid in the same transaction, so a paid charge always has exactly one
receipt. Online payment is a Razorpay **Order** (one-time), confirmed only by the signed `order.paid` webhook, the
same "webhook is the only trusted source" rule as the plan. The fake provider mirrors it with a signed token and a
test confirm page. Blog allowance = plan's included posts + block size × blocks paid for; the create action checks it
server-side.

## Data

Migration 0048 (+ grants in the same file):
- `payment_kind` gains `charge`.
- enums `charge_kind` (`change_hours`, `blog_posts`, `extra_publish`, `custom`) and `charge_status`
  (`open`, `paid`, `waived`).
- `charges`: `id`, `business_id`, `kind`, `description` (1–200, trimmed), `quantity` (≥1), `unit_amount_cents`
  (net, ≥1), `tax_rate_basis_points` (≥0), `amount_cents` (gross, what is charged), `currency`, `status`,
  `created_by_staff_id` (null = created by the system, e.g. a blog unlock), `provider` + `provider_order_id` (the
  open online payment attempt; unique), `payment_id` (unique, set when paid), `paid_at`, `waived_at`,
  `waived_by_staff_id`, `created_at`.
  Checks: status/payment/waived columns agree; one open `blog_posts` charge per business (partial unique index).
- RLS: customer (`webfold_app`) SELECT own rows only; staff all. Customers never write: every write goes through a
  server path using the staff connection after its own access check.

## Flows

1. **Staff add** (admin client page → Extras): kind, quantity, description (prefilled per kind), unit price
   prefilled from the client's plan (editable only for `custom`). Tax = the plan's tax rate.
2. **Customer pays** (Billing → To pay → Pay): `/billing/charges/{id}/pay` starts a provider payment for that open
   charge (Razorpay: creates an Order, stores its id, opens Checkout; fake: redirects to a signed test page).
   The Razorpay `order.paid` webhook (or the fake confirm) records the payment and marks the charge paid, under the
   business lock, checking amount and currency; a payment for a charge that is no longer open is recorded and
   flagged `already_paid`, a wrong amount `amount_mismatch`.
3. **Staff mark paid**: reference + received date → a `manual` payment of kind `charge`.
4. **Staff waive**: open → waived.
5. **Blog unlock**: at the limit the blog list shows "Unlock N more posts – ₹X" instead of New post; the action finds
   or creates the open `blog_posts` charge and sends the customer to pay it. `createBlogPostAction` refuses past the
   allowance.

## Tasks

- [ ] 1. Pure: `chargePricing(kind, plan)` (unit price, default description), `chargeAmounts(unit, qty, rate)`,
  `blogAllowance(plan, paidBlocks)`; tests.
- [ ] 2. DB: schema + migration 0048 + queries (`insertCharge`, `listChargesForBusiness`, `findChargeById`,
  `findOpenBlogPostsCharge`, `setChargeProviderOrder`, `findChargeByProviderOrder`, `recordChargePayment`,
  `waiveCharge`, `countPaidBlogBlocks`); receipts join the charge's description and tax; integration tests.
- [ ] 3. Billing package: `startChargePayment` / `confirmChargePayment` on both providers; Razorpay Orders client;
  `order.paid` webhook parsing; tests.
- [ ] 4. Platform: charge payment service (confirm path + webhook handler branch), pay page, fake confirm page,
  callback; tests.
- [ ] 5. Admin: Extras section, add / mark paid / waive actions; tests.
- [ ] 6. Billing page: To pay section; receipt labels for charges.
- [ ] 7. Blog: allowance check in create action, unlock action, list page UI; tests.
- [ ] 8. Verify: lint, typecheck, tests, integration, build; browser (customer + staff).

**Needed from the user before going live:** enable the `order.paid` event on the Razorpay webhook (test and live).
