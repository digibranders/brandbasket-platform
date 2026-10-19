import type { ProjectStatus } from "@brandbasket/db";
import type { SiteStatus } from "@brandbasket/billing";
import { PAYMENT_STEP_HREF, type BillingBannerModel } from "@brandbasket/shared/lib/billing/payment-step";
import type { NextStep } from "@brandbasket/shared/lib/next-step";

/**
 * One line in the bell's panel.
 *
 * `actionable` means the customer has to do something; those are the only ones that light the bell's dot. The rest
 * say what we are doing, which is worth showing but never worth nagging about.
 */
export interface Notice {
  readonly id: string;
  readonly text: string;
  readonly href: string | null;
  readonly actionable: boolean;
}

/**
 * Everything the sidebar's account bar shows beyond the account itself. Declared here rather than beside its
 * `getAccountPanel` loader (lib/server/account-panel.ts) because the bar is a client component and must be able to
 * import the type without pulling a "server-only" module into the browser bundle.
 */
export interface AccountPanel {
  readonly notices: readonly Notice[];
  /** The customer's own website, for the menu's "Home page" link. Null until it launches. */
  readonly liveWebsiteUrl: string | null;
  readonly siteStatus: SiteStatus;
}

export interface NoticeInput {
  readonly banner: BillingBannerModel | null;
  /** Null when onboarding has never started, so no project row exists yet. */
  readonly projectStatus: ProjectStatus | null;
  readonly nextStep: NextStep;
}

/**
 * Every notice is a *current state*, never an event: each one is true for exactly as long as its condition holds.
 * That is why nothing here is stored and nothing can be marked read — a dot that could be dismissed while the
 * payment behind it is still due would be a lie. The price of that honesty is that notices cannot be dismissed
 * one by one, which is right for this set, since none of them should be.
 *
 * Kept pure and separate from lib/server/account-panel.ts so the mapping can be tested without a database.
 */
export function noticesFrom({ banner, projectStatus, nextStep }: NoticeInput): readonly Notice[] {
  const notices: Notice[] = [];

  if (banner !== null) {
    switch (banner.kind) {
      case "pay":
        notices.push({ id: "payment-due", text: "Payment due", href: PAYMENT_STEP_HREF, actionable: true });
        break;
      case "retrying":
        notices.push({ id: "payment-retrying", text: "Your last payment didn’t go through", href: banner.action.href, actionable: true });
        break;
      case "reactivate":
        notices.push({ id: "plan-ended", text: "Your plan has ended", href: banner.action.href, actionable: true });
        break;
      case "notice":
        notices.push({ id: "payment-received", text: "Payment received", href: "/billing", actionable: false });
        break;
    }
  }

  switch (projectStatus) {
    case "preview":
      notices.push({ id: "preview-ready", text: "Your preview is ready to review", href: "/project", actionable: true });
      break;
    case "submitted":
    case "building":
      notices.push({ id: "building", text: "We’re building your website", href: "/project", actionable: false });
      break;
    case "revisions":
      notices.push({ id: "revisions", text: "We’re making your changes", href: "/project", actionable: false });
      break;
    case "on_hold":
      notices.push({ id: "on-hold", text: "Your build is paused", href: "/project", actionable: false });
      break;
    default:
      break;
  }

  // Onboarding is only worth chasing while it is genuinely unfinished; every later stage has its own line above.
  if (nextStep.kind === "start-onboarding" || nextStep.kind === "continue-onboarding") {
    notices.push({
      id: "finish-setup",
      text: "Finish setting up your website",
      href: "/onboarding",
      actionable: true,
    });
  }

  return notices;
}

export function actionableCount(notices: readonly Notice[]): number {
  return notices.filter((notice) => notice.actionable).length;
}

/** The status line along the bottom of the account menu, mirroring what the Monitoring page says at more length. */
export function siteStatusLine(status: SiteStatus): { readonly text: string; readonly tone: "ok" | "neutral" | "warn" } {
  switch (status.kind) {
    case "online":
      return { text: "All systems normal", tone: "ok" };
    case "offline":
      return { text: "Your website is offline", tone: "warn" };
    case "not_launched":
      return { text: "Not live yet", tone: "neutral" };
  }
}
