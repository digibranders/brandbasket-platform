# Notifications review and implementation (dedicated session)

Owner decision 2026-11-16 (D33): the kickoff call prompt stays a console popup AND also sends an in-app notification, a push notification and an email. This session reviews and designs the whole notification system for both apps, then implements it.

## Scope
1. **Email:** every template in `packages/email` and every email sent from `packages/shared/src/server` and the apps. Audit content, trigger, recipient, links, delivery state, retries, outbox, Brevo setup, missing emails from the journey (`docs/product-architecture-audit/19-end-to-end-user-journey.md`, `evidence/customer-ux/email-deep-links.md`).
2. **In-app notifications:** the customer bell and the console notifications (Today rows, kickoff prompt repeats every 15 minutes today).
3. **Push notifications:** none exist today for the customer app or the console. Decide the mechanism (web push with service worker and VAPID keys, mobile later), opt-in UX, which events, and delivery rules. The owner has one staff account, so console push matters.
4. **Webhooks:** inbound (Razorpay, Cal.com, OyeChats, and the missing social-auto events: post failed, connection expiring, poster ready, auto approved, week lapsed) and outbound (Teams alerts). Signature checks, idempotency, retries, replay, catch-up, visibility in the console.
5. **Kickoff call prompt:** restore the console popup if PRs #196, #200 and #201 removed it. Popup plus in-app notification plus push plus email, one place to act, "Call completed", "They did not join", "Reschedule", 24 hour labelled fallback "Started without call confirmation".

## Method
Phase 1 (read only): inventory every notification, trigger, template, topic, recipient, channel and preference; map them to the journey; list gaps and duplicates; write `docs/notifications/00-inventory.md` and `01-gaps.md`.
Phase 2 (discuss with the owner): propose the target notification matrix (event, who, channels, timing, copy, preference) and ask the owner the open questions through the question tool.
Phase 3 (implement): packages as agreed, worktree per package, tests first, no real email, push or payments in dev (fake or outbox), report per package.

## Rules
Follow `docs/implementation/AGENT-RULES.md` and `MERGE-AND-RELEASE.md`. Never merge to `main`, never deploy, never edit `.env` files, never print secrets, no em or en dashes in any customer or staff text, new wording goes to the owner for approval. Respect customer notification preferences and the privacy and consent rules (push needs opt-in). Do not touch the visual redesign work in flight: Release 2 packages R2-06, R2-07 and R2-09 own the customer pages and console Money, Compliance and System screens. Coordinate on shared files.
