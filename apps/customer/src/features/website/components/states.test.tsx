import { render, screen } from "@testing-library/react";
import type { Project, SiteHealthFacts, WebsitePage } from "@brandbasket/db";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import type { Loaded } from "@/lib/loaded";
import type { WebsiteCore, WebsiteOverview } from "../loader";
import type { WebsiteOffer } from "../rules/not-bought";
import { NotBoughtScreen } from "./not-bought-screen";
import { PagesScreen } from "./pages-screen";
import { SiteHealthPanel } from "./site-health-panel";
import { WebsiteScreen } from "./website-screen";

vi.mock("next/navigation", () => ({ usePathname: () => "/website", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("../actions", () => ({ approvePreviewAction: vi.fn(), sendPreviewFeedbackAction: vi.fn() }));

const NOW = new Date("2026-11-03T10:00:00.000Z");
const FAILED = { ok: false, error: { at: NOW } } as const;
const NOISE = /No data|undefined|\bnull\b|NaN/;
const ok = <T,>(data: T): Loaded<T> => ({ ok: true, data });

const owner = { role: "owner", businessName: "Kulkarni Clinic" } as unknown as CustomerContext;
const LIVE_PROJECT = { status: "live", onHoldReason: null, onboardingSubmittedAt: NOW, slaDueAt: null, previewSentAt: NOW, launchedAt: NOW, launchPlannedOn: null, revisionRoundsIncluded: 2, revisionRoundsGranted: 0, previewUrl: null } as Project;
const PREVIEW_PROJECT = { ...LIVE_PROJECT, status: "preview", launchedAt: null, previewUrl: "https://preview.example" } as Project;
const domain = { hostname: "kulkarni.example", status: "active", isFreeAddress: false } as const;
const liveCore: WebsiteCore = { project: LIVE_PROJECT, domain, live: { hostname: "kulkarni.example", launchedAt: NOW } };
const previewCore: WebsiteCore = { project: PREVIEW_PROJECT, domain, live: null };
const PAGE: WebsitePage = { businessId: "b", url: "https://kulkarni.example/menu", title: "Menu", lastSeenAt: NOW, createdAt: NOW };
const HEALTH: SiteHealthFacts = { latest: { status: "up", checkedAt: NOW }, firstCheckedAt: new Date("2026-10-01T00:00:00Z"), up: 90, down: 0, certificate: null, phoneSpeed: null };
const HISTORY = ok({ events: [], callStartsAt: null });

const liveOverview = (over: Partial<WebsiteOverview> = {}): WebsiteOverview => ({ history: HISTORY, kickoffFirst: null, preview: null, enquiries: ok(4), health: ok(HEALTH), visits: null, ...over });
const showWebsite = (core: WebsiteCore, overview: WebsiteOverview, pages: Loaded<readonly WebsitePage[]> | null) =>
  render(<WebsiteScreen context={owner} core={core} overview={overview} pages={pages} notice={null} feedbackKey="k" now={NOW} />);

describe("Website live overview: one failed panel", () => {
  it.each([
    { panel: "enquiries", what: "your enquiries", heading: "Enquiries from the site", overview: { enquiries: FAILED }, pages: ok([PAGE]) },
    { panel: "health", what: "your site health", heading: "Site health", overview: { health: FAILED }, pages: ok([PAGE]) },
    { panel: "pages", what: "your pages", heading: "Pages", overview: {}, pages: FAILED },
  ] as const)("$panel failed shows its own error and leaves the others", ({ what, heading, overview, pages }) => {
    showWebsite(liveCore, liveOverview(overview), pages);
    expect(screen.getByText(`We could not load ${what}.`)).toBeTruthy();
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Website", level: 1 })).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // Everything else on the page still draws.
    if (heading !== "Site health") expect(screen.getByRole("heading", { name: "Site health" })).toBeTruthy();
    if (heading !== "Pages") expect(screen.getByRole("heading", { name: "Pages" })).toBeTruthy();
  });

  it("a failed first-questions read replaces the page body with its own error, never a guessed state", () => {
    render(<WebsiteScreen context={owner} core={{ project: { ...LIVE_PROJECT, status: "onboarding" } as Project, domain: null, live: null }} overview={liveOverview({ kickoffFirst: FAILED })} pages={null} notice={null} feedbackKey="k" now={NOW} />);
    expect(screen.getByText("We could not load your website's progress.")).toBeTruthy();
    expect(screen.queryByText("Finish your setup")).toBeNull();
  });

  it("a failed history read shows its error inside What happens next", () => {
    showWebsite({ ...liveCore, live: null, project: { ...LIVE_PROJECT, status: "building" } as Project }, liveOverview({ history: FAILED }), null);
    expect(screen.getByRole("heading", { name: "What happens next" })).toBeTruthy();
    expect(screen.getByText("We could not load your website's progress.")).toBeTruthy();
  });
});

describe("Website preview: a failed panel", () => {
  it("a failed preview picture read shows its own error and keeps the decision panel", () => {
    showWebsite(previewCore, liveOverview({ preview: FAILED, enquiries: null, health: null }), null);
    expect(screen.getByText("We could not load your preview.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What do you think?" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What happens next" })).toBeTruthy();
  });
});

describe("Website: empty panels", () => {
  it("a live site with no project says when to come back", () => {
    const { container } = showWebsite({ project: null, domain: null, live: null }, liveOverview({ history: null, enquiries: null, health: null }), null);
    expect(screen.getByText("When there is a website or a big change to build, you can follow it here.")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });

  it("site health with no checks yet says when checks start", () => {
    const { container } = render(<SiteHealthPanel facts={ok({ latest: null, firstCheckedAt: null, up: 0, down: 0, certificate: null, phoneSpeed: null })} now={NOW} />);
    expect(screen.getByText("No checks yet")).toBeTruthy();
    expect(screen.getByText("Checks start once your website is live.")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });

  it("a live site with no pages listed yet draws the rest of the overview without an error", () => {
    // The Pages panel and tab are left out until the nightly sync finds pages (Partial state, plan 60 section 13); the Pages route explains.
    const { container } = showWebsite(liveCore, liveOverview(), ok([]));
    expect(screen.getByRole("heading", { name: "Site health" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("PagesScreen states", () => {
  it("a failed read shows its own error under the real header", () => {
    render(<PagesScreen core={liveCore} pages={FAILED} now={NOW} />);
    expect(screen.getByRole("alert").textContent).toContain("We could not load your pages.");
    expect(screen.getByRole("heading", { name: "Pages" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Website", level: 1 })).toBeTruthy();
  });

  it("an empty list says why and when pages appear", () => {
    const { container } = render(<PagesScreen core={liveCore} pages={ok([])} now={NOW} />);
    expect(screen.getByText("No pages listed yet")).toBeTruthy();
    expect(screen.getByText(/appear here once your website is live/)).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("NotBoughtScreen states", () => {
  it("a failed price read shows its own error and no Add to plan", () => {
    render(<NotBoughtScreen offer={FAILED} currency="INR" canAdd />);
    expect(screen.getByRole("alert").textContent).toContain("We could not load the price of the Managed Website.");
    expect(screen.queryByRole("link", { name: "Add to plan" })).toBeNull();
  });

  it("with the price it shows Add to plan to someone who can add", () => {
    const offer: WebsiteOffer = { title: "Managed Website", included: "Hosting, edits and security.", netCents: 299_900, offerCents: 0, unit: "a month" };
    const { container } = render(<NotBoughtScreen offer={ok(offer)} currency="INR" canAdd />);
    expect(screen.getByRole("link", { name: "Add to plan" })).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
