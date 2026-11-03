import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findGoogleConnection, saveGoogleConnection, users } from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { createAccountTokenSource } from "./server/google/account-token";
import { GoogleAccessLost, GoogleUnavailable } from "./server/google/oauth";
import { sealSecret } from "./server/secret-seal";

vi.mock("server-only", () => ({}));

const SECRET = "x".repeat(40);
const STAFF = "gat-staff";
const NOW = new Date("2026-11-03T04:00:00.000Z");
const CREDENTIALS = { clientId: "id", clientSecret: "secret" };

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: STAFF, name: STAFF, email: `${STAFF}@example.com`, emailVerified: true });
  await saveGoogleConnection(dbs.staff.db, { slot: 1, purpose: "read", accountEmail: "official.brandbasket@gmail.com", scopes: ["a"], sealedRefreshToken: sealSecret(SECRET, "refresh-1"), staffUserId: STAFF, now: NOW });
});

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const source = (fetchFn: typeof fetch, onLost?: () => Promise<void>) =>
  createAccountTokenSource(dbs.staff.db, { slot: 1, purpose: "read", authSecret: SECRET, credentials: CREDENTIALS, fetch: fetchFn, now: () => NOW, onLost });

describe("the Google account's token source", () => {
  it("opens the sealed refresh token, asks Google once, and reuses the access token until it nears its end", async () => {
    const fetchFn = reply(200, { access_token: "access-1", expires_in: 3600 });
    const token = source(fetchFn as unknown as typeof fetch);
    expect(await token()).toBe("access-1");
    expect(await token()).toBe("access-1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain("refresh_token=refresh-1");
  });

  it("marks a refused sign-in lost, tells the caller once, and stops asking Google", async () => {
    const fetchFn = reply(400, { error: "invalid_grant" });
    const onLost = vi.fn(async () => undefined);
    await expect(source(fetchFn as unknown as typeof fetch, onLost)()).rejects.toBeInstanceOf(GoogleAccessLost);
    await expect(source(fetchFn as unknown as typeof fetch, onLost)()).rejects.toBeInstanceOf(GoogleAccessLost);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((await findGoogleConnection(dbs.staff.db, 1, "read"))?.status).toBe("access_lost");
  });

  it("leaves the connection alone when Google is only down", async () => {
    await expect(source(reply(503, {}) as unknown as typeof fetch)()).rejects.toBeInstanceOf(GoogleUnavailable);
    expect((await findGoogleConnection(dbs.staff.db, 1, "read"))?.status).toBe("connected");
  });

  it("says plainly when nothing is connected or the secret has changed", async () => {
    await expect(createAccountTokenSource(dbs.staff.db, { slot: 2, purpose: "read", authSecret: SECRET, credentials: CREDENTIALS })()).rejects.toThrow("not connected yet");
    await expect(createAccountTokenSource(dbs.staff.db, { slot: 1, purpose: "read", authSecret: "y".repeat(40), credentials: CREDENTIALS, fetch: reply(200, {}) as unknown as typeof fetch })()).rejects.toThrow("cannot be read");
  });
});
