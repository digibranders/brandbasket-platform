import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@firstfold/shared/lib/access";
import { visitorHandoffResponseSchema } from "@/lib/directory-api";
import { handleVisitorHandoffRequest, type VisitorHandoffDeps } from "./visitor-handoff-request";

const WEBSITE = "https://firstfold.io";
const NOW = new Date("2026-10-13T10:00:00.000Z");
const SESSION = { token: "visitor-token", name: "Anita Rao", phoneHint: "•••• 3210" };

const PHONE_USER: SessionUser = { id: "u1", email: "919820011223@phone.firstfold.invalid", name: "Anita Rao", emailConfirmed: false, phone: "+919820013210" };
const EMAIL_USER: SessionUser = { id: "u2", email: "anita@example.test", name: "Anita Rao", emailConfirmed: true, phone: null };

function deps(overrides: Partial<VisitorHandoffDeps> = {}): VisitorHandoffDeps {
  return {
    websiteOrigin: WEBSITE,
    getSessionUser: vi.fn(async () => PHONE_USER),
    startVisitor: vi.fn(async () => SESSION),
    now: () => NOW,
    ...overrides,
  };
}

function request(method = "GET", headers: Record<string, string> = { origin: WEBSITE }): Request {
  return new Request("https://app.firstfold.io/api/directory-account/visitor", { method, headers });
}

describe("handleVisitorHandoffRequest", () => {
  it("hands a signed-in account with a proven number over as a visitor, readable by the website alone", async () => {
    const d = deps();
    const response = await handleVisitorHandoffRequest(request(), d);

    expect(response.status).toBe(200);
    const body = visitorHandoffResponseSchema.parse(await response.json());
    expect(body).toEqual({ status: "ok", visitor: SESSION });
    expect(d.startVisitor).toHaveBeenCalledWith("+919820013210", "Anita Rao", NOW);
    expect(response.headers.get("access-control-allow-origin")).toBe(WEBSITE);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("is not a visitor, without an error, when nobody is signed in", async () => {
    const d = deps({ getSessionUser: vi.fn(async () => null) });
    const response = await handleVisitorHandoffRequest(request(), d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", visitor: null });
    expect(d.startVisitor).not.toHaveBeenCalled();
  });

  it("is not a visitor for an account that signs in with an email, which holds no proven number", async () => {
    const d = deps({ getSessionUser: vi.fn(async () => EMAIL_USER) });
    const response = await handleVisitorHandoffRequest(request(), d);
    expect(await response.json()).toEqual({ status: "ok", visitor: null });
    expect(d.startVisitor).not.toHaveBeenCalled();
  });

  it("cuts a long name to what a review's name may be, and cleans it", async () => {
    const d = deps({ getSessionUser: vi.fn(async () => ({ ...PHONE_USER, name: `  ${"A".repeat(80)}\u0000  ` })) });
    await handleVisitorHandoffRequest(request(), d);
    expect(d.startVisitor).toHaveBeenCalledWith("+919820013210", "A".repeat(60), NOW);
  });

  it("is not a visitor when the account's name is empty", async () => {
    const d = deps({ getSessionUser: vi.fn(async () => ({ ...PHONE_USER, name: "   " })) });
    const response = await handleVisitorHandoffRequest(request(), d);
    expect(await response.json()).toEqual({ status: "ok", visitor: null });
    expect(d.startVisitor).not.toHaveBeenCalled();
  });

  it("refuses a request from any other site, and never reads the session for it", async () => {
    const d = deps();
    const response = await handleVisitorHandoffRequest(request("GET", { origin: "https://evil.example" }), d);
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(d.getSessionUser).not.toHaveBeenCalled();
    const none = await handleVisitorHandoffRequest(request("GET", {}), d);
    expect(none.status).toBe(403);
  });

  it("answers the browser's preflight for the website only", async () => {
    const ok = await handleVisitorHandoffRequest(request("OPTIONS"), deps());
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(WEBSITE);
    const other = await handleVisitorHandoffRequest(request("OPTIONS", { origin: "https://evil.example" }), deps());
    expect(other.status).toBe(403);
  });

  it("answers only GET", async () => {
    const response = await handleVisitorHandoffRequest(request("POST"), deps());
    expect(response.status).toBe(405);
  });

  it("says so when the visitor account could not be opened, rather than pretending to be signed out", async () => {
    const d = deps({ startVisitor: vi.fn(async () => undefined) });
    const response = await handleVisitorHandoffRequest(request(), d);
    expect(response.status).toBe(500);
    expect(((await response.json()) as { code: string }).code).toBe("failed");
  });
});
