import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeamsMessage } from "../lib/teams-webhook";
import { BILLING_ALERT_DEBOUNCE_MS, registerBillingErrorAlerts } from "./billing-error-alerts";
import { logBillingEvent, onBillingError } from "./billing-log";

vi.mock("server-only", () => ({}));

const BUSINESS = "7b0a2c1e-5d4f-4a6b-9c8d-1e2f3a4b5c6d";
const ORIGIN = "https://console.example";

afterEach(() => {
  onBillingError(() => undefined);
  vi.restoreAllMocks();
});

function silenceLog() {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
}

describe("registerBillingErrorAlerts", () => {
  it("sends a card for an error line, linking the client, and ignores lines below error", async () => {
    silenceLog();
    const send = vi.fn(async (_message: TeamsMessage) => undefined);
    registerBillingErrorAlerts(send, ORIGIN);

    logBillingEvent("warn", "confirmation-refused", { businessId: BUSINESS });
    logBillingEvent("info", "tax-invoice-issued", { businessId: BUSINESS });
    expect(send).not.toHaveBeenCalled();

    logBillingEvent("error", "tax-invoice-failed", { businessId: BUSINESS, errorName: "Error", pgCode: "23514" });
    expect(send).toHaveBeenCalledTimes(1);
    const card = JSON.stringify(send.mock.calls[0]?.[0]);
    expect(card).toContain("Billing error: tax-invoice-failed");
    expect(card).toContain("could not be issued");
    expect(card).toContain(`${ORIGIN}/clients/${BUSINESS}`);
    expect(card).toContain("23514");
  });

  it("tells the same error for the same business once in five minutes, and again after", () => {
    silenceLog();
    let clock = 1_000_000;
    const send = vi.fn(async (_message: TeamsMessage) => undefined);
    registerBillingErrorAlerts(send, ORIGIN, () => clock);

    logBillingEvent("error", "webhook-processing-failed", { businessId: BUSINESS, reason: "payment" });
    clock += BILLING_ALERT_DEBOUNCE_MS - 1;
    logBillingEvent("error", "webhook-processing-failed", { businessId: BUSINESS, reason: "payment" });
    expect(send).toHaveBeenCalledTimes(1);

    logBillingEvent("error", "webhook-processing-failed", { businessId: BUSINESS, reason: "renewal" });
    expect(send).toHaveBeenCalledTimes(2);

    clock += 2;
    logBillingEvent("error", "webhook-processing-failed", { businessId: BUSINESS, reason: "payment" });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("sends no client link when the error names no real business", () => {
    silenceLog();
    const send = vi.fn(async (_message: TeamsMessage) => undefined);
    registerBillingErrorAlerts(send, ORIGIN);
    logBillingEvent("error", "checkout-orphaned", { businessId: "unknown" });
    expect(JSON.stringify(send.mock.calls[0]?.[0])).not.toContain("Open the client");
  });

  it("never lets a failing alert break the code that logged", () => {
    silenceLog();
    registerBillingErrorAlerts(() => {
      throw new Error("Teams is down");
    }, ORIGIN);
    expect(() => logBillingEvent("error", "tax-invoice-failed", { businessId: BUSINESS })).not.toThrow();
    registerBillingErrorAlerts(() => Promise.reject(new Error("Teams is down")), ORIGIN);
    expect(() => logBillingEvent("error", "provider-cancel-failed", { businessId: BUSINESS })).not.toThrow();
  });
});
