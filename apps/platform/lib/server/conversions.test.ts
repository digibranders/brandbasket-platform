import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "./db";
import { reportFirstPaymentToAds, reportSignUpToAds, retryFailedConversions } from "./conversions";

vi.mock("server-only", () => ({}));
vi.mock("./env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("@brandbasket/db", () => ({
  claimConversionEvent: vi.fn(),
  markConversionEvent: vi.fn(),
  findPaymentAlertBase: vi.fn(async () => null),
  findTaxInvoiceByPaymentId: vi.fn(),
  getSignupAttribution: vi.fn(),
  listRetryableConversionPayments: vi.fn(async () => ["p-1", "p-2"]),
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("reportFirstPaymentToAds", () => {
  it("does nothing, and does not touch the database, while no destination is set up", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "");
    vi.stubEnv("META_PIXEL_ID", "");
    await reportFirstPaymentToAds("p-1");
    expect(getStaffDb).not.toHaveBeenCalled();
  });

  it("looks the payment up when a destination is set up, and a payment it cannot find is not an error", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "G-ABC123");
    vi.stubEnv("GA4_API_SECRET", "s3cret");
    await expect(reportFirstPaymentToAds("p-1")).resolves.toBeUndefined();
    expect(getStaffDb).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("never throws: a bad setting is logged and the payment goes on", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "not-an-id");
    vi.stubEnv("GA4_API_SECRET", "s3cret");
    await expect(reportFirstPaymentToAds("p-1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
  });
});

describe("retryFailedConversions", () => {
  it("reports each payment with a failed send again, and counts them", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "G-ABC123");
    vi.stubEnv("GA4_API_SECRET", "s3cret");
    expect(await retryFailedConversions(new Date())).toEqual({ retried: 2 });
  });

  it("does nothing while no destination is set up", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "");
    vi.stubEnv("META_PIXEL_ID", "");
    expect(await retryFailedConversions(new Date())).toEqual({ retried: 0 });
    expect(getStaffDb).not.toHaveBeenCalled();
  });
});

describe("reportSignUpToAds", () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  const AD = { utmSource: "meta", utmMedium: "paid_social", gaClientId: "123.456", gaSessionId: "1700000001", consentMeasurement: true, consentAdvertising: false } as const;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tells GA4 about a sign-up that came from an ad and allowed measurement", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "G-ABC123");
    vi.stubEnv("GA4_API_SECRET", "s3cret");
    await reportSignUpToAds(AD);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { client_id: string; events: { name: string }[] };
    expect(body.client_id).toBe("123.456");
    expect(body.events[0]?.name).toBe("sign_up");
  });

  it("sends nothing without consent, without a client id, or while GA4 is not set up", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "G-ABC123");
    vi.stubEnv("GA4_API_SECRET", "s3cret");
    await reportSignUpToAds({ ...AD, consentMeasurement: false });
    await reportSignUpToAds({ ...AD, gaClientId: null });
    vi.stubEnv("GA4_API_SECRET", "");
    await reportSignUpToAds(AD);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when Google does not answer", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "G-ABC123");
    vi.stubEnv("GA4_API_SECRET", "s3cret");
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(reportSignUpToAds(AD)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
