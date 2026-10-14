import { createDatabase } from "@firstfold/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuth } from "./create-auth";

const ORIGIN = "http://app.localhost:3000";
const VALID_SECRET = "a".repeat(32);
// Creating the handle never connects: the pg Pool only dials out when a query runs.
const UNREACHABLE_DATABASE_URL = "postgresql://nobody@127.0.0.1:1/none";

let originalSecrets: string | undefined;

beforeEach(() => {
  originalSecrets = process.env.BETTER_AUTH_SECRETS;
});

afterEach(() => {
  if (originalSecrets === undefined) delete process.env.BETTER_AUTH_SECRETS;
  else process.env.BETTER_AUTH_SECRETS = originalSecrets;
});

describe("createAuth secret validation", () => {
  it("rejects a secret shorter than 32 characters", async () => {
    const handle = createDatabase(UNREACHABLE_DATABASE_URL);
    try {
      expect(() =>
        createAuth({
          db: handle.db,
          secret: "too-short",
          baseURL: ORIGIN,
          trustedOrigins: [ORIGIN],
          nextCookies: false,
        }),
      ).toThrow("The auth secret must be at least 32 characters.");
    } finally {
      await handle.close();
    }
  });

  it("rejects when BETTER_AUTH_SECRETS is set, even with a valid secret", async () => {
    process.env.BETTER_AUTH_SECRETS = "some-other-secret-that-would-silently-win";
    const handle = createDatabase(UNREACHABLE_DATABASE_URL);
    try {
      expect(() =>
        createAuth({
          db: handle.db,
          secret: VALID_SECRET,
          baseURL: ORIGIN,
          trustedOrigins: [ORIGIN],
          nextCookies: false,
        }),
      ).toThrow("BETTER_AUTH_SECRETS is set and would override the configured auth secret. Unset it.");
    } finally {
      await handle.close();
    }
  });

  it("accepts a 32-character secret with BETTER_AUTH_SECRETS unset", async () => {
    delete process.env.BETTER_AUTH_SECRETS;
    const handle = createDatabase(UNREACHABLE_DATABASE_URL);
    try {
      expect(() =>
        createAuth({
          db: handle.db,
          secret: VALID_SECRET,
          baseURL: ORIGIN,
          trustedOrigins: [ORIGIN],
          nextCookies: false,
        }),
      ).not.toThrow();
    } finally {
      await handle.close();
    }
  });
});

describe("createAuth session lifetime", () => {
  async function lifetimeWith(extra: { readonly sessionLifetimeSeconds?: number }): Promise<number | undefined> {
    const handle = createDatabase(UNREACHABLE_DATABASE_URL);
    try {
      const auth = createAuth({ db: handle.db, secret: VALID_SECRET, baseURL: ORIGIN, trustedOrigins: [ORIGIN], nextCookies: false, ...extra });
      return auth.options.session?.expiresIn;
    } finally {
      await handle.close();
    }
  }

  it("keeps customers signed in for a week unless told otherwise", async () => {
    expect(await lifetimeWith({})).toBe(60 * 60 * 24 * 7);
  });

  it("uses the shorter lifetime it is given, as the staff console does", async () => {
    expect(await lifetimeWith({ sessionLifetimeSeconds: 12 * 60 * 60 })).toBe(12 * 60 * 60);
  });

  it("refuses a lifetime that is not a positive whole number of seconds", async () => {
    await expect(lifetimeWith({ sessionLifetimeSeconds: 0 })).rejects.toThrow("whole number of seconds");
    await expect(lifetimeWith({ sessionLifetimeSeconds: 1.5 })).rejects.toThrow("whole number of seconds");
  });
});
