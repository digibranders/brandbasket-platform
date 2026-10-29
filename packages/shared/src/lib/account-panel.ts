import type { ProjectStatus } from "@brandbasket/db";
import type { SiteStatus } from "@brandbasket/billing";
import { PAYMENT_STEP_HREF, type BillingBannerModel } from "@brandbasket/shared/lib/billing/payment-step";
import type { NextStep } from "@brandbasket/shared/lib/next-step";
import { CUSTOMER_STAGE_HEADLINE } from "@brandbasket/shared/lib/project-customer-line";

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

/** A request that needs the customer, or has news, as the bell reads it. */
export interface RequestNoticeInput {
  readonly ticketId: string;
  readonly subject: string;
  /** `quote` a quote to answer, `payment` an accepted quote to pay, `check` a change to look at, `reply` a reply to read. */
  readonly kind: "quote" | "payment" | "check" | "reply";
}

const REQUEST_NOTICE_WORDS: Readonly<Record<RequestNoticeInput["kind"], string>> = {
  quote: "Quote waiting",
  payment: "Payment waiting",
  check: "Ready to check",
  reply: "New reply",
};

const NOTICE_SUBJECT_LIMIT = 60;

export interface NoticeInput {
  readonly banner: BillingBannerModel | null;
  /** Null when onboarding has never started, so no project row exists yet. */
  readonly projectStatus: ProjectStatus | null;
  readonly nextStep: NextStep;
  /** The requests with something for the customer. Left out, the bell says nothing about requests. */
  readonly requests?: readonly RequestNoticeInput[];
}

/**
 * Every notice is a *current state*, never an event: each one is true for exactly as long as its condition holds.
 * That is why nothing here is stored and nothing can be marked read. A dot that could be dismissed while the
 * payment behind it is still due would be a lie. The price of that honesty is that notices cannot be dismissed
 * one by one, which is right for this set, since none of them should be.
 *
 * Kept pure and separate from lib/server/account-panel.ts so the mapping can be tested without a database.
 */
export function noticesFrom({ banner, projectStatus, nextStep, requests = [] }: NoticeInput): readonly Notice[] {
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
      notices.push({ id: "preview-ready", text: "Your preview is ready to review", href: "/website", actionable: true });
      break;
    case "submitted":
      notices.push({ id: "preparing", text: CUSTOMER_STAGE_HEADLINE.submitted, href: "/website", actionable: false });
      break;
    case "building":
      notices.push({ id: "building", text: "We’re building your website", href: "/website", actionable: false });
      break;
    case "revisions":
      notices.push({ id: "revisions", text: "We’re making your changes", href: "/website", actionable: false });
      break;
    case "on_hold":
      notices.push({ id: "on-hold", text: "Your build is paused", href: "/website", actionable: false });
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

  for (const request of requests) {
    const subject = request.subject.length > NOTICE_SUBJECT_LIMIT ? `${request.subject.slice(0, NOTICE_SUBJECT_LIMIT).trimEnd()}...` : request.subject;
    notices.push({
      id: `request-${request.kind}-${request.ticketId}`,
      text: `${REQUEST_NOTICE_WORDS[request.kind]}: ${subject}`,
      // The Requests page (apps/platform/lib/requests/links.ts), spelled out because this file is shared with the console.
      href: `/requests?open=${request.ticketId}`,
      actionable: request.kind !== "reply",
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
