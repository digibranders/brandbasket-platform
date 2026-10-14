import type { UpgradeBlock, UpgradeRefusal } from "@fynix/shared/lib/billing/upgrade";
import type { PlanUpgrade } from "@fynix/db";
import type { UpgradeAssessment } from "@fynix/shared/server/plan-upgrade";

/*
 * What the Upgrade page says (docs/superpowers/specs/2026-10-08-care-to-premium-upgrade-design.md). Fixed words, picked
 * by code: nothing in an address or a form is ever shown. Browser-safe and pure, so the page and its tests share them.
 */

/** Where an owner who cannot move up on their own is pointed: the team, who can do what the page cannot. */
export const UPGRADE_HELP = "Email us and we’ll sort it out.";

/** Why a client cannot move up from here, and what to do about it. `already-premium` is not here: it is a redirect. */
export const BLOCK_MESSAGES: Readonly<Record<Exclude<UpgradeBlock, "already-premium" | "already-moving">, string>> = {
  "manual-billing": "You pay us by bank transfer, so we move you up by hand. Email us and we’ll do it.",
  ending: "Your plan is ending, so it can’t be upgraded now. If that’s a mistake, email us.",
  "payment-failing": "Your last payment didn’t go through, so we can’t change your plan until it does. Email us and we’ll help.",
  lapsed: "Your plan has ended. Email us and we’ll restart it, on Premium if you like.",
  unpaid: "You haven’t paid for a plan yet. Your plan page shows how.",
  "under-review": "We’re still sorting out a payment we received. Once it’s settled you can upgrade. Email us if you need this sooner.",
};

/** Why an upgrade cannot be offered right now. */
export const UNAVAILABLE_MESSAGES: Readonly<Record<"no-premium-plan" | "provider-not-ready" | UpgradeRefusal, string>> = {
  "no-premium-plan": "We can’t take upgrades just yet. Email us and we’ll move you up by hand.",
  "provider-not-ready": "We can’t take upgrades just yet. Email us and we’ll move you up by hand.",
  "different-currency": "We can’t work out an upgrade for your plan. Email us and we’ll move you up by hand.",
  "different-tax": "We can’t work out an upgrade for your plan. Email us and we’ll move you up by hand.",
  "not-an-upgrade": "Premium doesn’t cost more than your plan does, so there’s nothing to pay for. Email us and we’ll move you up.",
  "renewal-due": "Your renewal is due in the next hour. Come back after it’s taken, and the upgrade will be for the new month.",
};

/** What the page says after a payment, keyed by `?payment=` in its address. */
export const PAYMENT_NOTICES = {
  paid: { ok: true, text: "Payment received. You’re on Premium now, and the new sections are in your menu." },
  processing: {
    ok: true,
    text: "Thanks, we’re confirming your payment with the bank. Premium opens within a minute or two; reload this page.",
  },
  failed: { ok: false, text: "That payment didn’t go through, and nothing was taken. You can try again." },
  problem: { ok: false, text: "We received a payment that didn’t match this upgrade. Our team will be in touch." },
  stale: {
    ok: false,
    text: "Your month renewed before that payment arrived, so the upgrade wasn’t applied and we’ve kept your payment aside to refund. You can start the upgrade again.",
  },
} as const satisfies Readonly<Record<string, { readonly ok: boolean; readonly text: string }>>;

export type PaymentNotice = keyof typeof PAYMENT_NOTICES;

/** The notice a `?payment=` value names, or null for anything else. */
export function readPaymentNotice(value: string | string[] | undefined): PaymentNotice | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(PAYMENT_NOTICES, value) ? (value as PaymentNotice) : null;
}

/** The Upgrade form's state: idle, or the reason the payment could not be started. */
export type UpgradeFormState = { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialUpgradeFormState: UpgradeFormState = { status: "idle" };

/** "1 day left" or "20 days left". */
export function daysLeftPhrase(daysLeft: number): string {
  return `${String(daysLeft)} ${daysLeft === 1 ? "day" : "days"} left`;
}

/** Which screen the Upgrade page draws. */
export type UpgradeScreen =
  /** Already Premium (by their first payment, or moved by staff): their dashboard is where they belong. */
  | { readonly kind: "home" }
  /** A move is paid for and waiting for the renewal. `finishing` is true while the provider has not yet been told. */
  | { readonly kind: "moving"; readonly finishing: boolean }
  | { readonly kind: "blocked"; readonly reason: Exclude<UpgradeBlock, "already-premium" | "already-moving"> }
  | { readonly kind: "unavailable"; readonly reason: "no-premium-plan" | "provider-not-ready" | UpgradeRefusal }
  /** The offer. `waiting` holds the Pay button back while the payment just made is still being confirmed. */
  | { readonly kind: "offer"; readonly waiting: boolean };

/**
 * Picks the screen from what the server read. Pure, so every case is tested: the page only draws what this says.
 * `waiting` is true only when the customer has just come back from paying (`?payment=processing`) and the charge they
 * paid is still open, which is when a second Pay would be a second payment for the same upgrade.
 */
export function upgradeScreen(input: {
  readonly assessment: UpgradeAssessment;
  readonly inFlightStatus: PlanUpgrade["status"] | null;
  readonly notice: PaymentNotice | null;
}): UpgradeScreen {
  const { assessment } = input;
  if (assessment.kind === "blocked") {
    if (assessment.reason === "already-premium") return { kind: "home" };
    if (assessment.reason === "already-moving") return { kind: "moving", finishing: input.inFlightStatus === "paid" };
    return { kind: "blocked", reason: assessment.reason };
  }
  if (assessment.kind === "unavailable") return { kind: "unavailable", reason: assessment.reason };
  return { kind: "offer", waiting: input.notice === "processing" && input.inFlightStatus === "open" };
}

/**
 * Which plan the Upgrade page says the customer is on. Once a move up is paid for they are Premium (their billing state
 * already says so: the plan it shows is the one they moved to) though the provider keeps billing Care until the renewal,
 * so a screen for a move in progress is theirs as Premium, not as Care. Every other screen is a Care client who can still
 * move up, or cannot yet. The page draws its heading, its "Your current plan" marker and its comparison from this.
 */
export function upgradeStanding(screen: UpgradeScreen): { readonly yours: "care" | "premium" } {
  return { yours: screen.kind === "moving" ? "premium" : "care" };
}
