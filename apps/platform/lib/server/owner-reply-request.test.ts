import { describe, expect, it, vi } from "vitest";
import type { DirectoryRef } from "@brandbasket/db";
import { handleOwnerAccessRequest, handleOwnerReplyRequest, type OwnerAccessDeps, type OwnerReplyDeps } from "./owner-reply-request";
import type { OwnedBusiness } from "./owner-business";

const WEBSITE = "https://brandbasket.in";
const REVIEW = "0197d9a0-0000-7000-8000-000000000001";
const COMMENT = "0197d9a0-0000-7000-8000-000000000002";
const BUSINESS: DirectoryRef = { placeId: "k7m2q9a", listingKey: "dentists/thane/naupada/smile-dental" };
const NOW = new Date("2026-10-12T10:00:00.000Z");

const OWNER: OwnedBusiness = {
  kind: "owner",
  user: { id: "u1", email: "a@b.test", name: "Anita", emailConfirmed: true, phone: null } as never,
  tenant: { userId: "u1", businessId: "b1", businessName: "Smile Dental", role: "owner" },
  business: BUSINESS,
};

function replyDeps(overrides: Partial<OwnerReplyDeps> = {}): OwnerReplyDeps {
  return {
    websiteOrigin: WEBSITE,
    getOwner: vi.fn(async () => OWNER),
    post: vi.fn(async () => ({ kind: "saved", reply: { id: COMMENT, text: "Thank you.", createdAt: NOW.toISOString(), edited: false } }) as const),
    change: vi.fn(async () => ({ kind: "saved", reply: { id: COMMENT, text: "Thanks!", createdAt: NOW.toISOString(), edited: true } }) as const),
    takeDown: vi.fn(async () => ({ kind: "removed" }) as const),
    now: () => NOW,
    ...overrides,
  };
}

function request(method: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.brandbasket.in/api/directory-owner/replies", {
    method,
    headers: { origin: WEBSITE, "content-type": "application/json", ...headers },
    body: body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("handleOwnerReplyRequest", () => {
  it("posts an owner's answer and says it was created, with the website allowed to read it", async () => {
    const deps = replyDeps();
    const response = await handleOwnerReplyRequest(request("POST", { reviewId: REVIEW, text: "Thank you." }), deps);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "saved", reply: { id: COMMENT, text: "Thank you.", createdAt: NOW.toISOString(), edited: false } });
    expect(response.headers.get("access-control-allow-origin")).toBe(WEBSITE);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deps.post).toHaveBeenCalledWith(OWNER, { reviewId: REVIEW, text: "Thank you." }, NOW);
  });

  it("edits and takes down by comment id", async () => {
    const deps = replyDeps();
    const edited = await handleOwnerReplyRequest(request("PATCH", { commentId: COMMENT, text: "Thanks!" }), deps);
    expect(edited.status).toBe(200);
    expect(deps.change).toHaveBeenCalledWith(OWNER, { commentId: COMMENT, text: "Thanks!" }, NOW);

    const removed = await handleOwnerReplyRequest(request("DELETE", { commentId: COMMENT }), deps);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ status: "removed" });
    expect(deps.takeDown).toHaveBeenCalledWith(OWNER, { commentId: COMMENT }, NOW);
  });

  it("answers the browser's preflight for the website's origin only", async () => {
    const deps = replyDeps();
    const allowed = await handleOwnerReplyRequest(request("OPTIONS", undefined, { "access-control-request-method": "POST" }), deps);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-methods")).toContain("PATCH");

    const refused = await handleOwnerReplyRequest(request("OPTIONS", undefined, { origin: "https://evil.example" }), deps);
    expect(refused.status).toBe(403);
    expect(refused.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses a request from any other origin, or none, before it looks at who is signed in", async () => {
    const deps = replyDeps();
    for (const origin of ["https://evil.example", "https://app.brandbasket.in", "null"]) {
      const response = await handleOwnerReplyRequest(request("POST", { reviewId: REVIEW, text: "Hi" }, { origin }), deps);
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
    const noOrigin = new Request("https://app.brandbasket.in/api/directory-owner/replies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewId: REVIEW, text: "Hi" }),
    });
    expect((await handleOwnerReplyRequest(noOrigin, deps)).status).toBe(403);
    expect(deps.getOwner).not.toHaveBeenCalled();
    expect(deps.post).not.toHaveBeenCalled();
  });

  it("wants JSON, a small body in the contract's shape", async () => {
    const deps = replyDeps();
    expect((await handleOwnerReplyRequest(request("POST", "reviewId=1", { "content-type": "text/plain" }), deps)).status).toBe(415);
    expect((await handleOwnerReplyRequest(request("POST", "{not json"), deps)).status).toBe(400);
    expect((await handleOwnerReplyRequest(request("POST", { reviewId: "nope", text: "Hi" }), deps)).status).toBe(400);
    expect((await handleOwnerReplyRequest(request("POST", { reviewId: REVIEW }), deps)).status).toBe(400);
    expect((await handleOwnerReplyRequest(request("PATCH", { reviewId: REVIEW, text: "Hi" }), deps)).status).toBe(400);
    expect((await handleOwnerReplyRequest(request("POST", { reviewId: REVIEW, text: "x".repeat(40_000) }), deps)).status).toBe(413);
    expect((await handleOwnerReplyRequest(request("GET", undefined), deps)).status).toBe(405);
    expect(deps.post).not.toHaveBeenCalled();
  });

  it("tells a caller who is not signed in, or not this business's owner, apart without doing anything", async () => {
    const signedOut = replyDeps({ getOwner: vi.fn(async (): Promise<OwnedBusiness> => ({ kind: "signed_out" })) });
    const out = await handleOwnerReplyRequest(request("POST", { reviewId: REVIEW, text: "Hi" }), signedOut);
    expect(out.status).toBe(401);
    expect(((await out.json()) as { code: string }).code).toBe("signed_out");

    const stranger = replyDeps({ getOwner: vi.fn(async (): Promise<OwnedBusiness> => ({ kind: "not_owner", waiting: null })) });
    const refused = await handleOwnerReplyRequest(request("DELETE", { commentId: COMMENT }), stranger);
    expect(refused.status).toBe(403);
    expect(stranger.takeDown).not.toHaveBeenCalled();
  });

  it("maps what went wrong with the work to a status the page can show", async () => {
    const cases = [
      [{ kind: "invalid", message: "Write your reply." }, 422, "invalid"],
      [{ kind: "not_found" }, 404, "unavailable"],
      [{ kind: "limited" }, 429, "limited"],
      [{ kind: "failed" }, 500, "failed"],
    ] as const;
    for (const [outcome, status, code] of cases) {
      const deps = replyDeps({ post: vi.fn(async () => outcome) });
      const response = await handleOwnerReplyRequest(request("POST", { reviewId: REVIEW, text: "Hi" }), deps);
      expect(response.status).toBe(status);
      expect(((await response.json()) as { code: string }).code).toBe(code);
    }
  });
});

function accessDeps(overrides: Partial<OwnerAccessDeps> = {}): OwnerAccessDeps {
  return {
    websiteOrigin: WEBSITE,
    getOwner: vi.fn(async () => OWNER),
    resolveNamed: vi.fn(async (named) => (named.by === "id" ? { placeId: named.id, listingKey: null } : { placeId: null, listingKey: named.key })),
    sameBusiness: (a, b) => a.placeId !== null && a.placeId === b.placeId,
    ...overrides,
  };
}

function accessRequest(query: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://app.brandbasket.in/api/directory-owner/access${query}`, { headers: { origin: WEBSITE, ...headers } });
}

describe("handleOwnerAccessRequest", () => {
  it("says yes for the signed-in owner of the business the page is about, and no for another", async () => {
    const yes = await handleOwnerAccessRequest(accessRequest("?id=k7m2q9a"), accessDeps());
    expect(await yes.json()).toEqual({ status: "ok", owner: true });
    expect(yes.headers.get("access-control-allow-origin")).toBe(WEBSITE);

    const no = await handleOwnerAccessRequest(accessRequest("?id=a2345bc"), accessDeps());
    expect(await no.json()).toEqual({ status: "ok", owner: false });
  });

  it("answers the page on the website's www address, which is where brandbasket.in sends every visitor", async () => {
    const www = "https://www.brandbasket.in";
    const response = await handleOwnerAccessRequest(accessRequest("?id=k7m2q9a", { origin: www }), accessDeps());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", owner: true });
    expect(response.headers.get("access-control-allow-origin")).toBe(www);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("says no, not an error, to a visitor who is not signed in or not an owner", async () => {
    const visitors: readonly OwnedBusiness[] = [{ kind: "signed_out" }, { kind: "not_owner", waiting: null }];
    for (const visitor of visitors) {
      const response = await handleOwnerAccessRequest(accessRequest("?id=k7m2q9a"), accessDeps({ getOwner: vi.fn(async () => visitor) }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok", owner: false });
    }
  });

  it("wants exactly one of a place id and a listing key, in their forms", async () => {
    const deps = accessDeps();
    expect((await handleOwnerAccessRequest(accessRequest(""), deps)).status).toBe(400);
    expect((await handleOwnerAccessRequest(accessRequest("?id=k7m2q9a&key=dentists/thane/naupada/smile-dental"), deps)).status).toBe(400);
    expect((await handleOwnerAccessRequest(accessRequest("?id=NOT%20AN%20ID"), deps)).status).toBe(400);
    expect((await handleOwnerAccessRequest(accessRequest("?key=dentists/thane/naupada/smile-dental"), deps)).status).toBe(200);
    expect(deps.getOwner).toHaveBeenCalledTimes(1);
  });

  it("is for the website's origin and the GET method alone", async () => {
    const deps = accessDeps();
    expect((await handleOwnerAccessRequest(accessRequest("?id=k7m2q9a", { origin: "https://evil.example" }), deps)).status).toBe(403);
    expect((await handleOwnerAccessRequest(new Request("https://app.brandbasket.in/api/directory-owner/access?id=k7m2q9a", { method: "POST", headers: { origin: WEBSITE } }), deps)).status).toBe(405);
    expect(deps.getOwner).not.toHaveBeenCalled();
  });
});
