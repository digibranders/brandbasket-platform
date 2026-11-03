import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { withFallback } from "./account-token";
import { GoogleAccessLost, GoogleUnavailable } from "./oauth";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ findGoogleConnection: vi.fn(), markGoogleConnectionLost: vi.fn(), markGoogleConnectionOk: vi.fn() }));

describe("withFallback", () => {
  it("uses the account token while it works", async () => {
    expect(await withFallback(async () => "account", async () => "service")()).toBe("account");
  });
  it("uses the service account when the account is not connected or was refused, but not when Google is merely down", async () => {
    expect(await withFallback(async () => { throw new GoogleAccessLost(); }, async () => "service")()).toBe("service");
    await expect(withFallback(async () => { throw new GoogleUnavailable("down"); }, async () => "service")()).rejects.toBeInstanceOf(GoogleUnavailable);
  });
});
