import { NO_ANSWERS } from "@brandbasket/shared/lib/intake/questions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomer } from "@/lib/guards";
import { continueToCheckoutAction, saveAnswerAction, toggleServiceAction } from "./actions";
import { VIEWER_MESSAGE } from "./rules";
import { completeIntake, loadIntake, saveIntakeAnswer, saveIntakeServices } from "./server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("@/lib/guards", () => ({ requireCustomer: vi.fn() }));
vi.mock("./server", () => ({ completeIntake: vi.fn(), loadIntake: vi.fn(), saveIntakeAnswer: vi.fn(), saveIntakeServices: vi.fn() }));

const TENANT = { userId: "user-1", businessId: "biz-1", businessName: "Apex", role: "owner" } as const;

function form(entries: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const each of typeof value === "string" ? [value] : value) data.append(key, each);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCustomer).mockResolvedValue({ tenant: TENANT, role: "owner" } as never);
  vi.mocked(loadIntake).mockResolvedValue({ answers: { ...NO_ANSWERS, businessType: "clinic" }, completedAt: null });
});

describe("the questions' actions run the guard first", () => {
  it("writes nothing when the guard turns the person away", async () => {
    vi.mocked(requireCustomer).mockRejectedValue(new Error("redirect:/login"));
    await expect(saveAnswerAction(null, form({ field: "businessType", value: "clinic" }))).rejects.toThrow("redirect:/login");
    await expect(toggleServiceAction(null, form({ toggle: "digital-growth" }))).rejects.toThrow("redirect:/login");
    await expect(continueToCheckoutAction(null, form({}))).rejects.toThrow("redirect:/login");
    expect(saveIntakeAnswer).not.toHaveBeenCalled();
    expect(saveIntakeServices).not.toHaveBeenCalled();
    expect(completeIntake).not.toHaveBeenCalled();
  });

  it("refuses a viewer in words, and writes nothing", async () => {
    vi.mocked(requireCustomer).mockResolvedValue({ tenant: { ...TENANT, role: "viewer" }, role: "viewer" } as never);
    const refused = { ok: false, message: VIEWER_MESSAGE };
    expect(await saveAnswerAction(null, form({ field: "businessType", value: "clinic" }))).toEqual(refused);
    expect(await toggleServiceAction(null, form({ toggle: "digital-growth" }))).toEqual(refused);
    expect(await continueToCheckoutAction(null, form({}))).toEqual(refused);
    expect(saveIntakeAnswer).not.toHaveBeenCalled();
    expect(saveIntakeServices).not.toHaveBeenCalled();
    expect(completeIntake).not.toHaveBeenCalled();
  });
});

describe("saveAnswerAction", () => {
  it("refuses a form with no question named, and saves nothing", async () => {
    const result = await saveAnswerAction(null, form({ value: "clinic" }));
    expect(result.ok).toBe(false);
    expect(saveIntakeAnswer).not.toHaveBeenCalled();
  });

  it("shows a refused answer beside the question", async () => {
    vi.mocked(saveIntakeAnswer).mockResolvedValue({ kind: "refused", message: "Choose one of the options." });
    expect(await saveAnswerAction(null, form({ field: "businessType", value: "spaceship" }))).toEqual({ ok: false, message: "Choose one of the options." });
  });

  it("saves the answer for the business in the session, on the basket's catalogue ids, then moves on", async () => {
    vi.mocked(saveIntakeAnswer).mockResolvedValue({ kind: "saved" });
    await expect(saveAnswerAction(null, form({ field: "businessType", value: "clinic", services: "managed-website,nonsense" }))).rejects.toThrow(/^redirect:\/start\?services=managed-website&q=/);
    expect(saveIntakeAnswer).toHaveBeenCalledWith(TENANT, { field: "businessType", values: ["clinic"], services: ["managed-website"], now: expect.any(Date) });
  });

  it("passes every value of a multi-choice answer", async () => {
    vi.mocked(saveIntakeAnswer).mockResolvedValue({ kind: "saved" });
    await expect(saveAnswerAction(null, form({ field: "socialChannels", value: ["instagram", "facebook"], services: "digital-growth" }))).rejects.toThrow(/redirect:/);
    expect(vi.mocked(saveIntakeAnswer).mock.calls[0]?.[1].values).toEqual(["instagram", "facebook"]);
  });
});

describe("the basket", () => {
  it("adds a service and stays on the summary", async () => {
    await expect(toggleServiceAction(null, form({ services: "managed-website", toggle: "local-seo-aeo" }))).rejects.toThrow("redirect:/start?services=managed-website,local-seo-aeo&q=summary");
    expect(saveIntakeServices).toHaveBeenCalledWith(TENANT, ["managed-website", "local-seo-aeo"], expect.any(Date));
  });

  it("never empties the basket", async () => {
    await expect(toggleServiceAction(null, form({ services: "digital-growth", toggle: "digital-growth" }))).rejects.toThrow("redirect:/start?services=digital-growth&q=summary");
  });

  it("finishes the questions and opens the checkout on the basket", async () => {
    await expect(continueToCheckoutAction(null, form({ services: "managed-website,digital-growth" }))).rejects.toThrow("redirect:/checkout?services=managed-website,digital-growth");
    expect(completeIntake).toHaveBeenCalledWith(TENANT, expect.any(Date));
  });
});
