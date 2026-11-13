import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSignedIn } from "@/lib/guards";
import { startKeepPlanFor } from "../checkout/server/keep-plan";
import { keepPlanAction, restoreAccountAction } from "./actions";
import { findClosingAccount, restoreAccountFor } from "./server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("@/lib/guards", () => ({ requireSignedIn: vi.fn() }));
vi.mock("../checkout/server/keep-plan", () => ({ startKeepPlanFor: vi.fn() }));
vi.mock("./server", () => ({ findClosingAccount: vi.fn(), restoreAccountFor: vi.fn() }));

const USER = { id: "user-1", email: "owner@example.test", name: "Owner", emailConfirmed: true, phone: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSignedIn).mockResolvedValue({ user: USER });
  vi.mocked(findClosingAccount).mockResolvedValue({ user: USER, eraseAfter: new Date("2026-12-01T00:00:00Z") });
});

describe("restore and keep plan", () => {
  it("run the sign-in guard first", async () => {
    vi.mocked(requireSignedIn).mockRejectedValue(new Error("redirect:/login"));
    await expect(restoreAccountAction()).rejects.toThrow("redirect:/login");
    await expect(keepPlanAction()).rejects.toThrow("redirect:/login");
    expect(restoreAccountFor).not.toHaveBeenCalled();
    expect(startKeepPlanFor).not.toHaveBeenCalled();
  });

  it("send an account that is not closing to sign in, touching nothing", async () => {
    vi.mocked(findClosingAccount).mockResolvedValue(null);
    await expect(restoreAccountAction()).rejects.toThrow("redirect:/login");
    await expect(keepPlanAction()).rejects.toThrow("redirect:/login");
    expect(restoreAccountFor).not.toHaveBeenCalled();
  });

  it("restores only the signed-in account's own closure, then goes Home", async () => {
    await expect(restoreAccountAction()).rejects.toThrow("redirect:/");
    expect(restoreAccountFor).toHaveBeenCalledWith("user-1", expect.any(Date));
  });

  it("opens the keep checkout, or comes back with the refusal's mark", async () => {
    vi.mocked(startKeepPlanFor).mockResolvedValueOnce({ kind: "redirect", url: "/restore-account/keep-plan?token=t" });
    await expect(keepPlanAction()).rejects.toThrow("redirect:/restore-account/keep-plan?token=t");
    vi.mocked(startKeepPlanFor).mockResolvedValueOnce({ kind: "refused", reason: "busy" });
    await expect(keepPlanAction()).rejects.toThrow("redirect:/restore-account?keep=busy");
  });
});
