import { ChangeRequestError, moveChangeAsCustomer, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { approveChangeAction, declineQuoteAction, reopenRequestAction } from "./move-actions";

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
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), moveChangeAsCustomer: vi.fn(), withTenantScope: vi.fn() }));

const user = { id: "user-1", name: "Priya Shah", email: "priya@example.com", phone: null };
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role: "owner" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true } } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work({ kind: "tx" } as never));
  vi.mocked(moveChangeAsCustomer).mockResolvedValue("approved");
});

const REQUEST = "0192f3c4-0000-7000-8000-000000000001";
const TICKET = "0192f3c4-0000-7000-8000-000000000002";
const move = (action: (formData: FormData) => Promise<void>, fields: Record<string, string> = { requestId: REQUEST, ticketId: TICKET }) => action(form(fields));

describe("the customer's own moves", () => {
  it.each([
    ["Not now", declineQuoteAction, "decline"],
    ["Looks good", approveChangeAction, "approve"],
    ["Reopen", reopenRequestAction, "reopen"],
  ] as const)("%s makes the move as the signed-in customer's business and returns to the request", async (_name, action, expected) => {
    await expect(move(action)).rejects.toThrow(`redirect:/requests?open=${TICKET}`);
    expect(withTenantScope).toHaveBeenCalledWith({ kind: "app-db" }, tenant, expect.any(Function));
    expect(moveChangeAsCustomer).toHaveBeenCalledWith({ kind: "tx" }, REQUEST, expected);
    expect(revalidatePath).toHaveBeenCalledWith("/requests");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("is a not-found for an id that is not an id, and moves nothing", async () => {
    await expect(move(approveChangeAction, { requestId: "x", ticketId: TICKET })).rejects.toThrow("notFound");
    await expect(move(approveChangeAction, { requestId: REQUEST })).rejects.toThrow("notFound");
    expect(moveChangeAsCustomer).not.toHaveBeenCalled();
  });

  it("says the request has changed when the database refuses the state, and that the 14 days are over when they are", async () => {
    vi.mocked(moveChangeAsCustomer).mockRejectedValue(new ChangeRequestError("wrong_state", "x"));
    await expect(move(approveChangeAction)).rejects.toThrow(`redirect:/requests?open=${TICKET}&notice=changed`);
    vi.mocked(moveChangeAsCustomer).mockRejectedValue(new ChangeRequestError("not_found", "x"));
    await expect(move(approveChangeAction)).rejects.toThrow("&notice=changed");
    vi.mocked(moveChangeAsCustomer).mockRejectedValue(new ChangeRequestError("window_closed", "x"));
    await expect(move(reopenRequestAction)).rejects.toThrow("&notice=window");
  });

  it("logs and says it failed for a fault it did not expect", async () => {
    vi.mocked(moveChangeAsCustomer).mockRejectedValue(new Error("db down"));
    await expect(move(approveChangeAction)).rejects.toThrow("&notice=failed");
    expect(console.error).toHaveBeenCalledWith("[requests] could not move a request", expect.anything());
  });
});
