import type Razorpay from "razorpay";
import type { RazorpaySdkClient } from "./razorpay-provider";

/**
 * Adapts the real `razorpay` SDK client to the `RazorpaySdkClient` interface `createRazorpayProvider` expects.
 * Bridges two real mismatches between the installed SDK's actual types and our own clean abstraction (found by
 * reading the SDK's .d.ts files directly, not from its documentation): `subscriptions.cancel` takes a positional
 * `boolean | number` in the real SDK rather than an options object, and `payments.fetch`'s real `amount` field is
 * `number | string` (the API always returns a number; the wider type is shared with request-body shapes that also
 * accept numeric strings). Isolating both quirks here keeps `RazorpaySdkClient` itself a clean, REST-API-shaped
 * interface that stays easy to fake in tests.
 */
export function wrapRazorpaySdkClient(client: Razorpay): RazorpaySdkClient {
  return {
    subscriptions: {
      // The SDK types addons as a mutable array; ours is readonly, so it is copied.
      create: ({ addons, ...rest }) =>
        client.subscriptions.create({ ...rest, ...(addons === undefined ? {} : { addons: addons.map((addon) => ({ item: { ...addon.item } })) }) }),
      cancel: (id, options) => client.subscriptions.cancel(id, options.cancel_at_cycle_end),
      update: (id, input) => client.subscriptions.update(id, input),
      fetch: async (id) => {
        const subscription = await client.subscriptions.fetch(id);
        return {
          id: subscription.id,
          status: subscription.status,
          short_url: subscription.short_url,
          paid_count: subscription.paid_count,
          current_start: subscription.current_start,
          current_end: subscription.current_end,
        };
      },
    },
    payments: {
      fetch: async (id) => {
        const payment = await client.payments.fetch(id);
        // Only coerce a string amount that is a clean, non-negative integer (no sign, no decimal point, no
        // whitespace, no hex/exponent notation). `Number("")`, `Number("   ")` and `Number("0x10")` all evaluate to
        // a real number rather than NaN, which would otherwise let a malformed amount silently become 0 and slip
        // past razorpay-provider.ts's `Number.isSafeInteger` guard. Anything that doesn't match becomes NaN on
        // purpose, so that downstream guard is the one that actually rejects it.
        const amount =
          typeof payment.amount === "string"
            ? /^\d+$/.test(payment.amount)
              ? Number(payment.amount)
              : Number.NaN
            : payment.amount;
        return { id: payment.id, amount, currency: payment.currency, created_at: payment.created_at, status: payment.status };
      },
    },
    invoices: {
      all: async (query) => {
        const listed = await client.invoices.all({ subscription_id: query.subscription_id });
        return {
          items: listed.items.map((invoice) => ({
            status: invoice.status ?? "",
            payment_id: invoice.payment_id ?? null,
            line_items: (invoice.line_items ?? []).map((line) => ({ type: typeof line.type === "string" ? line.type : null })),
          })),
        };
      },
    },
    plans: {
      create: async (input) => {
        const plan = await client.plans.create({
          period: input.period,
          interval: input.interval,
          item: { ...input.item },
          notes: { ...input.notes },
        });
        return { id: plan.id };
      },
    },
    orders: {
      create: async (input) => {
        const order = await client.orders.create({
          amount: input.amount,
          currency: input.currency,
          receipt: input.receipt,
          notes: { ...input.notes },
        });
        return { id: order.id };
      },
    },
  };
}
