import { afterEach, describe, expect, it, vi } from "vitest";
import { unsubscribeUrl } from "@brandbasket/email";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ suppressEmailAddress: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));

const { readUnsubscribeLink } = await import("./unsubscribe");
const SECRET = "u".repeat(40);

afterEach(() => vi.unstubAllEnvs());

describe("readUnsubscribeLink", () => {
  const link = (): URLSearchParams => new URL(unsubscribeUrl("Owner@Example.in", { secret: SECRET, origin: "https://app.test" }) ?? "").searchParams;

  it("returns the lower case address for a link signed with the secret", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", SECRET);
    const params = link();
    expect(readUnsubscribeLink({ e: params.get("e"), t: params.get("t") })).toBe("owner@example.in");
  });

  it("refuses a changed address, a missing part, and every link when no secret is set", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", SECRET);
    const params = link();
    expect(readUnsubscribeLink({ e: "other@example.in", t: params.get("t") })).toBeNull();
    expect(readUnsubscribeLink({ e: params.get("e"), t: null })).toBeNull();
    expect(readUnsubscribeLink({})).toBeNull();
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    expect(readUnsubscribeLink({ e: params.get("e"), t: params.get("t") })).toBeNull();
  });
});
