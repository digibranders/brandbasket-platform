import type { CustomerBilling } from "@brandbasket/shared/lib/billing/status";
import type { Service } from "@/lib/guard-rules";
import type { Loaded } from "@/lib/loaded";
import type { IconName } from "@/ui";

/*
 * The shell's decisions as pure functions: which links the sidebar, the phone tabs and search show, which one is current,
 * the billing banner and the notifications bell. Ported from apps/platform lib/rail.ts (with its tests), lib/home/state.ts
 * (kickoffIsOver), lib/server/requests.ts (the Requests count), packages/shared lib/account-panel.ts (bell lines) and
 * lib/billing/payment-step.ts (banner kinds), moved to the navigation of plan 60 section 9 and the approved mock. Client
 * safe: no server imports.
 */

export const SHELL_PATHS = {
  home: "/",
  enquiries: "/enquiries",
  requests: "/requests",
  newRequest: "/requests?new=1",
  website: "/website",
  social: "/social",
  search: "/search",
  reports: "/reports",
  business: "/business",
  billing: "/billing",
  invoices: "/billing/invoices",
  settings: "/settings",
  security: "/settings/security",
  help: "/help",
  changelog: "/changelog",
} as const;

/** A page search can jump to. */
export interface NavTarget {
  readonly href: string;
  readonly label: string;
}

export interface NavLink extends NavTarget {
  readonly icon: IconName;
  /** Things waiting, shown beside the link. Left out when there are none or when the number could not be read. */
  readonly count?: number;
  /** The link is a service: drawn with its mark. */
  readonly service?: Service;
  /** False for a service not on the plan: the link stays (its page explains the service) but looks it. */
  readonly bought?: boolean;
  /** Pages inside the link, for search: they are tabs on the page, not sidebar links. */
  readonly children?: readonly NavTarget[];
}

export interface NavSection {
  /** The small heading above the section; null for the first. */
  readonly label: string | null;
  readonly links: readonly NavLink[];
}

export interface NavModel {
  readonly sections: readonly NavSection[];
  /** Plan & billing, Settings, Help & calls: at the foot of the sidebar, always. */
  readonly foot: readonly NavLink[];
}

export interface NavInput {
  /** The services on the plan (guards' `services`). */
  readonly services: readonly Service[];
  /** The kickoff call is over: before it the sidebar is reduced (plan 60, section 9). */
  readonly kickoffOver: boolean;
  /** New enquiries; undefined when not known. */
  readonly enquiries?: number;
  /** Requests waiting on the customer; undefined when not known. */
  readonly requests?: number;
  /** A report has been sent (plan 60, section 9: Reports shows after the first report month). Undefined when not known: the link stays. */
  readonly reports?: boolean;
}

const SERVICE_LINKS: Readonly<Record<Service, Omit<NavLink, "bought" | "children">>> = {
  website: { href: SHELL_PATHS.website, label: "Website", icon: "Browser", service: "website" },
  social: { href: SHELL_PATHS.social, label: "Social & Ads", icon: "MegaphoneSimple", service: "social" },
  // The SEO service is never called "Search", which is what the search box is.
  search: { href: SHELL_PATHS.search, label: "Local SEO + AEO", icon: "MapPinArea", service: "search" },
};

/** Pages inside a bought service that search can open directly, from the mock's search list. */
const SERVICE_CHILDREN: Readonly<Record<Service, readonly NavTarget[]>> = {
  website: [{ href: "/website/pages", label: "Pages" }],
  social: [{ href: "/social/content", label: "Content" }],
  search: [],
};

const SERVICES_IN_ORDER: readonly Service[] = ["website", "social", "search"];

const withCount = (link: NavLink, count: number | undefined): NavLink => (count !== undefined && count > 0 ? { ...link, count } : link);

const HOME: NavLink = { href: SHELL_PATHS.home, label: "Home", icon: "House" };
const ENQUIRIES: NavLink = { href: SHELL_PATHS.enquiries, label: "Enquiries", icon: "TrayArrowDown" };
const REQUESTS: NavLink = { href: SHELL_PATHS.requests, label: "Requests", icon: "ChatTeardropText" };
const REPORTS: NavLink = { href: SHELL_PATHS.reports, label: "Reports", icon: "PresentationChart" };
const BUSINESS: NavLink = { href: SHELL_PATHS.business, label: "Business profile", icon: "Storefront" };
const FOOT: readonly NavLink[] = [
  { href: SHELL_PATHS.billing, label: "Plan & billing", icon: "Wallet", children: [{ href: SHELL_PATHS.invoices, label: "Invoices" }] },
  { href: SHELL_PATHS.settings, label: "Settings", icon: "GearSix" },
  { href: SHELL_PATHS.help, label: "Help & calls", icon: "Headset" },
];

/**
 * The sidebar (plan 60, section 9, and the mock): Home, Enquiries, Requests; then Services; then Business; the foot always.
 * Before the kickoff call: Home, Requests, Business profile and the foot. Every service shows after kickoff: one not on the
 * plan is marked `bought: false` and still links to its page. A count that could not be read hides only the number. Reports
 * waits for the first sent report; when that could not be read it shows, so a failed read never hides the link.
 */
export function navModel(input: NavInput): NavModel {
  const requests = withCount(REQUESTS, input.requests);
  if (!input.kickoffOver) {
    return { sections: [{ label: null, links: [HOME, requests] }, { label: "Business", links: [BUSINESS] }], foot: FOOT };
  }
  // Local SEO + AEO is no longer sold, so its link shows only to a business that has it.
  const services = SERVICES_IN_ORDER.filter((service) => service !== "search" || input.services.includes(service)).map((service): NavLink => {
    const bought = input.services.includes(service);
    return { ...SERVICE_LINKS[service], bought, children: bought ? SERVICE_CHILDREN[service] : [] };
  });
  return {
    sections: [
      { label: null, links: [HOME, withCount(ENQUIRIES, input.enquiries), requests] },
      { label: "Services", links: services },
      { label: "Business", links: input.reports === false ? [BUSINESS] : [REPORTS, BUSINESS] },
    ],
    foot: FOOT,
  };
}

const allLinks = (model: NavModel): readonly NavLink[] => [...model.sections.flatMap((section) => section.links), ...model.foot];

/** Home only on "/" itself; every other link on its own path and the pages under it. */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === SHELL_PATHS.home) return pathname === SHELL_PATHS.home;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function linkIsCurrent(link: NavLink, pathname: string): boolean {
  return isCurrent(pathname, link.href) || (link.children ?? []).some((child) => isCurrent(pathname, child.href));
}

/** What the top bar's breadcrumb names: the current link, and the page inside it when it is one search knows. */
export function currentPage(model: NavModel, pathname: string): { readonly link: NavLink; readonly child?: NavTarget } | null {
  const link = allLinks(model).find((candidate) => linkIsCurrent(candidate, pathname));
  if (link === undefined) return null;
  const child = (link.children ?? []).find((candidate) => isCurrent(pathname, candidate.href));
  return child === undefined ? { link } : { link, child };
}

/** One slot of the phone's bottom tab bar: a link, or a button that opens a menu of links. */
export type PhoneTab =
  | { readonly kind: "link"; readonly link: NavLink; readonly label: string }
  | { readonly kind: "menu"; readonly id: "services" | "more"; readonly label: string; readonly icon: IconName; readonly links: readonly NavLink[] };

/**
 * The phone's five tabs (plan 60, section 9): Home, Enquiries, Services (a menu of the services), Requests, More. Before
 * the kickoff call: Home, Requests, Business, Billing, More. More holds every other link.
 */
export function phoneTabs(model: NavModel, kickoffOver: boolean): readonly PhoneTab[] {
  const links = allLinks(model);
  const find = (href: string): NavLink | undefined => links.find((link) => link.href === href);
  const tab = (href: string, label?: string): PhoneTab[] => {
    const link = find(href);
    return link === undefined ? [] : [{ kind: "link", link, label: label ?? link.label }];
  };
  const services = links.filter((link) => link.service !== undefined);
  const head: PhoneTab[] = kickoffOver
    ? [
        ...tab(SHELL_PATHS.home),
        ...tab(SHELL_PATHS.enquiries),
        { kind: "menu", id: "services", label: "Services", icon: "Browser", links: services },
        ...tab(SHELL_PATHS.requests),
      ]
    : [...tab(SHELL_PATHS.home), ...tab(SHELL_PATHS.requests), ...tab(SHELL_PATHS.business, "Business"), ...tab(SHELL_PATHS.billing, "Billing")];
  const shown = new Set(head.flatMap((slot) => (slot.kind === "link" ? [slot.link.href] : slot.links.map((link) => link.href))));
  return [...head, { kind: "menu", id: "more", label: "More", icon: "List", links: links.filter((link) => !shown.has(link.href)) }];
}

/** New request, the first thing search offers. */
export const NEW_REQUEST: NavTarget = { href: SHELL_PATHS.newRequest, label: "New request" };

/** Everything search can open: New request, every link, and every page inside a link as "Link: Page". */
export function searchTargets(model: NavModel): readonly NavTarget[] {
  return [
    NEW_REQUEST,
    ...allLinks(model).flatMap((link) => [
      { href: link.href, label: link.label },
      ...(link.children ?? []).map((child) => ({ href: child.href, label: `${link.label}: ${child.label}` })),
    ]),
  ];
}

/** The targets whose label holds the query, ignoring case. An empty query lists everything. */
export function searchNav(targets: readonly NavTarget[], query: string): readonly NavTarget[] {
  const wanted = query.trim().toLowerCase();
  return wanted === "" ? targets : targets.filter((target) => target.label.toLowerCase().includes(wanted));
}

/** Command K on a Mac, Control K elsewhere: the app's only global shortcut (plan 60, section 15). */
export function isSearchShortcut(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "key">): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

/** The kickoff booking as the shell reads it. */
export interface KickoffBooking {
  readonly endsAt: Date | null;
  readonly heldAt: Date | null;
}

/**
 * A kickoff is over once staff marked it held, or its end time has passed. No booking means it has not happened. Ported
 * from apps/platform lib/home/state.ts kickoffIsOver.
 */
export function kickoffIsOver(kickoff: KickoffBooking | null, now: Date): boolean {
  if (kickoff === null) return false;
  return kickoff.heldAt !== null || (kickoff.endsAt !== null && kickoff.endsAt.getTime() <= now.getTime());
}

/** The shell's reading of the kickoff. When it could not be read the full sidebar shows, so no link is hidden by a failure. */
export function kickoffOverOrAssumed(kickoff: Loaded<KickoffBooking | null>, now: Date): boolean {
  return kickoff.ok ? kickoffIsOver(kickoff.data, now) : true;
}

/** A loaded count, or undefined when it failed: the link stays and only its number is left out. */
export function countOf(count: Loaded<number>): number | undefined {
  return count.ok ? count.data : undefined;
}

/** What waits on the customer across Requests: quotes, changes to check and questions from the team, one per conversation. */
export function requestsWaiting(needs: readonly { readonly ticketId: string }[], waiting: readonly { readonly ticketId: string }[]): number {
  const counted = new Set(needs.map((need) => need.ticketId));
  return needs.length + new Set(waiting.map((item) => item.ticketId).filter((ticketId) => !counted.has(ticketId))).size;
}

/** The banner on every page but Home while billing needs attention. Unpaid is checkout's job, not the banner's. */
export type BillingBannerState =
  | { readonly kind: "lapsed" }
  | { readonly kind: "renewal-failing"; readonly until: Date }
  | { readonly kind: "under-review" }
  | null;

export function billingBannerState(billing: Pick<CustomerBilling, "status" | "renewalFailingUntil" | "paymentUnderReview">): BillingBannerState {
  if (billing.status === "lapsed") return { kind: "lapsed" };
  if (billing.status === "paid" && billing.renewalFailingUntil !== null) return { kind: "renewal-failing", until: billing.renewalFailingUntil };
  if (billing.status === "unpaid" && billing.paymentUnderReview) return { kind: "under-review" };
  return null;
}

/**
 * Home places its own task for a lapsed plan or a payment under review, so the banner is left off "/" exactly for those
 * (apps/platform hidden-on-paths). A failing renewal has no state of its own on Home, only a Needs you line, so the banner
 * stays there too.
 */
export function showsBillingBanner(pathname: string, state: NonNullable<BillingBannerState>): boolean {
  return pathname !== SHELL_PATHS.home || state.kind === "renewal-failing";
}

/** What the bell is built from, read for the signed-in person and business. */
export interface BellSource {
  /** Quotes to answer and changes to check (listRequestNeeds). */
  readonly needs: readonly { readonly ticketId: string; readonly subject: string; readonly state: "quoted" | "preview"; readonly updatedAt: Date }[];
  /** Conversations where the team asked something (listWaitingOnYou). */
  readonly waiting: readonly { readonly ticketId: string; readonly subject: string }[];
  /** Conversations with a reply not yet read (listUnreadReplies). */
  readonly replies: readonly { readonly ticketId: string; readonly subject: string }[];
  /** Work we did, newest first (activity_events). */
  readonly activity: readonly { readonly id: string; readonly title: string; readonly service: Service | null; readonly occurredAt: Date }[];
  /** When the person last opened the bell (notification_reads.seen_at); null if never. */
  readonly seenAt: Date | null;
}

export interface BellItem {
  readonly id: string;
  /** A quote or change to check, a question from the team, a new reply, or work we did. */
  readonly kind: "need" | "waiting" | "reply" | "activity";
  readonly icon: IconName;
  readonly title: string;
  readonly href: string;
  /** When it happened, when known. */
  readonly at: Date | null;
  /** Waits on the customer: it stays new until it is dealt with. */
  readonly needsYou: boolean;
  /** Counts toward the bell's number. */
  readonly unread: boolean;
}

export interface BellView {
  readonly items: readonly BellItem[];
  readonly unread: number;
}

const SUBJECT_LIMIT = 60;

/** A subject cut to 60 characters, as the old bell did. */
export function shortSubject(subject: string): string {
  const trimmed = subject.trim();
  return trimmed.length > SUBJECT_LIMIT ? `${trimmed.slice(0, SUBJECT_LIMIT).trimEnd()}...` : trimmed;
}

const requestHref = (ticketId: string): string => `${SHELL_PATHS.requests}/${encodeURIComponent(ticketId)}`;
const serviceHref = (service: Service | null): string => (service === null ? SHELL_PATHS.home : SERVICE_LINKS[service].href);

/**
 * The bell's lines: what waits on the customer first (one line per conversation: a quote or a change to check, then a
 * question, then a new reply), then the work we did, newest first. Waiting lines always count; work counts until the bell
 * is opened after it.
 */
export function bellView(source: BellSource): BellView {
  const seen = new Set<string>();
  const once = (ticketId: string): boolean => {
    if (seen.has(ticketId)) return false;
    seen.add(ticketId);
    return true;
  };
  const needs = source.needs.filter((need) => once(need.ticketId)).map(
    (need): BellItem => ({
      id: `need-${need.ticketId}`,
      kind: "need",
      icon: need.state === "quoted" ? "Receipt" : "Eye",
      title: `${need.state === "quoted" ? "Quote waiting" : "Ready to check"}: ${shortSubject(need.subject)}`,
      href: requestHref(need.ticketId),
      at: need.updatedAt,
      needsYou: true,
      unread: true,
    }),
  );
  const waiting = source.waiting.filter((item) => once(item.ticketId)).map(
    (item): BellItem => ({
      id: `waiting-${item.ticketId}`,
      kind: "waiting",
      icon: "ChatCircleDots",
      title: `Waiting for you: ${shortSubject(item.subject)}`,
      href: requestHref(item.ticketId),
      at: null,
      needsYou: true,
      unread: true,
    }),
  );
  const replies = source.replies.filter((item) => once(item.ticketId)).map(
    (item): BellItem => ({
      id: `reply-${item.ticketId}`,
      kind: "reply",
      icon: "ChatText",
      title: `New reply: ${shortSubject(item.subject)}`,
      href: requestHref(item.ticketId),
      at: null,
      needsYou: false,
      unread: true,
    }),
  );
  const activity = [...source.activity]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .map(
      (event): BellItem => ({
        id: `activity-${event.id}`,
        kind: "activity",
        icon: "CheckCircle",
        title: event.title,
        href: serviceHref(event.service),
        at: event.occurredAt,
        needsYou: false,
        unread: source.seenAt === null || event.occurredAt.getTime() > source.seenAt.getTime(),
      }),
    );
  const items = [...needs, ...waiting, ...replies, ...activity];
  return { items, unread: items.filter((item) => item.unread).length };
}

/** Opening the bell changes something only when it shows work not seen before. */
export function bellHasUnseenWork(view: BellView): boolean {
  return view.items.some((item) => item.kind === "activity" && item.unread);
}

/**
 * The bell as it reads once opened at `openedAt`: work up to then is read, while what waits on the customer and unread
 * replies stay new. Work that arrives later is new again.
 */
export function bellAfterOpening(view: BellView, openedAt: Date): BellView {
  const items = view.items.map((item) =>
    item.kind === "activity" && item.at !== null && item.at.getTime() <= openedAt.getTime() ? { ...item, unread: false } : item,
  );
  return { items, unread: items.filter((item) => item.unread).length };
}
