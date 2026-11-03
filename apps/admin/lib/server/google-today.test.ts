import { listGoogleAttention, listGoogleConnections, type GoogleConnectionRow } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readGoogleToday } from "./google-today";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listGoogleAttention: vi.fn(), listGoogleConnections: vi.fn() };
});
vi.mock("./db", () => ({ getStaffDb: () => ({ staff: true }) }));

const NOW = new Date("2026-11-03T04:00:00.000Z");
const LOST = { purpose: "read", status: "access_lost", updatedAt: new Date("2026-11-03T01:00:00.000Z"), sealedRefreshToken: "sealed:v1:secret", accountEmail: "x@example.com", lastError: "invalid_grant" } as GoogleConnectionRow;

beforeEach(() => {
  vi.mocked(listGoogleAttention).mockResolvedValue([{ kind: "unverified", businessId: "b1", businessName: "Om Sweets", since: new Date("2026-10-29T04:00:00.000Z") }]);
  vi.mocked(listGoogleConnections).mockResolvedValue([LOST]);
});

describe("readGoogleToday", () => {
  it("gives an admin the client rows and the lost sign-in, and nothing of the sealed token", async () => {
    const items = await readGoogleToday(NOW, true);
    expect(items.map((item) => item.key)).toEqual(["google:unverified:b1", "google:sign-in"]);
    expect(JSON.stringify(items)).not.toMatch(/sealed|secret|invalid_grant|x@example\.com/);
  });

  it("leaves the account's sign-in out for other roles, and does not even read it", async () => {
    const items = await readGoogleToday(NOW, false);
    expect(items.map((item) => item.key)).toEqual(["google:unverified:b1"]);
    expect(listGoogleConnections).not.toHaveBeenCalled();
  });

  it("is empty when all is well", async () => {
    vi.mocked(listGoogleAttention).mockResolvedValue([]);
    vi.mocked(listGoogleConnections).mockResolvedValue([{ ...LOST, status: "connected" }]);
    expect(await readGoogleToday(NOW, true)).toEqual([]);
  });

  it("asks the query for cutoffs from today's date", async () => {
    await readGoogleToday(NOW, false);
    expect(listGoogleAttention).toHaveBeenCalledWith({ staff: true }, { unverifiedBefore: new Date("2026-10-31T04:00:00.000Z"), ga4DataBefore: "2026-10-31", gscDataBefore: "2026-10-29" });
  });
});
