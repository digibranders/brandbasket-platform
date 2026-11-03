import type { BusinessInviteRefusal, BusinessInviteView } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  inviteSchema,
  invitePath,
  inviteSignInHref,
  inviteSignUpHref,
  inviteTokenSchema,
  pendingInvites,
  refusalMessage,
  roleLabel,
  ROLE_OPTIONS,
  safeInviteReturn,
} from "./rules";

const NOW = new Date("2026-11-03T10:00:00Z");
const TOKEN = "A".repeat(43);

function invite(overrides: Partial<BusinessInviteView> = {}): BusinessInviteView {
  return {
    id: "inv-1",
    businessId: "biz-1",
    email: "front@example.com",
    role: "viewer",
    invitedBy: "user-1",
    expiresAt: new Date("2026-11-08T10:00:00Z"),
    acceptedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    ...overrides,
  };
}

describe("inviteSchema", () => {
  it("takes an address in any case, trimmed and lower cased, and a role", () => {
    expect(inviteSchema.parse({ email: "  Front.Desk@Example.COM ", role: "editor" })).toEqual({ email: "front.desk@example.com", role: "editor" });
  });

  it("offers Editor and Viewer, never Owner", () => {
    expect(ROLE_OPTIONS.map((option) => option.label)).toEqual(["Editor", "Viewer"]);
    expect(inviteSchema.safeParse({ email: "a@example.com", role: "owner" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@example.com", role: "admin" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@example.com" }).success).toBe(false);
  });

  it("refuses an address that is not one", () => {
    expect(inviteSchema.safeParse({ email: "", role: "viewer" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "nobody", role: "viewer" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: `${"a".repeat(250)}@example.com`, role: "viewer" }).success).toBe(false);
  });
});

describe("pendingInvites", () => {
  it("lists open invites and expired ones that are still on the books", () => {
    const rows = pendingInvites([invite(), invite({ id: "inv-2", expiresAt: new Date("2026-11-02T10:00:00Z") })], NOW);
    expect(rows.map((row) => [row.id, row.status])).toEqual([["inv-1", "open"], ["inv-2", "expired"]]);
  });

  it("leaves out accepted and revoked invites", () => {
    expect(pendingInvites([invite({ acceptedAt: NOW }), invite({ id: "inv-2", revokedAt: NOW })], NOW)).toEqual([]);
  });

  it("treats an invite that expires this instant as expired", () => {
    expect(pendingInvites([invite({ expiresAt: NOW })], NOW)[0]?.status).toBe("expired");
  });
});

describe("refusalMessage", () => {
  it("says something clear and different for every way an invitation can be refused", () => {
    const reasons: BusinessInviteRefusal[] = ["not_found", "revoked", "expired", "used", "wrong_email"];
    const messages = reasons.map(refusalMessage);
    expect(new Set(messages).size).toBe(reasons.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    }
    expect(refusalMessage("wrong_email")).toContain("different email address");
    expect(refusalMessage("expired")).toContain("expired");
  });
});

describe("roles", () => {
  it("are written the way people read them", () => {
    expect([roleLabel("owner"), roleLabel("editor"), roleLabel("viewer")]).toEqual(["Owner", "Editor", "Viewer"]);
  });
});

describe("the accept link", () => {
  it("is /invite/<token> and the sign-in and sign-up addresses return to it", () => {
    expect(invitePath(TOKEN)).toBe(`/invite/${TOKEN}`);
    expect(inviteSignInHref(TOKEN)).toBe(`/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
    expect(inviteSignUpHref(TOKEN)).toBe(`/signup?next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
  });

  it("only accepts a token shaped like ours", () => {
    expect(inviteTokenSchema.safeParse(TOKEN).success).toBe(true);
    expect(inviteTokenSchema.safeParse("short").success).toBe(false);
    expect(inviteTokenSchema.safeParse(`${TOKEN}x`).success).toBe(false);
    expect(inviteTokenSchema.safeParse(`${TOKEN.slice(0, 42)}/`).success).toBe(false);
  });

  it("is the only thing sign-in may return to", () => {
    expect(safeInviteReturn(`/invite/${TOKEN}`)).toBe(`/invite/${TOKEN}`);
    expect(safeInviteReturn("https://evil.example/invite/" + TOKEN)).toBeNull();
    expect(safeInviteReturn("//evil.example")).toBeNull();
    expect(safeInviteReturn("/settings")).toBeNull();
    expect(safeInviteReturn(null)).toBeNull();
    expect(safeInviteReturn(undefined)).toBeNull();
  });
});
