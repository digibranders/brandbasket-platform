import { saveServiceSetup, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadServicesBought } from "@/lib/server/first-look";
import { initialSetupFormState } from "@/lib/service-setup";
import { saveSetupItemAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/first-look", () => ({ loadServicesBought: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@brandbasket/db")>();
  return { ...actual, saveServiceSetup: vi.fn(), withTenantScope: vi.fn() };
});

const tenant = { userId: "user-1", businessId: "business-1" };
const tx = { kind: "tx" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-1" }, tenant, billing: {} } as never);
  vi.mocked(loadServicesBought).mockResolvedValue(["website", "social", "search"]);
  vi.mocked(withTenantScope).mockImplementation((_db, _tenant, run) => run(tx as never));
  vi.mocked(saveServiceSetup).mockResolvedValue(undefined as never);
});

describe("saveSetupItemAction", () => {
  it("throws for an unknown item key and saves nothing", async () => {
    await expect(saveSetupItemAction(initialSetupFormState, form({ key: "passwords", offers: "x" }))).rejects.toThrow("Unknown To do item.");
    expect(saveServiceSetup).not.toHaveBeenCalled();
  });

  it("returns the typed values and saves nothing when an answer is not valid", async () => {
    const state = await saveSetupItemAction(initialSetupFormState, form({ key: "offers", offers: "   " }));
    expect(state).toMatchObject({ status: "error", key: "offers", field: "offers", values: { offers: "   " } });
    expect(saveServiceSetup).not.toHaveBeenCalled();
  });

  it("refuses an item for a service the customer did not buy", async () => {
    vi.mocked(loadServicesBought).mockResolvedValue(["website"]);
    const state = await saveSetupItemAction(initialSetupFormState, form({ key: "offers", offers: "A free check-up" }));
    expect(state).toEqual({
      status: "error",
      key: "offers",
      field: "",
      message: "That item is not part of your plan.",
      values: { offers: "A free check-up" },
    });
    expect(saveServiceSetup).not.toHaveBeenCalled();
  });

  it("saves a good answer for the session's business, revalidates and reports saved", async () => {
    const state = await saveSetupItemAction(initialSetupFormState, form({ key: "offers", offers: "  A free check-up in December  " }));
    expect(state).toEqual({ status: "saved", key: "offers" });
    expect(saveServiceSetup).toHaveBeenCalledTimes(1);
    expect(saveServiceSetup).toHaveBeenCalledWith(tx, {
      businessId: "business-1",
      service: "social",
      answers: { offers: "A free check-up in December" },
      now: expect.any(Date),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/todo");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("ignores extra form fields: the business is the session's and the service comes from the key", async () => {
    await saveSetupItemAction(initialSetupFormState, form({ key: "offers", offers: "Sale", businessId: "other", service: "search", extra: "x" }));
    expect(saveServiceSetup).toHaveBeenCalledWith(tx, expect.objectContaining({ businessId: "business-1", service: "social", answers: { offers: "Sale" } }));
    expect(withTenantScope).toHaveBeenCalledWith(expect.anything(), tenant, expect.any(Function));
  });

  it("returns a plain error and logs without the answers when the database fails", async () => {
    vi.mocked(saveServiceSetup).mockRejectedValue(new Error("connection lost"));
    const state = await saveSetupItemAction(initialSetupFormState, form({ key: "offers", offers: "Secret offer text" }));
    expect(state).toMatchObject({ status: "error", key: "offers", message: "We could not save that. Please try again.", values: { offers: "Secret offer text" } });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Secret offer text");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
