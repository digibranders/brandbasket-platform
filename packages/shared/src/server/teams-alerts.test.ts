import type { Database } from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { teamsCard } from "../lib/teams-webhook";
import { sealSecret } from "./secret-seal";
import { loadTeamsHookState, postToTeams, saveTeamsHook, sendTeamsAlert, sendTeamsTest } from "./teams-alerts";

vi.mock("server-only", () => ({}));

const queries = vi.hoisted(() => ({
  clearSiteSetting: vi.fn(),
  findSiteSetting: vi.fn(),
  findSiteSettingWithEditor: vi.fn(),
  saveSiteSetting: vi.fn(),
}));
vi.mock("@brandbasket/db", () => queries);

const SECRET = "a-secret-of-at-least-thirty-two-characters!!";
const URL_TEXT = "https://prod-12.centralindia.logic.azure.com/workflows/abc?sig=hush";
const DB = {} as Database;
const MESSAGE = teamsCard({ title: "New enquiry" });
const NOW = new Date("2026-10-26T10:00:00.000Z");

function saved(url = URL_TEXT, secret = SECRET): { value: string; updatedAt: Date; updatedByEmail: string } {
  return { value: sealSecret(secret, url), updatedAt: NOW, updatedByEmail: "owner@example.com" };
}

beforeEach(() => {
  for (const mock of Object.values(queries)) mock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("postToTeams", () => {
  it("is sent when Teams answers with a success, and says rejected for any other answer", async () => {
    expect(await postToTeams(URL_TEXT, MESSAGE, vi.fn().mockResolvedValue({ ok: true }))).toBe("sent");
    expect(await postToTeams(URL_TEXT, MESSAGE, vi.fn().mockResolvedValue({ ok: false }))).toBe("rejected");
  });

  it("says unreachable when the request fails, and posts the card as JSON without following redirects", async () => {
    expect(await postToTeams(URL_TEXT, MESSAGE, vi.fn().mockRejectedValue(new Error("boom")))).toBe("unreachable");
    const post = vi.fn().mockResolvedValue({ ok: true });
    await postToTeams(URL_TEXT, MESSAGE, post);
    expect(post).toHaveBeenCalledWith(URL_TEXT, expect.objectContaining({ method: "POST", redirect: "error", body: JSON.stringify(MESSAGE) }));
  });
});

describe("sendTeamsAlert", () => {
  it("posts the card to the address saved for that destination, and asks for that destination's setting", async () => {
    queries.findSiteSetting.mockResolvedValue(saved());
    const post = vi.fn().mockResolvedValue({ ok: true });
    await sendTeamsAlert(DB, SECRET, "enquiries", MESSAGE, post);
    expect(queries.findSiteSetting).toHaveBeenCalledWith(DB, "teams_webhook_enquiries");
    expect(post).toHaveBeenCalledWith(URL_TEXT, expect.anything());
  });

  it("does nothing when no address is saved for it, or the saved one cannot be read", async () => {
    const post = vi.fn();
    queries.findSiteSetting.mockResolvedValueOnce(null);
    await sendTeamsAlert(DB, SECRET, "support", MESSAGE, post);
    queries.findSiteSetting.mockResolvedValueOnce(saved(URL_TEXT, "another-secret-of-at-least-thirty-two-chars"));
    await sendTeamsAlert(DB, SECRET, "support", MESSAGE, post);
    expect(post).not.toHaveBeenCalled();
  });

  it("never throws, and never writes the address in a log, when the post or the read fails", async () => {
    queries.findSiteSetting.mockResolvedValueOnce(saved());
    await expect(sendTeamsAlert(DB, SECRET, "system", MESSAGE, vi.fn().mockResolvedValue({ ok: false }))).resolves.toBeUndefined();
    queries.findSiteSetting.mockRejectedValueOnce(new Error(`could not read ${URL_TEXT}`));
    await expect(sendTeamsAlert(DB, SECRET, "system", MESSAGE)).resolves.toBeUndefined();
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("[teams-alert]");
    expect(logged).not.toContain("hush");
    expect(logged).not.toContain("logic.azure.com");
  });
});

describe("sendTeamsTest", () => {
  it("reports what happened: sent, no address, unreadable or failed", async () => {
    const by = { email: "owner@example.com", now: NOW };
    queries.findSiteSetting.mockResolvedValueOnce(saved());
    expect(await sendTeamsTest(DB, SECRET, "support", by, vi.fn().mockResolvedValue({ ok: true }))).toBe("sent");
    queries.findSiteSetting.mockResolvedValueOnce(saved());
    expect(await sendTeamsTest(DB, SECRET, "support", by, vi.fn().mockResolvedValue({ ok: false }))).toBe("failed");
    queries.findSiteSetting.mockResolvedValueOnce(null);
    expect(await sendTeamsTest(DB, SECRET, "support", by)).toBe("unset");
    queries.findSiteSetting.mockResolvedValueOnce(saved(URL_TEXT, "another-secret-of-at-least-thirty-two-chars"));
    expect(await sendTeamsTest(DB, SECRET, "support", by)).toBe("unreadable");
  });

  it("says who sent it and where it is going", async () => {
    queries.findSiteSetting.mockResolvedValue(saved());
    const post = vi.fn().mockResolvedValue({ ok: true });
    await sendTeamsTest(DB, SECRET, "enquiries", { email: "owner@example.com", now: NOW }, post);
    const body = String(post.mock.calls[0]?.[1]?.body);
    expect(body).toContain("owner@example.com");
    expect(body).toContain("Website enquiries");
    // 10:00 UTC is 3:30 pm in India.
    expect(body).toContain("3:30 pm IST");
  });
});

describe("keeping the address", () => {
  it("stores it sealed, under the destination's own setting, and never as plain text", async () => {
    await saveTeamsHook(DB, SECRET, { destination: "system", url: URL_TEXT, staffUserId: "staff-1", now: NOW });
    const input = queries.saveSiteSetting.mock.calls[0]?.[1] as { key: string; value: string; staffUserId: string };
    expect(input).toMatchObject({ key: "teams_webhook_system", staffUserId: "staff-1" });
    expect(input.value).not.toContain("logic.azure.com");
  });

  it("describes a saved address as set, a foreign-sealed one as unreadable, and none as unset", async () => {
    queries.findSiteSettingWithEditor.mockResolvedValueOnce(saved());
    expect(await loadTeamsHookState(DB, SECRET, "support")).toEqual({ state: "set", changedAt: NOW, changedBy: "owner@example.com" });
    queries.findSiteSettingWithEditor.mockResolvedValueOnce(saved(URL_TEXT, "another-secret-of-at-least-thirty-two-chars"));
    expect(await loadTeamsHookState(DB, SECRET, "support")).toMatchObject({ state: "unreadable" });
    queries.findSiteSettingWithEditor.mockResolvedValueOnce(null);
    expect(await loadTeamsHookState(DB, SECRET, "support")).toEqual({ state: "unset" });
  });
});
