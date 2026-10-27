import { ProjectNotAwaitingResponseError } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getStaffDb } from "@/lib/server/db";
import { respondToPreview } from "@/lib/server/project-response";
import { approvePreviewAction, askForChangesAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@brandbasket/db", () => {
  class ProjectNotAwaitingResponseError extends Error {}
  return { ProjectNotAwaitingResponseError };
});
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/project-response", () => ({ respondToPreview: vi.fn() }));

const staffDb = { name: "staff-db" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant } as never);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(respondToPreview).mockResolvedValue(undefined);
});

describe("approvePreviewAction", () => {
  it("approves for the session's business only and goes back with the approved notice", async () => {
    await expect(approvePreviewAction()).rejects.toThrow("REDIRECT:/website?response=approved");
    expect(respondToPreview).toHaveBeenCalledWith(staffDb, { businessId: "business-1", businessName: "Cafe", response: { kind: "approve" } }, expect.any(Date));
  });

  it("goes back with the not-ready notice when no preview is waiting", async () => {
    vi.mocked(respondToPreview).mockRejectedValue(new ProjectNotAwaitingResponseError("project-1"));
    await expect(approvePreviewAction()).rejects.toThrow("REDIRECT:/website?response=not-ready");
  });

  it("lets any other failure through", async () => {
    vi.mocked(respondToPreview).mockRejectedValue(new Error("db down"));
    await expect(approvePreviewAction()).rejects.toThrow("db down");
  });

  it("stops a customer without access before any write", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(approvePreviewAction()).rejects.toThrow("REDIRECT:/login");
    expect(respondToPreview).not.toHaveBeenCalled();
  });
});

describe("askForChangesAction", () => {
  it("moves the project to revisions and opens the Ask for a change form for the preview", async () => {
    await expect(askForChangesAction()).rejects.toThrow("REDIRECT:/requests/new?kind=website&page=Preview&from=preview");
    expect(respondToPreview).toHaveBeenCalledWith(staffDb, { businessId: "business-1", businessName: "Cafe", response: { kind: "revisions" } }, expect.any(Date));
  });

  it("goes back with the not-ready notice, and opens no form, when no preview is waiting", async () => {
    vi.mocked(respondToPreview).mockRejectedValue(new ProjectNotAwaitingResponseError("project-1"));
    await expect(askForChangesAction()).rejects.toThrow("REDIRECT:/website?response=not-ready");
  });

  it("stops a customer without access before any write", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(askForChangesAction()).rejects.toThrow("REDIRECT:/login");
    expect(respondToPreview).not.toHaveBeenCalled();
  });
});
