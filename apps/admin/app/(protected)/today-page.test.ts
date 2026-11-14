import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({
  requireStaffAccess: vi.fn().mockResolvedValue({
    user: { id: "u-1", name: "Aarav Sharma" },
    staff: { role: "admin" },
  }),
}));
vi.mock("@/lib/server/staff-access-log", () => ({
  logStaffAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/server/today", () => ({
  loadTodayPage: vi.fn().mockResolvedValue({
    items: [
      {
        key: "late-1",
        kind: "payment",
        href: "/clients/c-1/billing",
        title: "Payment past due: Bakery",
        detail: "Renewal failed",
        dueAt: new Date("2026-11-14T08:00:00Z"),
      },
      {
        key: "today-1",
        kind: "request",
        href: "/support/s-1",
        title: "Change hours",
        detail: "R-01",
        dueAt: new Date("2026-11-14T12:00:00Z"),
      },
      {
        key: "future-1",
        kind: "signup",
        href: "/leads/l-1",
        title: "Signed up, not paid: Cafe",
        detail: "New",
        dueAt: null,
      },
    ],
    failed: [],
    figures: [],
    calls: [],
    systems: [{ key: "email", label: "Email", state: "ok", detail: "operational" }],
    pendingKickoffs: [],
    activeClientsCount: 42,
  }),
}));

describe("TodayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the 4 StatTiles with correct labels and values", async () => {
    const markup = renderToStaticMarkup(await TodayPage());

    expect(markup).toContain("Late tasks");
    expect(markup).toContain("Due today");
    expect(markup).toContain("On track");
    expect(markup).toContain("Active clients");
    expect(markup).toContain("42");
  });

  it("renders the prioritized task list with Late items first", async () => {
    const markup = renderToStaticMarkup(await TodayPage());

    expect(markup).toContain("Needs someone");
    expect(markup).toContain("Late items first");
    expect(markup).toContain("Payment past due: Bakery");
    expect(markup).toContain("Change hours");
  });

  it("renders the Systems section", async () => {
    const markup = renderToStaticMarkup(await TodayPage());

    expect(markup).toContain("Systems");
    expect(markup).toContain("Email");
  });
});
