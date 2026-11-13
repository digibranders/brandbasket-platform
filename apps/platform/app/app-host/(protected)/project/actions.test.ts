import { consumeRateLimit, recordDomainDnsCheck, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOO_MANY_CHECKS_MESSAGE } from "@/lib/connect-domain-state";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { checkDomainDns } from "@/lib/server/domain-check";
import { checkDomainAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  consumeRateLimit: vi.fn(),
  getConnectingDomain: vi.fn(),
  recordDomainDnsCheck: vi.fn(),
  withTenantScope: vi.fn(),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ name: "app-db" })), getStaffDb: vi.fn(() => ({ name: "staff-db" })) }));
vi.mock("@/lib/server/domain-alert", () => ({ notifyTeamDomainConnected: vi.fn() }));
vi.mock("@/lib/server/domain-check", () => ({ checkDomainDns: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant: { businessId: "business-1", businessName: "Cafe" } } as never);
  vi.mocked(withTenantScope).mockResolvedValue({ hostname: "cafe.example.com", status: "dns" } as never);
  vi.mocked(checkDomainDns).mockResolvedValue({ overall: "pending", records: [] } as never);
  vi.mocked(recordDomainDnsCheck).mockResolvedValue({ becameConnected: false } as never);
});

describe("checkDomainAction rate limit", () => {
  it("spends one of 20 hourly lookups for the session's business", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as never);
    expect(await checkDomainAction()).toMatchObject({ status: "checked" });
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.anything(), "domain-check:business:business-1", { limit: 20, windowSeconds: 3600 });
  });

  it("looks nothing up and records nothing once the budget is spent", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 60 } as never);
    expect(await checkDomainAction()).toEqual({ status: "error", message: TOO_MANY_CHECKS_MESSAGE });
    expect(checkDomainDns).not.toHaveBeenCalled();
    expect(recordDomainDnsCheck).not.toHaveBeenCalled();
  });
});
