import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertCustomerAppRole = vi.fn();
const mockGetAppDb = vi.fn(() => ({ id: "mock-db" }));
const mockServerEnv = vi.fn();
const mockStartBillingErrorAlerts = vi.fn();

vi.mock("@brandbasket/db", () => ({
  assertCustomerAppRole: (...args: unknown[]) => mockAssertCustomerAppRole(...args),
}));

vi.mock("./lib/db", () => ({
  getAppDb: () => mockGetAppDb(),
}));

vi.mock("./lib/env", () => ({
  serverEnv: () => mockServerEnv(),
}));

vi.mock("./platform/lib/server/teams", () => ({
  startBillingErrorAlerts: () => mockStartBillingErrorAlerts(),
}));

vi.mock("./sentry.server.config", () => ({}));
vi.mock("./sentry.edge.config", () => ({}));

describe("apps/customer instrumentation register", () => {
  const originalRuntime = process.env.NEXT_RUNTIME;
  const originalNodeEnv = process.env.NODE_ENV;

  const setNodeEnv = (value: string | undefined) => {
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  afterEach(() => {
    process.env.NEXT_RUNTIME = originalRuntime;
    setNodeEnv(originalNodeEnv);
  });

  it("checks database role on startup in production", async () => {
    setNodeEnv("production");
    mockAssertCustomerAppRole.mockResolvedValueOnce(undefined);

    const { register } = await import("./instrumentation");
    await register();

    expect(mockGetAppDb).toHaveBeenCalledTimes(1);
    expect(mockAssertCustomerAppRole).toHaveBeenCalledWith({ id: "mock-db" });
  });

  it("skips database role check outside production", async () => {
    setNodeEnv("development");

    const { register } = await import("./instrumentation");
    await register();

    expect(mockAssertCustomerAppRole).not.toHaveBeenCalled();
  });

  it("fails loudly and propagates error when database role check fails in production", async () => {
    setNodeEnv("production");
    const roleError = new Error('Customer database connection role mismatch: expected role "bb_app", but connected as "postgres". Failing startup.');
    mockAssertCustomerAppRole.mockRejectedValueOnce(roleError);

    const { register } = await import("./instrumentation");
    await expect(register()).rejects.toThrow('Customer database connection role mismatch: expected role "bb_app", but connected as "postgres". Failing startup.');
  });
});
