import type { BusinessInviteView } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  clampInviteName,
  inviteSchema,
  invitePath,
  inviteSignInHref,
  inviteTokenSchema,
  inviteViewFor,
  pendingInvites,
  refusalMessage,
  roleLabel,
  roleRefusal,
  ROLE_OPTIONS,
  safeInviteReturn,
  teamDate,
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

describe("roleRefusal", () => {
  it("lets every role read", () => {
    for (const role of ["owner", "editor", "viewer"] as const) expect(roleRefusal(role, undefined)).toBeNull();
  });

  it("refuses only a viewer a write", () => {
    expect(roleRefusal("owner", "write")).toBeNull();
    expect(roleRefusal("editor", "write")).toBeNull();
    expect(roleRefusal("viewer", "write")).toBe("read-only");
  });

  it("refuses everyone but the owner an owner page", () => {
    expect(roleRefusal("owner", "owner")).toBeNull();
    expect(roleRefusal("editor", "owner")).toBe("owner-only");
    expect(roleRefusal("viewer", "owner")).toBe("owner-only");
  });
});

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
});

describe("the invite link", () => {
  it("is the accept page with the token, and sign in comes back to it", () => {
    expect(invitePath(TOKEN)).toBe(`/invite/${TOKEN}`);
    expect(inviteSignInHref(TOKEN)).toBe(`/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
  });

  it("only takes a token shaped like ours", () => {
    expect(inviteTokenSchema.safeParse(TOKEN).success).toBe(true);
    for (const bad of ["", "short", `${TOKEN}A`, `${"A".repeat(42)}/`, `${"A".repeat(42)} `]) expect(inviteTokenSchema.safeParse(bad).success).toBe(false);
  });

  it("returns only to an invite accept page after sign-in", () => {
    expect(safeInviteReturn(`/invite/${TOKEN}`)).toBe(`/invite/${TOKEN}`);
    for (const bad of [null, undefined, "", "/", "/billing", "//evil.com", "https://evil.com", `/invite/${TOKEN}/x`, `/invite/${TOKEN}?a=1`, `/invite/short`, `/invite/../x`, `\\invite\\${TOKEN}`]) {
      expect(safeInviteReturn(bad)).toBeNull();
    }
  });
});

describe("inviteViewFor", () => {
  it("shows a bad link before anything about the session", () => {
    expect(inviteViewFor("short", true)).toBe("invalid-link");
    expect(inviteViewFor("short", false)).toBe("invalid-link");
  });

  it("sends the signed-out to sign in and offers the signed-in the button", () => {
    expect(inviteViewFor(TOKEN, false)).toBe("sign-in");
    expect(inviteViewFor(TOKEN, true)).toBe("accept");
  });
});

describe("words", () => {
  it("names the roles and every way an invitation is refused", () => {
    expect([roleLabel("owner"), roleLabel("editor"), roleLabel("viewer")]).toEqual(["Owner", "Editor", "Viewer"]);
    for (const reason of ["not_found", "revoked", "expired", "used", "wrong_email"] as const) expect(refusalMessage(reason).length).toBeGreaterThan(10);
  });

  it("writes a date in India's time zone, so the server and the browser agree", () => {
    expect(teamDate(new Date("2026-11-12T20:00:00Z"))).toBe("13 Nov 2026");
  });

  it("uses no em or en dashes", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync(new URL("./rules.ts", import.meta.url), "utf8"));
    expect(source).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("clampInviteName", () => {
  it("leaves a name of 60 characters or fewer alone", () => {
    expect(clampInviteName("  Riverside Plumbing ")).toBe("Riverside Plumbing");
    expect(clampInviteName("a".repeat(60))).toBe("a".repeat(60));
  });

  it("cuts at the last whole word that fits, with no ellipsis", () => {
    const name = "The Very Long Named Riverside Plumbing And Heating Services Company";
    expect(clampInviteName(name)).toBe("The Very Long Named Riverside Plumbing And Heating Services");
  });

  it("keeps a word that ends exactly at 60, and cuts one long word where it stands", () => {
    expect(clampInviteName(`${"a".repeat(60)} tail`)).toBe("a".repeat(60));
    expect(clampInviteName("b".repeat(90))).toBe("b".repeat(60));
  });
});
