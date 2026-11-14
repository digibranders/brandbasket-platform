import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "./client";
import { assertCustomerAppRole, CUSTOMER_ROLE, verifyStartupDatabaseRole } from "./scope";

describe("assertCustomerAppRole", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("succeeds when current_user matches the expected app role", async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [{ current_user: "bb_app" }] }),
    } as unknown as Database;

    await expect(assertCustomerAppRole(mockDb)).resolves.toBeUndefined();
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when current_user is a privileged or mismatched role", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [{ current_user: "postgres" }] }),
    } as unknown as Database;

    await expect(assertCustomerAppRole(mockDb)).rejects.toThrow(
      'Customer database connection role mismatch: expected role "bb_app", but connected as "postgres". Failing startup.',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Customer database connection role mismatch: expected role "bb_app", but connected as "postgres". Failing startup.',
    );
  });

  it("fails loudly when current_user returns no rows", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Database;

    await expect(assertCustomerAppRole(mockDb)).rejects.toThrow(
      'Customer database connection role mismatch: expected role "bb_app", but connected as "unknown". Failing startup.',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("exports the constant CUSTOMER_ROLE as bb_app", () => {
    expect(CUSTOMER_ROLE).toBe("bb_app");
  });
});

describe("verifyStartupDatabaseRole", () => {
  it("enforces role check when NODE_ENV is production", async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rows: [{ current_user: "bb_app" }] }),
    } as unknown as Database;

    await verifyStartupDatabaseRole(mockDb, { NODE_ENV: "production" });
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  it("skips role check when NODE_ENV is development or test", async () => {
    const mockDb = {
      execute: vi.fn(),
    } as unknown as Database;

    await verifyStartupDatabaseRole(mockDb, { NODE_ENV: "development" });
    await verifyStartupDatabaseRole(mockDb, { NODE_ENV: "test" });
    expect(mockDb.execute).not.toHaveBeenCalled();
  });
});
