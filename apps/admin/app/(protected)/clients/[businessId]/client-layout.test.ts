import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientDetail } from "@brandbasket/db";
import ClientLayout from "./layout";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/clients/biz-1" }));
vi.mock("@/lib/server/staff-access", () => ({
  requireStaffAccess: vi.fn().mockResolvedValue({
    staff: { role: "admin" },
    user: { id: "u-1", name: "Staff User" },
  }),
}));
vi.mock("@/lib/server/client-page", () => ({
  loadClient: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({
  getStaffDb: () => ({ name: "staff-db" }),
}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findLiveBundledAddOns: vi.fn().mockResolvedValue([]),
    findOpenClosureForBusiness: vi.fn().mockResolvedValue(null),
  };
});

import { loadClient } from "@/lib/server/client-page";

const BIZ_ID = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

function mockClientDetail(hasProject: boolean): ClientDetail {
  return {
    businessId: BIZ_ID,
    businessName: "Kestrel Bakery",
    owner: { id: "u-2", name: "Priya Sharma", email: "priya@example.com", phone: null },
    currency: "INR",
    tier: "starter",
    tierSetManually: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    completedSteps: [],
    billing: { subscription: null, firstPayment: null },
    movingTo: null,
    project: hasProject
      ? {
          id: "p-1",
          status: "building",
          onboardingSubmittedAt: null,
          slaDueAt: null,
          previewUrl: null,
          previewSentAt: null,
          revisionRoundsGranted: 1,
          launchedAt: null,
          createdAt: new Date("2026-10-01T00:00:00Z"),
        }
      : null,
  } as unknown as ClientDetail;
}

describe("ClientLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the website pipeline stage track when the client has a website project", async () => {
    vi.mocked(loadClient).mockResolvedValue(mockClientDetail(true));
    const markup = renderToStaticMarkup(
      await ClientLayout({
        params: Promise.resolve({ businessId: BIZ_ID }),
        children: createElement("div", null, "Child content"),
      }),
    );

    expect(markup).toContain("Kestrel Bakery");
    expect(markup).toContain('aria-label="Journey:');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Website");
  });

  it("hides the website pipeline stage track when the client has no website project", async () => {
    vi.mocked(loadClient).mockResolvedValue(mockClientDetail(false));
    const markup = renderToStaticMarkup(
      await ClientLayout({
        params: Promise.resolve({ businessId: BIZ_ID }),
        children: createElement("div", null, "Child content"),
      }),
    );

    expect(markup).toContain("Kestrel Bakery");
    expect(markup).not.toContain('aria-label="Journey:');
  });
});
