import { describe, expect, it, vi } from "vitest";
import { createGetSessionUser, type SessionReader } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
// `cache` only dedupes per request; each test builds its own reader, so it is made a pass-through.
vi.mock("react", () => ({ cache: <T,>(fn: T): T => fn }));

const USER = { id: "u1", email: "asha@brandbasket.in", name: "Asha", emailVerified: true };

function reader(session: { secondFactorAt?: Date | null } | null): () => SessionReader {
  return () => ({ api: { getSession: vi.fn(async () => (session === null ? null : { session, user: USER })) } });
}

describe("createGetSessionUser", () => {
  it("returns the user of any session by default", async () => {
    expect(await createGetSessionUser(reader({ secondFactorAt: null }))()).toMatchObject({ id: "u1" });
  });

  it("with requireSecondFactor, ignores a session that never passed the code", async () => {
    const get = createGetSessionUser(reader({ secondFactorAt: null }), { requireSecondFactor: true });
    expect(await get()).toBeNull();
    expect(await createGetSessionUser(reader({}), { requireSecondFactor: true })()).toBeNull();
  });

  it("with requireSecondFactor, returns the user of a session that passed it", async () => {
    const get = createGetSessionUser(reader({ secondFactorAt: new Date() }), { requireSecondFactor: true });
    expect(await get()).toMatchObject({ id: "u1", email: "asha@brandbasket.in" });
  });

  it("returns null with no session", async () => {
    expect(await createGetSessionUser(reader(null), { requireSecondFactor: true })()).toBeNull();
  });
});
