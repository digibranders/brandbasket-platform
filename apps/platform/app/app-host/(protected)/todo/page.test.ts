import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getLiveWebsite, getProjectOverview } from "@/lib/server/onboarding";
import { getSetupCallState } from "@/lib/server/setup-call";
import { loadTodo } from "@/lib/server/todo";
import TodoPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/onboarding", () => ({ getLiveWebsite: vi.fn(), getProjectOverview: vi.fn() }));
vi.mock("@/lib/server/setup-call", () => ({ getSetupCallState: vi.fn() }));
vi.mock("@/lib/server/todo", () => ({ loadTodo: vi.fn() }));
vi.mock("@/components/todo/todo-list", () => ({ TodoList: () => null }));

const tenant = { userId: "user-1", businessId: "business-1" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadTodo).mockResolvedValue({ services: [], items: [], open: 0, answers: { social: undefined, search: undefined } });
  vi.mocked(getProjectOverview).mockResolvedValue({ project: null, completed: [] } as never);
  vi.mocked(getLiveWebsite).mockResolvedValue(null);
  vi.mocked(getSetupCallState).mockResolvedValue({ url: null, booking: null, readAtMs: 0 });
});

/** What the page hands the list to draw beside it. */
const buildCardOf = (element: ReactElement): ReactElement | null => (element.props as { buildCard: ReactElement | null }).buildCard;

const building = { status: "building", slaDueAt: null, onboardingSubmittedAt: new Date("2026-10-28T05:00:00Z"), previewSentAt: null };

describe("the To do page", () => {
  it("sends an account with no access home and reads nothing", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: false } } as never);

    await expect(TodoPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/");
    expect(loadTodo).not.toHaveBeenCalled();
  });

  it("opens for a paid account", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);

    await expect(TodoPage({ searchParams: Promise.resolve({}) })).resolves.toBeDefined();
    expect(loadTodo).toHaveBeenCalledWith(tenant);
  });

  it("shows the steps from the kickoff call beside the list until the website is being built, the call done once held", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true, hasWebsite: true } } as never);
    vi.mocked(getSetupCallState).mockResolvedValue({
      url: null,
      readAtMs: 0,
      booking: { bookedAtIso: "2026-10-26T05:00:00Z", startsAtIso: "2026-10-27T08:30:00Z", endsAtIso: "2026-10-27T09:00:00Z", heldAtIso: "2026-10-27T09:05:00Z", summary: null },
    });

    const element = await TodoPage({ searchParams: Promise.resolve({}) });
    expect(buildCardOf(element)?.props).toMatchObject({ hasWebsite: true, booked: true, held: true, callStartIso: "2026-10-27T08:30:00Z" });
  });

  it("shows where the build stands beside the list once it is under way", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);
    vi.mocked(getProjectOverview).mockResolvedValue({ project: building, completed: ["business"] } as never);

    const element = await TodoPage({ searchParams: Promise.resolve({}) });
    expect(buildCardOf(element)?.props).toMatchObject({ buildStageIndex: expect.any(Number) });
  });
});
