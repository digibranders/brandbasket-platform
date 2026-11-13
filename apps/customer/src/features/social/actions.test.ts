import { approveDeliverables, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireService } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { approvePostsAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@/lib/guards", () => ({ requireService: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  class DeliverableError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { DeliverableError, approveDeliverables: vi.fn(), withTenantScope: vi.fn() };
});

const A = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const B = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";
const tenant = { userId: "u", businessId: "business-1", businessName: "Cafe", role: "owner" };
const owner = { tenant, businessId: "business-1", role: "owner" } as never;
const viewer = { tenant, businessId: "business-1", role: "viewer" } as never;
const tx = { name: "tx" } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireService).mockResolvedValue(owner);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work(tx));
});

describe("approvePostsAction", () => {
  it("needs Social & Ads bought and a paid period running now, and approves for the session's business with the existing function", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(2);

    const result = await approvePostsAction([A, B]);

    expect(requireService).toHaveBeenCalledWith("social", { write: true });
    expect(withTenantScope).toHaveBeenCalledWith({ name: "app-db" }, tenant, expect.any(Function));
    expect(approveDeliverables).toHaveBeenCalledWith(tx, [A, B]);
    expect(result).toEqual({ ok: true, data: { outcome: "approved", approved: 2 } });
    expect(revalidatePath).toHaveBeenCalledWith("/social", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("sends each post once", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(1);
    await approvePostsAction([A, A]);
    expect(approveDeliverables).toHaveBeenCalledWith(tx, [A]);
  });

  it("says changed, not approved, when fewer posts were approved than were shown", async () => {
    vi.mocked(approveDeliverables).mockResolvedValue(1);
    expect(await approvePostsAction([A, B])).toEqual({ ok: true, data: { outcome: "changed", approved: 1 } });
  });

  it("refuses a viewer before touching the database", async () => {
    vi.mocked(requireService).mockResolvedValue(viewer);
    expect(await approvePostsAction([A])).toEqual({ ok: false, message: "Only owners and editors can change this." });
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("refuses no posts, a bad id and more than 50 posts", async () => {
    for (const ids of [[], ["nope"], Array.from({ length: 51 }, (_, index) => `0199a1b2-c3d4-7e5f-8a9b-${String(index).padStart(12, "0")}`)]) {
      expect((await approvePostsAction(ids)).ok).toBe(false);
    }
    expect(approveDeliverables).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers in plain words when the database does not know the posts", async () => {
    const { DeliverableError } = await import("@brandbasket/db");
    vi.mocked(approveDeliverables).mockRejectedValue(new DeliverableError("not_found", "no"));
    expect(await approvePostsAction([A])).toEqual({ ok: false, message: "We could not find those posts." });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure and tells the customer to try again, without refreshing the page as if it worked", async () => {
    vi.mocked(approveDeliverables).mockRejectedValue(new Error("connection refused"));
    expect(await approvePostsAction([A])).toEqual({ ok: false, message: "We could not save that. Try again." });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "social.approve" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
