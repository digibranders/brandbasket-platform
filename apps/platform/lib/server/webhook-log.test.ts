import { recordWebhookEvent } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "./db";
import { noteWebhook } from "./webhook-log";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ recordWebhookEvent: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));

const DB = { name: "staff" } as unknown as ReturnType<typeof getStaffDb>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(DB);
});

describe("noteWebhook", () => {
  it("records the source, the event read from the source's own field, the result and the body's fingerprint", async () => {
    await noteWebhook("calcom", JSON.stringify({ triggerEvent: "BOOKING_CANCELLED" }), { result: "handled" });
    expect(recordWebhookEvent).toHaveBeenCalledWith(DB, expect.objectContaining({
      source: "calcom",
      eventType: "BOOKING_CANCELLED",
      result: "handled",
      error: null,
      businessId: null,
      bodyBytes: 36,
    }));
  });

  it("passes the reason and the business when it has them", async () => {
    await noteWebhook("oyechats", "{}", { result: "failed", error: "Handler threw Error", businessId: "business-1" });
    expect(recordWebhookEvent).toHaveBeenCalledWith(DB, expect.objectContaining({ eventType: "unknown", error: "Handler threw Error", businessId: "business-1" }));
  });

  it("never throws when the note cannot be written", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(recordWebhookEvent).mockRejectedValue(new Error("no grant"));
    await expect(noteWebhook("razorpay", "{}", { result: "handled" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
