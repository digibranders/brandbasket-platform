import { beforeEach, describe, expect, it, vi } from "vitest";
import { findDirectoryVisitor, touchDirectoryVisitor, upsertDirectoryVisitor } from "@fynix/db";
import { startVisitorSession, resolveVisitor } from "./directory-visitor";
import { recordContributionConsent } from "./visitor-consent";
import { issueVisitorToken } from "./visitor-token";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("./env", () => ({ bookingOtpSecret: () => "s".repeat(32) }));
vi.mock("./visitor-consent", () => ({ recordContributionConsent: vi.fn() }));
vi.mock("@fynix/db", () => ({ findDirectoryVisitor: vi.fn(), touchDirectoryVisitor: vi.fn(), upsertDirectoryVisitor: vi.fn() }));

const SECRET = "s".repeat(32);
const NOW = new Date("2026-10-09T10:00:00.000Z");
const ROW = { id: "01939c54-1111-7222-8333-444455556666", phone: "+919876543210", name: "Priya Sharma", createdAt: NOW, lastSeenAt: NOW };

beforeEach(() => {
  vi.mocked(upsertDirectoryVisitor).mockReset().mockResolvedValue(ROW);
  vi.mocked(findDirectoryVisitor).mockReset().mockResolvedValue(ROW);
  vi.mocked(touchDirectoryVisitor).mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("startVisitorSession", () => {
  it("opens the account and hands back a token with the labels the header shows", async () => {
    const session = await startVisitorSession(ROW.phone, ROW.name, NOW);
    expect(upsertDirectoryVisitor).toHaveBeenCalledWith({}, { phone: ROW.phone, name: ROW.name, now: NOW });
    expect(session).toMatchObject({ name: "Priya Sharma", phoneHint: "•••• 3210" });
    expect(session?.token.split(".")[0]).toBe(ROW.id);
  });

  it("keeps what the visitor agreed to against the account it opens, when the post carried it", async () => {
    await startVisitorSession(ROW.phone, ROW.name, NOW, { noticeVersion: "pre-dpdp", adult: true });
    expect(recordContributionConsent).toHaveBeenCalledWith({}, ROW.id, { noticeVersion: "pre-dpdp", adult: true });
  });

  it("opens the account as before when the post carried no consent", async () => {
    await startVisitorSession(ROW.phone, ROW.name, NOW);
    expect(recordContributionConsent).toHaveBeenCalledWith({}, ROW.id, undefined);
  });

  it("never throws: a failure only means the visitor confirms a code again next time", async () => {
    vi.mocked(upsertDirectoryVisitor).mockRejectedValue(new Error("db down"));
    await expect(startVisitorSession(ROW.phone, ROW.name, NOW)).resolves.toBeUndefined();
  });
});

describe("resolveVisitor", () => {
  it("knows a good token's visitor by name and number, renews the token and notes the visit", async () => {
    const visitor = await resolveVisitor(issueVisitorToken(ROW.id, NOW, SECRET), NOW);
    expect(visitor?.identity).toEqual({ name: "Priya Sharma", phone: "+919876543210" });
    expect(visitor?.session.phoneHint).toBe("•••• 3210");
    expect(touchDirectoryVisitor).toHaveBeenCalledWith({}, ROW.id, NOW);
  });

  it("knows nobody for a forged token, and does not even look them up", async () => {
    expect(await resolveVisitor(`${ROW.id}.9999999999.forged`, NOW)).toBeNull();
    expect(findDirectoryVisitor).not.toHaveBeenCalled();
  });

  it("knows nobody for a good token whose account is gone", async () => {
    vi.mocked(findDirectoryVisitor).mockResolvedValue(null);
    expect(await resolveVisitor(issueVisitorToken(ROW.id, NOW, SECRET), NOW)).toBeNull();
  });
});
