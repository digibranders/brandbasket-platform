import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsAreOpen, loadCalls } from "@/lib/server/calls";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSetupServices } from "@/lib/server/first-look";
import { getSetupCallState } from "@/lib/server/setup-call";
import CallsPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/calls", () => ({ callsAreOpen: vi.fn(), loadCalls: vi.fn() }));
vi.mock("@/lib/server/first-look", () => ({ loadSetupServices: vi.fn() }));
vi.mock("@/lib/server/setup-call", () => ({ getSetupCallState: vi.fn() }));
vi.mock("@/components/calls/calls-view", () => ({ CallsView: () => null }));

const user = { id: "user-1", name: "Priya Shah", email: "priya@example.com" };
const tenant = { userId: "user-1", businessId: "business-1" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true } } as never);
  vi.mocked(callsAreOpen).mockResolvedValue(true);
  vi.mocked(loadCalls).mockResolvedValue({ upcoming: [], past: [] });
  vi.mocked(loadSetupServices).mockResolvedValue(["website"]);
  vi.mocked(getSetupCallState).mockResolvedValue({ url: "https://cal.com/brandbasket/call", booking: null, readAtMs: 0 });
});

describe("the Calls page", () => {
  it("sends an account whose first look is not over to Requests, and reads no calls", async () => {
    vi.mocked(callsAreOpen).mockResolvedValue(false);
    await expect(CallsPage()).rejects.toThrow("redirect:/requests");
    expect(loadCalls).not.toHaveBeenCalled();
  });

  it("draws the calls of the signed-in business, with the reasons it may book and its booking page", async () => {
    const page = await CallsPage();
    expect(loadCalls).toHaveBeenCalledWith(tenant, expect.any(Date));
    expect(page.props).toMatchObject({
      upcoming: [],
      past: [],
      bookingUrl: "https://cal.com/brandbasket/call",
      canBook: true,
      options: [
        { value: "website", label: "Website" },
        { value: "billing", label: "Billing" },
        { value: "other", label: "Something else" },
      ],
    });
  });

  it("cannot book for an account with no real email address", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { ...user, email: "919876543210@phone.brandbasket.invalid" }, tenant, billing: { hasAccess: true } } as never);
    expect((await CallsPage()).props).toMatchObject({ canBook: false });
  });
});
