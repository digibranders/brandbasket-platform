import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ClientPeoplePage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({}) }));
vi.mock("@/lib/server/client-page", () => ({
  openClientTab: async () => ({
    granted: { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "admin" } },
    client: { businessId: "01a0f71b-8402-7d48-a90a-207e8c8a882c", name: "Acme Corp" },
  }),
}));
vi.mock("@brandbasket/db", () => ({
  listBusinessMembersForStaff: async () => [
    { userId: "u1", name: "Alice", email: "alice@example.com", phone: null, role: "owner", joinedAt: new Date("2026-01-01T00:00:00.000Z") },
  ],
  findOpenClosureForBusiness: async () => ({
    id: "closure-1",
    businessId: "01a0f71b-8402-7d48-a90a-207e8c8a882c",
    userId: "u1",
    requestedAt: new Date("2026-02-01T00:00:00.000Z"),
    eraseAfter: new Date("2026-03-03T00:00:00.000Z"),
  }),
}));

describe("ClientPeoplePage", () => {
  it("renders leaving section with confirm dialog for restore account", async () => {
    const page = await ClientPeoplePage({
      params: Promise.resolve({ businessId: "01a0f71b-8402-7d48-a90a-207e8c8a882c" }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Restore account");
    expect(html).toContain("Restore closing account");
    expect(html).toContain("The account will be restored and deletion cancelled.");
    expect(html).toContain('name="confirm"');
    expect(html).toContain('value="yes"');
  });
});
