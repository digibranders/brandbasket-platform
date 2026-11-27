import { beforeEach, describe, expect, it, vi } from "vitest";
import { extendPaymentLinkFor, revokePaymentLinkFor } from "@/lib/server/payment-links-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import { cancelPaymentLinkAction, extendPaymentLinkAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));
vi.mock("@/lib/server/payment-links-admin", () => ({ extendPaymentLinkFor: vi.fn(), revokePaymentLinkFor: vi.fn() }));

const LINK = "0194b0a0-0000-7000-8000-0000000000d1";
const DENIED = new Error("redirect:/no-access");
const STAFF = { user: { id: "staff-1" } };
const post = (linkId: string): FormData => {
  const data = new FormData();
  data.set("linkId", linkId);
  return data;
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe.each([
  ["cancel", cancelPaymentLinkAction, revokePaymentLinkFor, "cancelled"],
  ["extend", extendPaymentLinkAction, extendPaymentLinkFor, "extended"],
] as const)("%s", (_name, action, run, doneName) => {
  it("is refused for staff without the money capability, before anything is read or changed", async () => {
    vi.mocked(requireStaffCan).mockRejectedValue(DENIED);
    await expect(action(post(LINK))).rejects.toBe(DENIED);
    expect(requireStaffCan).toHaveBeenCalledWith("money");
    expect(run).not.toHaveBeenCalled();
  });

  it("runs for staff with money and says what happened", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue(STAFF as never);
    vi.mocked(run).mockResolvedValue("done");
    await expect(action(post(LINK))).rejects.toThrow(`redirect:/payment-links?result=${doneName}`);
    expect(run).toHaveBeenCalledWith({ linkId: LINK, staff: STAFF, now: expect.any(Date) });
  });

  it("reports a link that is closed, gone or taken by another open link", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue(STAFF as never);
    vi.mocked(run).mockResolvedValue("not-open");
    await expect(action(post(LINK))).rejects.toThrow("redirect:/payment-links?result=closed");
    vi.mocked(run).mockResolvedValue("business-has-another");
    await expect(action(post(LINK))).rejects.toThrow("redirect:/payment-links?result=another");
  });

  it("treats an id that is not an id as a link that is gone, touching nothing", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue(STAFF as never);
    await expect(action(post("1; drop table"))).rejects.toThrow("redirect:/payment-links?result=gone");
    expect(run).not.toHaveBeenCalled();
  });
});
