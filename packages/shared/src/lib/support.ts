export const SUPPORT_CATEGORIES = ["bug", "support", "feature", "billing", "website_change", "account_access", "general", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export const SUPPORT_STATUSES = ["new", "triaged", "in_progress", "waiting_on_you", "resolved", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
export const SUPPORT_ATTACHMENT_LIMIT = 3;
export const SUPPORT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

export const SUPPORT_CATEGORY_LABELS: Readonly<Record<SupportCategory, string>> = {
  bug: "Report a bug", support: "Get help", feature: "Suggest a feature", billing: "Billing question",
  website_change: "Website change", account_access: "Account access", general: "General feedback", other: "Something else",
};
export const SUPPORT_STATUS_LABELS: Readonly<Record<SupportStatus, string>> = {
  new: "New", triaged: "Triaged", in_progress: "In progress", waiting_on_you: "Waiting on you", resolved: "Resolved", closed: "Closed",
};

export interface SupportDetails {
  readonly pageUrl?: string;
  readonly stepsToReproduce?: string;
  readonly expectedBehavior?: string;
  readonly actualBehavior?: string;
  readonly browserDevice?: string;
  readonly invoiceReference?: string;
  readonly requestedChange?: string;
  readonly accountEmail?: string;
}

const TRANSITIONS: Readonly<Record<SupportStatus, readonly SupportStatus[]>> = {
  new: ["triaged", "in_progress", "waiting_on_you", "resolved", "closed"],
  triaged: ["in_progress", "waiting_on_you", "resolved", "closed"],
  in_progress: ["triaged", "waiting_on_you", "resolved", "closed"],
  waiting_on_you: ["triaged", "in_progress", "resolved", "closed"],
  resolved: ["triaged", "in_progress", "closed"],
  closed: [],
};

export function canTransitionSupportStatus(from: SupportStatus, to: SupportStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}
