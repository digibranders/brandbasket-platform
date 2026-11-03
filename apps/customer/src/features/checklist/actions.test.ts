import { savePrimaryDomain, saveServiceSetup, ServiceNotFoundError, DomainTakenError } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requirePaid, requireWebsite, type CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { chooseFreeAddressAction, removeImageAction, saveBrandItem, saveBusinessItem, saveDomainItem, saveServicesItem, saveSetupItem } from "./actions";
import { removeOnboardingImage } from "./server/media";
import { saveItemStep } from "./server/steps";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requirePaid: vi.fn(), requireWebsite: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({ name: "app-db" })) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: vi.fn(() => ({ name: "storage" })) }));
vi.mock("./server/media", () => ({ removeOnboardingImage: vi.fn() }));
vi.mock("./server/steps", () => ({ saveItemStep: vi.fn() }));
vi.mock("@brandbasket/db", () => {
  class MockServiceNotFoundError extends Error {}
  class MockDomainTakenError extends Error {}
  return {
    DomainTakenError: MockDomainTakenError,
    DuplicateServiceIdError: class extends Error {},
    ServiceNotFoundError: MockServiceNotFoundError,
    listMediaAssets: vi.fn(),
    replaceBusinessHours: vi.fn(),
    replaceServices: vi.fn(),
    saveBusinessProfile: vi.fn(),
    savePrimaryDomain: vi.fn(),
    saveProjectBrief: vi.fn(),
    saveServiceSetup: vi.fn(),
    updateMediaAltText: vi.fn(),
    withTenantScope: vi.fn(async (_db: unknown, _scope: unknown, work: (tx: unknown) => Promise<unknown>) => work({ name: "tx" })),
  };
});

const TENANT = { userId: "u1", businessId: "b1", businessName: "Bloom", role: "owner" } as const;

function customer(overrides: Partial<CustomerContext> = {}): CustomerContext {
  return { tenant: TENANT, businessId: "b1", role: "owner", services: ["website", "social", "search"], currency: "INR", ...overrides } as unknown as CustomerContext;
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireWebsite).mockResolvedValue(customer());
  vi.mocked(requirePaid).mockResolvedValue(customer());
  vi.mocked(saveItemStep).mockResolvedValue(null);
});

describe("every website action", () => {
  const calls: readonly (readonly [string, () => Promise<unknown>])[] = [
    ["saveBusinessItem", () => saveBusinessItem(form({ displayName: "Bloom", email: "a@b.test" }))],
    ["saveServicesItem", () => saveServicesItem(form({ "services.0.name": "Check-up" }))],
    ["saveBrandItem", () => saveBrandItem(form({}))],
    ["saveDomainItem", () => saveDomainItem(form({ domain: "bloom.example", ownerConfirmed: "on" }))],
    ["chooseFreeAddressAction", () => chooseFreeAddressAction(form({ name: "bloom-dental" }))],
    ["removeImageAction", () => removeImageAction("0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d00")],
  ];

  it.each(calls)("%s asks for the website and a paid period running now", async (_name, run) => {
    await run();
    expect(requireWebsite).toHaveBeenCalledWith({ write: true });
  });

  it.each(calls)("%s gives a viewer no write: nothing is saved", async (_name, run) => {
    vi.mocked(requireWebsite).mockResolvedValue(customer({ role: "viewer" }));
    expect(await run()).toEqual({ ok: false, message: "Only the owner or an editor can change this." });
    expect(saveItemStep).not.toHaveBeenCalled();
    expect(removeOnboardingImage).not.toHaveBeenCalled();
  });
});

describe("saveBusinessItem", () => {
  it("returns the first problem under its field and saves nothing", async () => {
    const result = await saveBusinessItem(form({ displayName: "", email: "a@b.test" }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { displayName: "Tell us your business name." } });
    expect(saveItemStep).not.toHaveBeenCalled();
  });

  it("needs a phone or an email, so the item is never done without a way to reach the customer", async () => {
    expect(await saveBusinessItem(form({ displayName: "Bloom" }))).toMatchObject({
      ok: false,
      fieldErrors: { phone: "Add a phone number or an email your customers can use." },
    });
    expect(saveItemStep).not.toHaveBeenCalled();
  });

  it("saves the business step in one transaction and refreshes the pages that show progress", async () => {
    expect(await saveBusinessItem(form({ displayName: "Bloom", email: "a@b.test" }))).toEqual({ ok: true });
    expect(saveItemStep).toHaveBeenCalledWith(expect.anything(), TENANT, "business", expect.any(Function));
    expect(revalidatePath).toHaveBeenCalledWith("/checklist");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("shows the locked notice a refused save returns, and does not refresh", async () => {
    vi.mocked(saveItemStep).mockResolvedValue({ message: "Locked.", field: null });
    expect(await saveBusinessItem(form({ displayName: "Bloom", email: "a@b.test" }))).toEqual({ ok: false, message: "Locked." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure and says to try again, never that it saved", async () => {
    vi.mocked(saveItemStep).mockRejectedValue(new Error("connection refused"));
    expect(await saveBusinessItem(form({ displayName: "Bloom", email: "a@b.test" }))).toEqual({ ok: false, message: "We could not save that. Please try again." });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "checklist.business" });
  });
});

describe("saveServicesItem", () => {
  it("asks for at least one service", async () => {
    expect(await saveServicesItem(form({}))).toMatchObject({ ok: false, message: "Add at least one service." });
  });

  it("asks for a reload when a service id is stale", async () => {
    vi.mocked(saveItemStep).mockImplementation(async (_db, _tenant, _step, _work, describe) => describe?.(new ServiceNotFoundError("s1")) ?? null);
    expect(await saveServicesItem(form({ "services.0.name": "Check-up" }))).toEqual({
      ok: false,
      message: "Your list of services has changed since this page loaded. Reload the page and try again.",
    });
  });
});

describe("saveDomainItem", () => {
  it("refuses one of our own hosts", async () => {
    expect(await saveDomainItem(form({ domain: "app.brandbasket.in", ownerConfirmed: "on" }))).toMatchObject({
      ok: false,
      message: "That address belongs to us. Enter your own domain.",
    });
    expect(saveItemStep).not.toHaveBeenCalled();
  });

  it("needs the ownership box ticked", async () => {
    expect(await saveDomainItem(form({ domain: "bloom.example" }))).toMatchObject({ ok: false, fieldErrors: { ownerConfirmed: expect.any(String) } });
  });

  it("never says which business holds a taken domain", async () => {
    vi.mocked(saveItemStep).mockImplementation(async (_db, _tenant, _step, _work, describe) => describe?.(new DomainTakenError("bloom.example")) ?? null);
    const result = await saveDomainItem(form({ domain: "bloom.example", ownerConfirmed: "on" }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { domain: expect.stringContaining("already connected to another website") } });
    expect(JSON.stringify(result)).not.toContain("Bloom");
  });

  it("saves the domain with the owner's confirmation stamped", async () => {
    vi.mocked(saveItemStep).mockImplementation(async (_db, _tenant, _step, work) => work({} as never, {} as never));
    expect(await saveDomainItem(form({ domain: "https://www.Bloom.example/contact", ownerConfirmed: "on" }))).toEqual({ ok: true });
    expect(savePrimaryDomain).toHaveBeenCalledWith(expect.anything(), { hostname: "bloom.example", ownerConfirmedAt: expect.any(Date) });
  });
});

describe("chooseFreeAddressAction", () => {
  it("is not offered when the deployment names no base domain", async () => {
    expect(await chooseFreeAddressAction(form({ name: "bloom-dental" }))).toMatchObject({ ok: false, message: expect.stringContaining("free address") });
    expect(saveItemStep).not.toHaveBeenCalled();
  });
});

describe("removeImageAction", () => {
  it("refuses an id that is not a uuid before touching the database", async () => {
    expect(await removeImageAction("not-an-id")).toEqual({ ok: false, message: "Reload the page and try again." });
    expect(removeOnboardingImage).not.toHaveBeenCalled();
  });

  it("passes the refusal of the removal on", async () => {
    vi.mocked(removeOnboardingImage).mockResolvedValue({ ok: false, message: "Already removed." });
    expect(await removeImageAction("0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d00")).toEqual({ ok: false, message: "Already removed." });
  });
});

describe("saveSetupItem", () => {
  const BUDGET = { key: "budget", adBudgetRupees: "5,000", adArea: "4 km around the clinic" };

  it("asks for a paid period running now", async () => {
    await saveSetupItem(form(BUDGET));
    expect(requirePaid).toHaveBeenCalledWith({ write: true });
  });

  it("only takes the items the checklist asks for", async () => {
    expect(await saveSetupItem(form({ key: "offers", offers: "A free check-up" }))).toMatchObject({ ok: false });
    expect(await saveSetupItem(form({}))).toMatchObject({ ok: false });
    expect(saveServiceSetup).not.toHaveBeenCalled();
  });

  it("gives a viewer no write", async () => {
    vi.mocked(requirePaid).mockResolvedValue(customer({ role: "viewer" }));
    expect(await saveSetupItem(form(BUDGET))).toEqual({ ok: false, message: "Only the owner or an editor can change this." });
    expect(saveServiceSetup).not.toHaveBeenCalled();
  });

  it("returns the answer's own problem under its field", async () => {
    expect(await saveSetupItem(form({ ...BUDGET, adBudgetRupees: "lots" }))).toMatchObject({ ok: false, fieldErrors: { adBudgetRupees: expect.any(String) } });
  });

  it("refuses an item whose service is not on the plan", async () => {
    vi.mocked(requirePaid).mockResolvedValue(customer({ services: ["website"] }));
    expect(await saveSetupItem(form(BUDGET))).toEqual({ ok: false, message: "That item is not part of your plan." });
    expect(saveServiceSetup).not.toHaveBeenCalled();
  });

  it("saves the answers for the item's service from the session's business", async () => {
    expect(await saveSetupItem(form({ ...BUDGET, businessId: "someone-else" }))).toEqual({ ok: true });
    expect(saveServiceSetup).toHaveBeenCalledWith(expect.anything(), {
      businessId: "b1",
      service: "social",
      answers: { adBudgetRupees: 5000, adArea: "4 km around the clinic" },
      now: expect.any(Date),
    });
  });
});

describe("saveBrandItem", () => {
  it("marks the brand step through the one transaction", async () => {
    expect(await saveBrandItem(form({}))).toEqual({ ok: true });
    expect(saveItemStep).toHaveBeenCalledWith(expect.anything(), TENANT, "brand", expect.any(Function));
  });
});
