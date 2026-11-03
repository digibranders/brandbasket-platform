import { saveGoogleConnection } from "@brandbasket/db";
import { exchangeCode } from "@brandbasket/shared/server/google/oauth";
import { openSecret } from "@brandbasket/shared/server/secret-seal";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { packGoogleFlow } from "@/lib/server/google-flow";
import { getStaffAccess } from "@/lib/server/staff-access";
import { GET } from "./callback/route";
import { POST } from "./connect/route";

vi.mock("server-only", () => ({}));

const SECRET = "s".repeat(40);
const ORIGIN = "https://console.example.in";
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (arg: { name: string }) => void jar.delete(arg.name),
  }),
}));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/env", () => ({
  serverEnv: () => ({
    ADMIN_ORIGIN: ORIGIN,
    BETTER_AUTH_SECRET: SECRET,
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_REDIRECT_URI: `${ORIGIN}/api/google/callback`,
    GOOGLE_ACCOUNT_EMAIL: "Official.Brandbasket@gmail.com",
  }),
}));
vi.mock("@brandbasket/db", async () => ({ ...(await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db")), saveGoogleConnection: vi.fn() }));
vi.mock("@brandbasket/shared/server/google/oauth", async () => ({ ...(await vi.importActual<typeof import("@brandbasket/shared/server/google/oauth")>("@brandbasket/shared/server/google/oauth")), exchangeCode: vi.fn() }));

const granted = (role: string) => ({ kind: "granted", user: { id: "staff-1" }, staff: { role } }) as never;
const connectRequest = (purpose: string, origin = ORIGIN) =>
  new Request(`${ORIGIN}/api/google/connect`, { method: "POST", headers: { origin }, body: new URLSearchParams({ purpose }) });
const flowCookie = (over: Partial<Parameters<typeof packGoogleFlow>[1]> = {}) =>
  packGoogleFlow(SECRET, { purpose: "read", state: "a".repeat(32), verifier: "b".repeat(64), staffId: "staff-1", expiresAt: Date.now() + 60_000, ...over });
const callback = (query: string) => GET(new Request(`${ORIGIN}/api/google/callback?${query}`));
const location = (response: Response): string => response.headers.get("location") ?? "";

beforeEach(() => {
  jar.clear();
  vi.mocked(getStaffAccess).mockResolvedValue(granted("admin"));
  vi.mocked(saveGoogleConnection).mockReset();
  vi.mocked(exchangeCode).mockReset();
});

describe("POST /api/google/connect", () => {
  it("sends an admin to Google with a signed flow cookie", async () => {
    const response = await POST(connectRequest("write"));
    const target = new URL(location(response));
    expect(response.status).toBe(303);
    expect(target.origin).toBe("https://accounts.google.com");
    expect(target.searchParams.get("login_hint")).toBe("official.brandbasket@gmail.com");
    expect(jar.get("bb_google_flow")).toBeTruthy();
  });
  it("refuses another origin, a non admin and an unknown purpose, and sets nothing", async () => {
    expect((await POST(connectRequest("read", "https://evil.example"))).status).toBe(403);
    vi.mocked(getStaffAccess).mockResolvedValue(granted("support"));
    expect((await POST(connectRequest("read"))).status).toBe(403);
    vi.mocked(getStaffAccess).mockResolvedValue(granted("admin"));
    expect((await POST(connectRequest("delete"))).status).toBe(400);
    expect(jar.size).toBe(0);
  });
});

describe("GET /api/google/callback", () => {
  const exchanged = (over: object = {}) => ({ refreshToken: "refresh-xyz", accountEmail: "official.brandbasket@gmail.com", scopes: ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/analytics.readonly"], ...over });

  it("stores the refresh token sealed when the state, account and permissions are right", async () => {
    jar.set("bb_google_flow", flowCookie());
    vi.mocked(exchangeCode).mockResolvedValue(exchanged());
    const response = await callback(`state=${"a".repeat(32)}&code=c`);
    expect(location(response)).toContain("saved=google-connected");
    const saved = vi.mocked(saveGoogleConnection).mock.calls[0]?.[1];
    expect(saved).toMatchObject({ slot: 1, purpose: "read", accountEmail: "official.brandbasket@gmail.com", staffUserId: "staff-1" });
    expect(saved?.sealedRefreshToken).not.toContain("refresh-xyz");
    expect(openSecret(SECRET, saved?.sealedRefreshToken ?? "")).toBe("refresh-xyz");
    expect(jar.has("bb_google_flow")).toBe(false);
  });
  it("stores nothing for a wrong state, no cookie, a cancelled sign-in, another account or a missing permission", async () => {
    jar.set("bb_google_flow", flowCookie());
    expect(location(await callback(`state=${"z".repeat(32)}&code=c`))).toContain("google-failed");
    expect(location(await callback(`state=${"a".repeat(32)}&code=c`))).toContain("google-failed");
    jar.set("bb_google_flow", flowCookie());
    expect(location(await callback(`state=${"a".repeat(32)}&error=access_denied`))).toContain("google-cancelled");
    jar.set("bb_google_flow", flowCookie());
    vi.mocked(exchangeCode).mockResolvedValue(exchanged({ accountEmail: "someone@else.com" }));
    expect(location(await callback(`state=${"a".repeat(32)}&code=c`))).toContain("google-wrong-account");
    jar.set("bb_google_flow", flowCookie());
    vi.mocked(exchangeCode).mockResolvedValue(exchanged({ scopes: ["https://www.googleapis.com/auth/analytics.readonly"] }));
    expect(location(await callback(`state=${"a".repeat(32)}&code=c`))).toContain("google-missing-permission");
    expect(saveGoogleConnection).not.toHaveBeenCalled();
  });
});
