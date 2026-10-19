import { describe, expect, it } from "vitest";
import { testDatabaseName } from "./index";

describe("testDatabaseName", () => {
  it("returns the name for a postgresql:// URL", () => {
    expect(testDatabaseName("postgresql://u@localhost:5432/brandbasket_platform_test")).toBe("brandbasket_platform_test");
  });

  it("rejects a name not ending in _test", () => {
    expect(() => testDatabaseName("postgresql://u@localhost:5432/brandbasket")).toThrow(
      'Refusing to use "brandbasket" for tests: the database name must end with "_test".',
    );
  });

  it("rejects a host query parameter", () => {
    expect(() =>
      testDatabaseName("postgresql://u@localhost:5432/brandbasket_platform_test?host=evil.example.com"),
    ).toThrow("Refusing a test database URL with a host query parameter: it can redirect the connection.");
  });

  it("rejects a socket: URL", () => {
    expect(() => testDatabaseName("socket:/tmp/.s.PGSQL.5432?db=brandbasket_platform_test")).toThrow(
      "Refusing a test database URL that is not postgres:// or postgresql://.",
    );
  });

  it("rejects a malformed URL with a message that does not contain the input", () => {
    const input = "postgres://user:s3cret@[bad";
    expect(() => testDatabaseName(input)).toThrow();
    try {
      testDatabaseName(input);
      throw new Error("expected testDatabaseName to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("s3cret");
    }
  });
});
