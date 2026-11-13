import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/first-payment-check", () => ({ checkFirstPayments: vi.fn(), firstPaymentCheckToken: vi.fn() }));

import { checkFirstPayments, firstPaymentCheckToken } from "@/lib/server/first-payment-check";
import { POST } from "./route";

const TOKEN = "t".repeat(40);
const call = (authorization?: string) =>
  POST(new Request("http://localhost/api/internal/check-first-payments", { method: "POST", headers: authorization === undefined ? {} : { authorization } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/internal/check-first-payments", () => {
  it("answers 503 when the secret is not configured, and checks nothing", async () => {
    vi.mocked(firstPaymentCheckToken).mockReturnValue(null);
    expect((await call(`Bearer ${TOKEN}`)).status).toBe(503);
    expect(checkFirstPayments).not.toHaveBeenCalled();
  });

  it("answers 401 for a missing or wrong secret, and checks nothing", async () => {
    vi.mocked(firstPaymentCheckToken).mockReturnValue(TOKEN);
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"x".repeat(40)}`)).status).toBe(401);
    expect(checkFirstPayments).not.toHaveBeenCalled();
  });

  it("runs the check and returns its report, with 502 when Razorpay could not be asked about a checkout", async () => {
    vi.mocked(firstPaymentCheckToken).mockReturnValue(TOKEN);
    vi.mocked(checkFirstPayments).mockResolvedValueOnce({ checked: 2, found: 1, failed: 0 }).mockResolvedValueOnce({ checked: 1, found: 0, failed: 1 });
    const ok = await call(`Bearer ${TOKEN}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ checked: 2, found: 1, failed: 0 });
    expect((await call(`Bearer ${TOKEN}`)).status).toBe(502);
  });
});
