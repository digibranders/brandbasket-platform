import { approveDeliverables, DeliverableError, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireBillingAccess } from "@/lib/server/billing";
import { approvePostsAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/server/billing", () => ({ requireBillingAccess: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), approveDeliverables: vi.fn(), withTenantScope: vi.fn() }));

const A = "0192f3c4-0000-7000-8000-00000000000a";
const B = "0192f3c4-0000-7000-8000-00000000000b";
const user = { id: "user-1", name: "Priya Shah", email: "priya@example.com", phone: null };
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role: "owner" };

function form(ids: readonly string[], extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const id of ids) data.append("ids", id);
  for (const [name, value] of Object.entries(extra)) data.set(name, value);
  return data;
}

const manyIds = (count: number): string[] => Array.from({ length: count }, (_, index) => `0192f3c4-0000-7000-8000-${String(index).padStart(12, "0")}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(requireBillingAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true } } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work({ kind: "tx" } as never));
  vi.mocked(approveDeliverables).mockResolvedValue(2);
});

describe("approvePostsAction", () => {
  it("is refused for a visitor who is signed out or has no active plan, and approves nothing", async () => {
    vi.mocked(requireBillingAccess).mockRejectedValue(new Error("redirect:/login"));
    await expect(approvePostsAction(form([A, B]))).rejects.toThrow("redirect:/login");
    expect(approveDeliverables).not.toHaveBeenCalled();
  });

  it.each([
    ["no ids", []],
    ["an id that is not an id", [A, "nope"]],
    ["51 ids", manyIds(51)],
  ])("sends %s back as failed and approves nothing", async (_name, ids) => {
    await expect(approvePostsAction(form(ids))).rejects.toThrow("redirect:/social?notice=failed");
    expect(approveDeliverables).not.toHaveBeenCalled();
  });

  it("accepts 50 ids, and counts a repeated id once", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(50);
    await expect(approvePostsAction(form(manyIds(50)))).rejects.toThrow("redirect:/social?notice=approved");
    vi.mocked(approveDeliverables).mockResolvedValue(2);
    await expect(approvePostsAction(form([A, B, A]))).rejects.toThrow("redirect:/social?notice=approved");
    expect(approveDeliverables).toHaveBeenLastCalledWith({ kind: "tx" }, [A, B]);
  });

  it("says approved when every post was approved, and refreshes both pages", async () => {
    await expect(approvePostsAction(form([A, B]))).rejects.toThrow("redirect:/social?notice=approved");
    expect(approveDeliverables).toHaveBeenCalledWith({ kind: "tx" }, [A, B]);
    expect(revalidatePath).toHaveBeenCalledWith("/social");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("says changed when fewer were approved than were shown", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(1);
    await expect(approvePostsAction(form([A, B]))).rejects.toThrow("redirect:/social?notice=changed");
    expect(revalidatePath).toHaveBeenCalledWith("/social");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("is a not-found for posts the business does not have", async () => {
    vi.mocked(approveDeliverables).mockRejectedValue(new DeliverableError("not_found", "x"));
    await expect(approvePostsAction(form([A]))).rejects.toThrow("notFound");
  });

  it("logs and says failed for a fault it did not expect", async () => {
    vi.mocked(approveDeliverables).mockRejectedValue(new Error("db down"));
    await expect(approvePostsAction(form([A]))).rejects.toThrow("redirect:/social?notice=failed");
    expect(console.error).toHaveBeenCalledWith("[social] could not approve posts", expect.anything());
  });

  it("takes the business from the session, whatever the form says", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(1);
    await expect(approvePostsAction(form([A], { businessId: "business-2" }))).rejects.toThrow("redirect:/social?notice=approved");
    expect(withTenantScope).toHaveBeenCalledWith({ kind: "app-db" }, tenant, expect.any(Function));
  });
});
