import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bellAfterOpening,
  bellHasUnseenWork,
  bellView,
  billingBannerState,
  countOf,
  currentPage,
  isCurrent,
  isSearchShortcut,
  linkIsCurrent,
  navModel,
  phoneTabs,
  requestsWaiting,
  searchNav,
  searchTargets,
  shortSubject,
  showsBillingBanner,
  type BellSource,
  type NavInput,
} from "./rules";

const LIVE: NavInput = { services: ["website", "social", "search"] };

const shape = (input: NavInput) => navModel(input).sections.map((section) => [section.label, section.links.map((link) => link.label)]);
const link = (label: string, input: NavInput = LIVE) => {
  const model = navModel(input);
  return [...model.sections.flatMap((section) => section.links), ...model.foot].find((candidate) => candidate.label === label);
};

describe("navModel", () => {
  it("follows the mock from the first day, before the kickoff call too", () => {
    expect(shape(LIVE)).toEqual([
      [null, ["Home", "Enquiries", "Requests"]],
      ["Services", ["Website", "Social media", "Paid Ads", "Local SEO + AEO"]],
      ["Business", ["Reports", "Business profile"]],
    ]);
    expect(navModel(LIVE).foot.map((entry) => entry.label)).toEqual(["Plan & billing", "Settings", "Help & calls"]);
  });

  it("shows Reports only after a report has been sent, and keeps it when that could not be read", () => {
    const business = (input: NavInput) => shape(input)[2]?.[1];
    expect(business({ ...LIVE, reports: false })).toEqual(["Business profile"]);
    expect(business({ ...LIVE, reports: true })).toEqual(["Reports", "Business profile"]);
    expect(business(LIVE)).toEqual(["Reports", "Business profile"]);
  });

  it("keeps a service not bought, marked as such, still linking to its page", () => {
    const social = link("Social media", { ...LIVE, services: ["website"] });
    expect(social).toMatchObject({ href: "/social", bought: false, service: "social", children: [] });
    expect(link("Paid Ads", { ...LIVE, services: ["website"] })).toMatchObject({ href: "/ads", bought: false });
    expect(link("Website", { ...LIVE, services: ["website"] })).toMatchObject({ bought: true });
  });

  it("shows Local SEO + AEO, which is no longer sold, only to a business that has it", () => {
    const labels = (input: NavInput) => navModel(input).sections.flatMap((section) => section.links.map((entry) => entry.label));
    expect(labels({ ...LIVE, services: ["website", "social"] })).not.toContain("Local SEO + AEO");
    expect(labels(LIVE)).toContain("Local SEO + AEO");
  });

  it("never calls the SEO service Search, which is what the search box is", () => {
    const labels = navModel(LIVE).sections.flatMap((section) => section.links.map((entry) => entry.label));
    expect(labels).toContain("Local SEO + AEO");
    expect(labels).not.toContain("Search");
  });

  it("shows counts above zero and drops a count that is zero or unknown, never the link", () => {
    expect(link("Requests", { ...LIVE, requests: 2 })?.count).toBe(2);
    expect(link("Enquiries", { ...LIVE, enquiries: 4 })?.count).toBe(4);
    expect(link("Requests", { ...LIVE, requests: 0 })?.count).toBeUndefined();
    expect(link("Enquiries", LIVE)).toMatchObject({ href: "/enquiries" });
    expect(link("Enquiries", LIVE)?.count).toBeUndefined();
  });

  it("points every link at a page of the route map (plan 61, section 3)", () => {
    const model = navModel(LIVE);
    const hrefs = [...model.sections.flatMap((section) => section.links), ...model.foot].map((entry) => entry.href);
    expect(hrefs).toEqual(["/", "/enquiries", "/requests", "/website", "/social", "/ads", "/search", "/reports", "/business", "/billing", "/settings", "/help"]);
  });
});

describe("current link", () => {
  it("matches Home exactly and the rest by path", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/billing", "/")).toBe(false);
    expect(isCurrent("/website/blog/new", "/website")).toBe(true);
    expect(isCurrent("/searching", "/search")).toBe(false);
  });

  it("keeps Requests lit on a request and Plan & billing on its tabs", () => {
    const requests = link("Requests");
    const plan = link("Plan & billing");
    expect(requests === undefined ? false : linkIsCurrent(requests, "/requests/abc")).toBe(true);
    expect(plan === undefined ? false : linkIsCurrent(plan, "/billing/invoices")).toBe(true);
    expect(plan === undefined ? true : linkIsCurrent(plan, "/settings")).toBe(false);
  });

  it("names the page and the page inside it for the breadcrumb", () => {
    const model = navModel(LIVE);
    expect(currentPage(model, "/website/pages")).toMatchObject({ link: { label: "Website" }, child: { label: "Pages" } });
    expect(currentPage(model, "/requests/abc")?.link.label).toBe("Requests");
    expect(currentPage(model, "/changelog")).toBeNull();
  });
});

describe("phoneTabs", () => {
  const labels = (input: NavInput) => phoneTabs(navModel(input)).map((tab) => tab.label);

  it("is Home, Enquiries, Services, Requests and More", () => {
    expect(labels(LIVE)).toEqual(["Home", "Enquiries", "Services", "Requests", "More"]);
  });

  it("puts the services in the Services menu and every other link in More", () => {
    const tabs = phoneTabs(navModel(LIVE));
    const menu = (id: string) => tabs.find((tab) => tab.kind === "menu" && tab.id === id);
    const links = (id: string) => {
      const found = menu(id);
      return found?.kind === "menu" ? found.links.map((entry) => entry.label) : [];
    };
    expect(links("services")).toEqual(["Website", "Social media", "Paid Ads", "Local SEO + AEO"]);
    expect(links("more")).toEqual(["Reports", "Business profile", "Plan & billing", "Settings", "Help & calls"]);
  });
});

describe("search", () => {
  it("starts with New request and finds pages inside a link", () => {
    const targets = searchTargets(navModel(LIVE));
    expect(targets[0]).toEqual({ href: "/requests?new=1", label: "New request" });
    expect(searchNav(targets, "PAGES").map((target) => target.label)).toEqual(["Website: Pages"]);
    expect(searchNav(targets, "invoices").map((target) => target.href)).toEqual(["/billing/invoices"]);
    expect(searchNav(targets, "seo").map((target) => target.href)).toEqual(["/search"]);
    expect(searchNav(targets, "  ")).toHaveLength(targets.length);
  });

  it("lists the pages of a service only when it is bought", () => {
    expect(searchNav(searchTargets(navModel({ ...LIVE, services: [] })), "pages")).toEqual([]);
  });

  it("opens on Command K and Control K only", () => {
    expect(isSearchShortcut({ metaKey: true, ctrlKey: false, key: "k" })).toBe(true);
    expect(isSearchShortcut({ metaKey: false, ctrlKey: true, key: "K" })).toBe(true);
    expect(isSearchShortcut({ metaKey: false, ctrlKey: false, key: "k" })).toBe(false);
  });
});

describe("counts", () => {
  it("counts each conversation waiting on the customer once", () => {
    expect(requestsWaiting([{ ticketId: "a" }, { ticketId: "b" }], [{ ticketId: "b" }, { ticketId: "c" }, { ticketId: "c" }])).toBe(3);
  });

  it("drops only the number when a count failed", () => {
    expect(countOf({ ok: true, data: 4 })).toBe(4);
    expect(countOf({ ok: false, error: { at: new Date() } })).toBeUndefined();
  });
});

describe("billing banner", () => {
  const until = new Date("2026-11-30T18:29:59Z");

  it("has one state per billing problem", () => {
    expect(billingBannerState({ status: "lapsed", renewalFailingUntil: null, paymentUnderReview: false })).toEqual({ kind: "lapsed" });
    expect(billingBannerState({ status: "paid", renewalFailingUntil: until, paymentUnderReview: false })).toEqual({ kind: "renewal-failing", until });
    expect(billingBannerState({ status: "unpaid", renewalFailingUntil: null, paymentUnderReview: true })).toEqual({ kind: "under-review" });
  });

  it("shows nothing while paid, or while unpaid (checkout handles that)", () => {
    expect(billingBannerState({ status: "paid", renewalFailingUntil: null, paymentUnderReview: false })).toBeNull();
    expect(billingBannerState({ status: "unpaid", renewalFailingUntil: null, paymentUnderReview: false })).toBeNull();
  });

  it("is left off Home for a lapsed plan or a payment under review, which Home places its own task for", () => {
    expect(showsBillingBanner("/", { kind: "lapsed" })).toBe(false);
    expect(showsBillingBanner("/", { kind: "under-review" })).toBe(false);
    expect(showsBillingBanner("/requests", { kind: "lapsed" })).toBe(true);
  });

  it("stays on Home while a renewal is failing", () => {
    expect(showsBillingBanner("/", { kind: "renewal-failing", until: new Date("2026-11-10T00:00:00Z") })).toBe(true);
  });
});

describe("bell", () => {
  const at = (iso: string) => new Date(iso);
  const SOURCE: BellSource = {
    needs: [{ ticketId: "t1", subject: "New home collection page", state: "quoted", updatedAt: at("2026-11-02T06:00:00Z") }],
    waiting: [{ ticketId: "t1", subject: "New home collection page" }, { ticketId: "t2", subject: "Photos of the MRI room" }],
    replies: [{ ticketId: "t3", subject: "Google profile hours" }],
    activity: [
      { id: "a1", title: "Fixed your address on 4 listings", service: "search", occurredAt: at("2026-11-01T06:00:00Z") },
      { id: "a2", title: "Published 3 posts", service: "social", occurredAt: at("2026-11-03T06:00:00Z") },
    ],
    seenAt: at("2026-11-02T00:00:00Z"),
  };

  it("lists what waits first, one line per conversation, then the work, newest first", () => {
    const view = bellView(SOURCE);
    expect(view.items.map((item) => item.title)).toEqual([
      "Quote waiting: New home collection page",
      "Waiting for you: Photos of the MRI room",
      "New reply: Google profile hours",
      "Published 3 posts",
      "Fixed your address on 4 listings",
    ]);
    expect(view.items[0]?.href).toBe("/requests/t1");
    expect(view.items[3]?.href).toBe("/social");
  });

  it("counts what waits and the work since the bell was last opened", () => {
    expect(bellView(SOURCE).unread).toBe(4);
    expect(bellView({ ...SOURCE, seenAt: null }).unread).toBe(5);
    const opened = bellAfterOpening(bellView(SOURCE), at("2026-11-03T07:00:00Z"));
    expect(bellHasUnseenWork(bellView(SOURCE))).toBe(true);
    expect(opened.unread).toBe(3);
    expect(bellHasUnseenWork(opened)).toBe(false);
    expect(bellAfterOpening(bellView(SOURCE), at("2026-11-02T12:00:00Z")).unread).toBe(4);
  });

  it("cuts long subjects at 60 characters", () => {
    expect(shortSubject("x".repeat(80))).toBe(`${"x".repeat(60)}...`);
    expect(shortSubject(" Short ")).toBe("Short");
  });
});

describe("browser safety", () => {
  it("keeps the shell rules free of server code", () => {
    const source = readFileSync(join(import.meta.dirname, "rules.ts"), "utf8");
    const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)].map((match) => ({ typeOnly: match[1] !== undefined, spec: match[2] ?? "" }));
    expect(imports.filter(({ typeOnly }) => !typeOnly)).toEqual([]);
  });
});
