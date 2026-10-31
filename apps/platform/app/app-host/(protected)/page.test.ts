import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientHomeState } from "@/lib/home/state";
import { getBillingBanner } from "@/lib/server/billing-banner";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadFirstPaymentEvent } from "@/lib/server/first-payment-event";
import { loadHome, type HomeData } from "@/lib/server/home";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import AppHomePage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ isPhoneAccountEmail: vi.fn(() => false) }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/billing-banner", () => ({ getBillingBanner: vi.fn() }));
vi.mock("@/lib/server/onboarding", () => ({ getLiveWebsite: vi.fn(), getProjectOverview: vi.fn() }));
vi.mock("@/lib/server/home", () => ({ loadHome: vi.fn() }));
const welcomeProps = vi.fn();
vi.mock("@/components/first-look/payment-welcome", () => ({
  PaymentWelcome: (props: unknown) => {
    welcomeProps(props);
    return null;
  },
}));
vi.mock("@/lib/server/first-payment-event", () => ({ loadFirstPaymentEvent: vi.fn() }));
vi.mock("@/components/first-look/kickoff-picker", () => ({ KickoffPicker: () => "[picker]" }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" };
const banner = { kind: "pay", title: "Start your plan", price: null, action: { href: "/onboarding/review", label: "Check and send" } };

function home(state: ClientHomeState, overrides: Partial<HomeData> = {}): HomeData {
  return {
    state,
    services: ["website", "social"],
    call: { url: null, booking: null, readAtMs: Date.parse("2026-10-30T12:00:00Z") },
    project: null,
    intake: [],
    kickoffNotes: null,
    attention: [],
    overview: null,
    ...overrides,
  };
}

async function renderHome(data: HomeData, params: Readonly<Record<string, string>> = {}): Promise<string> {
  vi.mocked(loadHome).mockResolvedValue(data);
  return renderToStaticMarkup(await AppHomePage({ searchParams: Promise.resolve(params) })).replaceAll("<!-- -->", "");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { name: "Asha Rao", email: "asha@example.com" }, tenant, billing: { hasAccess: true } } as never);
  vi.mocked(getBillingBanner).mockResolvedValue(null);
  vi.mocked(getProjectOverview).mockResolvedValue({ project: { status: "onboarding", slaDueAt: null, onboardingSubmittedAt: null, previewSentAt: null, launchPlannedOn: null }, completed: ["business"] } as never);
  vi.mocked(getLiveWebsite).mockResolvedValue(null);
});

describe("reporting the first payment to Tag Manager", () => {
  const purchase = { transactionId: "pay_Abc123", value: 2541.54, currency: "INR" } as const;

  it("reads the first payment only for the visit that opens the welcome, and hands it to the popup", async () => {
    vi.mocked(loadFirstPaymentEvent).mockResolvedValue(purchase);
    await renderHome(home({ kind: "kickoff_unbooked" }), { welcome: "1" });
    expect(loadFirstPaymentEvent).toHaveBeenCalledWith(tenant);
    expect(welcomeProps).toHaveBeenCalledWith(expect.objectContaining({ purchase }));
  });

  it("reads nothing on an ordinary visit", async () => {
    await renderHome(home({ kind: "kickoff_unbooked" }));
    expect(loadFirstPaymentEvent).not.toHaveBeenCalled();
    expect(welcomeProps).toHaveBeenCalledWith(expect.objectContaining({ purchase: null }));
  });
});

describe("a payment problem keeps the old setup Home", () => {
  it("shows the payment banner and the setup steps for an account that has not paid, and none of the new screens", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { name: "Asha Rao", email: "asha@example.com" }, tenant, billing: { hasAccess: false } } as never);
    vi.mocked(getBillingBanner).mockResolvedValue(banner as never);
    const html = await renderHome(home({ kind: "payment_required" }));
    expect(html).toContain("Hello, Asha.");
    expect(html).toContain("Start your plan");
    expect(html).toContain("Get ready for your call");
    expect(html).not.toContain("Book your kickoff");
  });

  it("shows where the website stands for a lapsed account whose site is live", async () => {
    vi.mocked(getLiveWebsite).mockResolvedValue({ hostname: "cafe.example", launchedAt: new Date("2026-09-01T00:00:00Z") } as never);
    const html = await renderHome(home({ kind: "lapsed" }));
    expect(html).toContain("Your website is live");
    expect(html).toContain("cafe.example");
  });
});

describe("before the kickoff", () => {
  it("greets the customer by name and asks them to book, with no checklist", async () => {
    const html = await renderHome(home({ kind: "kickoff_unbooked" }));
    expect(html).toMatch(/Good (morning|afternoon|evening), Asha/);
    expect(html).toContain("Book your kickoff");
    expect(html).toContain("[picker]");
    expect(html).toContain("None of this is required");
    expect(html).not.toContain("Get ready for your call");
  });

  it("shows what they told us before paying, only the rows they answered", async () => {
    const html = await renderHome(home({ kind: "kickoff_unbooked" }, { intake: [{ field: "businessType", label: "Business", value: "Dental clinic" }] }));
    expect(html).toContain("Dental clinic");
    expect(html).toContain("What we will cover");
  });

  it("shows a booked call with its time, a countdown and the calendar link, and no Join button", async () => {
    const startsAt = new Date("2026-10-31T06:00:00Z");
    const html = await renderHome(home({ kind: "kickoff_booked", startsAt, endsAt: new Date("2026-10-31T06:30:00Z") }));
    expect(html).toContain("Kickoff booked");
    expect(html).toContain("Your kickoff is Sat 31 Oct, 11:30");
    expect(html).toContain('role="timer"');
    expect(html).toContain("Add to calendar");
    expect(html).toContain("Reschedule");
    expect(html).not.toContain("Join meeting");
  });
});

describe("while the website is built", () => {
  it("says the first preview date from the project, and that nothing is needed", async () => {
    const html = await renderHome(home({ kind: "building", dueAt: new Date("2026-11-01T06:30:00Z") }, { project: { slaDueAt: new Date("2026-11-01T06:30:00Z"), previewSentAt: null, launchPlannedOn: null } }));
    expect(html).toContain("We are building your website");
    expect(html).toContain("Your first preview will be ready by Sun 1 Nov");
    expect(html).toContain("Nothing needed from you right now");
    expect(html).toContain("Preview by Sun 1 Nov");
  });

  it("does not invent a date when the project has none", async () => {
    const html = await renderHome(home({ kind: "building", dueAt: null }));
    expect(html).toContain("We will email you, and show it here, when your first preview is ready.");
  });

  it("shows the hold reason exactly as staff wrote it", async () => {
    const html = await renderHome(home({ kind: "on_hold", reason: "Waiting for your logo file" }));
    expect(html).toContain("Your build is paused");
    expect(html).toContain("Waiting for your logo file");
  });

  it("shows the one thing we need, when there is one, and says how many more wait", async () => {
    const attention = [
      { key: "a", label: "Accept a quote: Add the root canal price", hint: "1 hour, ₹1,500", href: "/requests?open=1" },
      { key: "b", label: "Check this change", hint: "Ready to check", href: "/requests?open=2" },
    ];
    const html = await renderHome(home({ kind: "building", dueAt: null }, { attention }));
    expect(html).toContain("We need one thing from you");
    expect(html).toContain("Accept a quote: Add the root canal price");
    expect(html).toContain("One more is waiting after it.");
    expect(html).toContain('href="/requests?open=1"');
    expect(html).not.toContain("Nothing needed from you right now");
  });

  it("puts the preview on the Website page, and shows the kickoff notes when staff wrote some", async () => {
    const html = await renderHome(home({ kind: "preview_ready" }, { kickoffNotes: "Five pages, call to book." }));
    expect(html).toContain("Your website is ready to review");
    expect(html).toContain('href="/website"');
    expect(html).toContain("Five pages, call to book.");
  });
});

describe("a month in", () => {
  const overview = {
    results: [{ service: "website", figure: "32", headline: "enquiries from your website", detail: "Up from 21" }],
    activity: [{ key: "a", at: new Date("2026-10-28T08:00:00Z"), label: "Opening hours updated", service: "website" }],
    nextPayment: { date: new Date("2026-11-28T00:00:00Z"), amount: "₹11,699" },
    requests: [],
    todo: [],
  } as never;

  it("shows the measured figures, what was done and the next payment, and no health badge", async () => {
    const html = await renderHome(home({ kind: "ongoing" }, { overview }));
    expect(html).toContain("so far");
    expect(html).toContain("enquiries from your website");
    expect(html).toContain("Opening hours updated");
    expect(html).toContain("₹11,699");
    expect(html).not.toMatch(/Healthy|Last checked/);
  });

  it("says figures appear once measured, rather than showing a zero", async () => {
    const html = await renderHome(home({ kind: "ongoing" }, { overview: { ...(overview as object), results: [] } as never }));
    expect(html).toContain("We never show a zero for something we have not counted.");
  });

  it("greets a site in its first week with its address and a way to visit it", async () => {
    const html = await renderHome(home({ kind: "launched", hostname: "sharma.in" }, { overview }));
    expect(html).toContain("Your website is live");
    expect(html).toContain("https://sharma.in");
  });
});
