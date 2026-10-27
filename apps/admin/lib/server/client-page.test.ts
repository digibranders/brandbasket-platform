import { findClientDetail, type ClientDetail } from "@brandbasket/db";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { requireStaffCan } from "@/lib/server/staff-role";
import { openClientTab } from "./client-page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ findClientDetail: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as unknown as GrantedStaff;
const CLIENT = { businessId: BUSINESS, businessName: "Om Sweets" } as unknown as ClientDetail;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(requireStaffCan).mockResolvedValue(STAFF);
  vi.mocked(findClientDetail).mockResolvedValue(CLIENT);
  vi.mocked(notFound).mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("openClientTab", () => {
  it("checks access, records the view with the tab, and reads the client", async () => {
    expect(await openClientTab(BUSINESS, "project")).toEqual({ granted: STAFF, client: CLIENT });
    expect(requireStaffCan).not.toHaveBeenCalled();
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "client.view", targetType: "business", targetId: BUSINESS, businessId: BUSINESS, detail: "project" });
  });

  it("needs money for Billing", async () => {
    await openClientTab(BUSINESS, "billing");
    expect(requireStaffCan).toHaveBeenCalledWith("money");
    expect(requireStaffAccess).not.toHaveBeenCalled();
  });

  it("records the People tab under its own name and the Overview with no detail", async () => {
    await openClientTab(BUSINESS, "people");
    expect(logStaffAccess).toHaveBeenCalledWith(expect.objectContaining({ action: "client.people_view", detail: "people" }));
    await openClientTab(BUSINESS, "");
    expect(logStaffAccess).toHaveBeenLastCalledWith(expect.objectContaining({ action: "client.view", detail: null }));
  });

  it("is not found for a business that does not exist", async () => {
    vi.mocked(findClientDetail).mockResolvedValue(null);
    await expect(openClientTab("01a0f71b-8402-7d48-a90a-000000000000", "")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
