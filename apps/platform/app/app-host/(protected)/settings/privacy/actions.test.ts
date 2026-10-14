import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearNominee, saveNominee, type Database } from "@firstfold/db";
import { revalidatePath } from "next/cache";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { clearNomineeAction, saveNomineeAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@firstfold/db", () => ({ saveNominee: vi.fn(async () => undefined), clearNominee: vi.fn(async () => true) }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({}) as Database) }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-asha", phone: "+919876543210" } } as never);
});

describe("saveNomineeAction", () => {
  it("names the nominee for the signed-in account, never an account from the form", async () => {
    const result = await saveNomineeAction({ status: "idle" }, form({ name: "Meera Rao", phone: "98114 11111", userId: "user-mallory" }));
    expect(result).toEqual({ status: "saved" });
    expect(saveNominee).toHaveBeenCalledWith(expect.anything(), "user-asha", { name: "Meera Rao", phone: "+919811411111" });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/privacy");
  });

  it("refuses a bad form, and the account's own number, without saving", async () => {
    expect(await saveNomineeAction({ status: "idle" }, form({ name: "", phone: "9811111111" }))).toMatchObject({ status: "error", field: "name" });
    expect(await saveNomineeAction({ status: "idle" }, form({ name: "Me", phone: "98765 43210" }))).toMatchObject({ status: "error", field: "phone" });
    expect(saveNominee).not.toHaveBeenCalled();
  });
});

describe("clearNomineeAction", () => {
  it("removes the signed-in account's nominee", async () => {
    expect(await clearNomineeAction()).toEqual({ status: "cleared" });
    expect(clearNominee).toHaveBeenCalledWith(expect.anything(), "user-asha");
  });
});
