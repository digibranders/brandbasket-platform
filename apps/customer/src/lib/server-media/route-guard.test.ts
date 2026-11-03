import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { guardOrNull, tenantForUpload, UPLOAD_VIEWER_MESSAGE } from "./route-guard";

vi.mock("server-only", () => ({}));

const tenant: TenantContext = { userId: "user-a", businessId: "business-a", businessName: "Riverside Plumbing", role: "owner" };

describe("guardOrNull", () => {
  it("returns what the guard returned", async () => {
    await expect(guardOrNull(async () => "context")).resolves.toBe("context");
  });

  it("turns a guard's redirect into null", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(guardOrNull(async () => Promise.reject(redirect))).resolves.toBeNull();
  });

  it("rethrows any other error", async () => {
    await expect(guardOrNull(async () => Promise.reject(new Error("database down")))).rejects.toThrow("database down");
  });
});

describe("tenantForUpload", () => {
  it("is null for a visitor the guard turned away", () => {
    expect(tenantForUpload(null)).toBeNull();
  });

  it("is the tenant for an owner or an editor", () => {
    expect(tenantForUpload({ role: "owner", tenant })).toBe(tenant);
    expect(tenantForUpload({ role: "editor", tenant: { ...tenant, role: "editor" } })).toMatchObject({ role: "editor" });
  });

  it("is a 403 for a viewer", async () => {
    const result = tenantForUpload({ role: "viewer", tenant: { ...tenant, role: "viewer" } });
    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: UPLOAD_VIEWER_MESSAGE });
  });
});
