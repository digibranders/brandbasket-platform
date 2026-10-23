import "server-only";
import { createDatabase, type Database } from "@brandbasket/db";
import { serverEnv } from "@/lib/server/env";

// Kept on globalThis so hot reloads in development reuse pools instead of opening new ones.
const holder = globalThis as typeof globalThis & {
  brandbasketAppDb?: Database;
  brandbasketStaffDb?: Database;
};

/** Customer-facing work. Bound by row-level security: scope queries with withUserScope / withTenantScope. */
export function getAppDb(): Database {
  holder.brandbasketAppDb ??= createDatabase(serverEnv().DATABASE_URL).db;
  return holder.brandbasketAppDb;
}

/**
 * Staff console and system work only. Never call from customer-facing code paths, with these sanctioned
 * exceptions:
 * - lib/server/setup.ts, where an unauthenticated visitor redeems a setup link. The customer has no account yet, so
 *   there is no scope to read the invite under; see the comment there for what keeps it safe.
 * - lib/server/checkout.ts and lib/server/payment-confirmation.ts, which write billing rows for the signed-in
 *   customer's own business. Customers may never write billing rows through their own connection; these take the
 *   business id only from the session, never from the request, and the confirmation sends onboarding back under the
 *   customer's role (withCustomerRole) so row-level security still applies to it.
 * - lib/server/keep-plan.ts, which opens and records the keep checkout of a closing account's own plan (Keep my plan, on
 *   the restore-account page) and lifts the closure once the provider confirms its mandate. A closing account has no
 *   tenant to scope under. The business id comes only from the signed-in user's own open closure; the plan, services,
 *   discount and credit only from the subscription's stored rows, never from the request, and the mandate is only ever
 *   confirmed by the provider's signed webhook or the fake provider's signed token for that business's own checkout.
 * - lib/server/membership-checkout.ts and lib/server/billing.ts, which read billing rows for the signed-in customer's own
 *   business to price the plan page and Billing: the billing state, the plan on sale, the services a lapsed plan reactivates
 *   with and whether the package offer is given up. They write nothing. The business id comes only from the session; the
 *   provider callbacks in billing.ts look a subscription or charge up by the provider's own id, to tell whose webhook or
 *   confirmation it is.
 * - app/api/site/info/route.ts, app/api/site/availability/route.ts, lib/server/booking-otp.ts (POST
 *   /api/site/bookings/otp) and lib/server/booking-confirm.ts (POST /api/site/bookings/confirm), because the site
 *   token has already proven the business, so there is no customer session to scope a connection under -- and the
 *   public role can't read module settings, services, opening hours or existing appointments, all of which these
 *   need before they read or write anything.
 * - The local directory's routes, called by the marketing website's server with LEADS_API_TOKEN:
 *   app/api/directory/ratings/route.ts, app/api/directory/reviews/route.ts, app/api/directory/reviews/otp/route.ts,
 *   app/api/directory/reviews/confirm/route.ts, app/api/directory/enquiries/route.ts,
 *   app/api/directory/status/route.ts, app/api/directory/events/route.ts, app/api/directory/signals/route.ts,
 *   app/api/directory/open-listings/route.ts and app/api/directory/open-listings/version/route.ts,
 *   through lib/server/directory-reviews.ts, lib/server/directory-enquiries.ts, lib/server/directory-verifications.ts,
 *   lib/server/directory-signals.ts and lib/server/open-listings-api.ts. A directory listing is not a platform
 *   business, so there is no tenant to scope under, and the directory tables are staff-only (0055, 0057, 0059).
 * - lib/server/clinic-booking.ts and app/app-host/(protected)/appointments/new/actions.ts (reception's Add booking),
 *   which read every doctor's calendar for one day and book through bookSlot, so a hand-added booking takes the
 *   same lock and overlap rules as an online one. The business id comes only from the signed-in customer's session,
 *   never from the request; the patient and service are first checked through the customer's own tenant scope.
 * - lib/server/add-ons.ts, which opens and records the customer's own add-on subscriptions and press release charges
 *   (and, through packages/shared, pauses and cancels them). Customers never write add_on_subscriptions or charges
 *   through their own connection; the business id comes only from the session, the price only from the server (the
 *   catalogue for a new purchase, the stored row for a resume), and a row is only ever activated by the payment
 *   confirmation. The Services page itself is read through the customer's own tenant scope, except the code on the
 *   customer's own subscription, read by the subscription's stored code id for its terms (customers cannot read codes).
 * - lib/server/charges.ts and lib/server/listing-promotion.ts, which open and record the customer's own one-off
 *   charges (a paid extra, a week of a listing tag). Customers never write charges or directory_promotions through
 *   their own connection; the business id comes only from the session, the price only from the server, and a week
 *   is only ever written by the payment confirmation.
 * - lib/server/listing-pictures.ts (POST /api/listing-pictures and the Photos page's Remove), which stores and
 *   removes a free listing account's own pictures. Customers never write directory_pictures through their own
 *   connection; the business id comes only from the session, the slot is one of three fixed names, and the file is
 *   re-encoded to the slot's size before it is stored. It also serves GET /api/directory/pictures/<id> to the
 *   marketing website, like the other directory routes above.
 * - lib/server/account-email-code.ts (the code emailed to open an account): whoever asks has no session yet, and
 *   account_otps is staff-only (0073). It writes and reads those codes and the rate-limit counters, nothing else.
 * - lib/server/oyechats-webhook.ts (POST /api/webhooks/oyechats), which records the leads OyeChats reports for a chatbot.
 *   The sender has no session, and customers never write chatbots or chatbot_leads through their own connection. Nothing
 *   in the body is believed until its signature checks out under that bot's own secret (chatbot_webhook_secrets, staff
 *   only), and the business a lead goes to comes from our record of the bot, never from the body.
 * - lib/server/chatbot-conversations.ts (the OyeChats page's message counts and the conversation pop-up), which reads one
 *   bot's OyeChats operator key from chatbot_webhook_secrets, a staff-only table, to fetch conversations from OyeChats for the
 *   signed-in customer. The bot comes from a read made through the customer's own tenant scope (and the lead from
 *   findChatbotLeadForBusiness, under row-level security), so only a bot of their own business is ever looked up; the key
 *   is used on the server and never sent to the browser. It reads that one column and writes nothing.
 * - Support submission rate limits, private screenshot lifecycle/closure checks, and the upload/erasure lock.
 *   Requester-owned ticket and attachment metadata use getAppDb with user scope. Staff access only finalizes
 *   private file lifecycle changes and records redacted automatic errors; it does not read customer messages.
 */
export function getStaffDb(): Database {
  holder.brandbasketStaffDb ??= createDatabase(serverEnv().DATABASE_URL_STAFF).db;
  return holder.brandbasketStaffDb;
}
