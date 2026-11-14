import { describe, expect, it } from "vitest";
import { accountInUse, connectNoticeLine, daysUntilEnd, endsInWords, liveAccountsOf, readChannels, readConnectLink, type Channel } from "./rules";

const NOW = new Date("2026-11-12T06:00:00.000Z");
const channel = (over: Partial<Channel> = {}): Channel => ({ id: "instagram:1", platform: "instagram", account: "acme", connectedAt: "2026-11-01T00:00:00Z", ...over });
const raw = (over: Record<string, unknown> = {}) => ({ ...channel(), ...over });

describe("readChannels", () => {
  it("reads the channels of a workspace answer and drops one it does not know", () => {
    const read = readChannels({ workspace: { channels: [raw(), { id: "tiktok:1", platform: "tiktok", account: "x", connectedAt: "2026-11-01T00:00:00Z" }, { nope: true }] } });
    expect(read.map((one) => one.id)).toEqual(["instagram:1"]);
  });

  it("is empty when the answer is not a workspace", () => {
    expect(readChannels(null)).toEqual([]);
    expect(readChannels({ workspace: {} })).toEqual([]);
  });
});

describe("readConnectLink", () => {
  it("accepts https, and http only on this computer", () => {
    expect(readConnectLink({ url: "https://social.example.com/connect/x" })).toBe("https://social.example.com/connect/x");
    expect(readConnectLink({ url: "http://127.0.0.1:4020/connect/x" })).toBe("http://127.0.0.1:4020/connect/x");
    expect(readConnectLink({ url: "http://evil.example.com/x" })).toBeNull();
    expect(readConnectLink({ url: "javascript:alert(1)" })).toBeNull();
    expect(readConnectLink({})).toBeNull();
  });
});

describe("liveAccountsOf", () => {
  it("lists the accounts in the order of the networks and the networks still to connect", () => {
    const live = liveAccountsOf([channel({ id: "facebook:7", platform: "facebook", account: "Acme Page" }), channel()], NOW);
    expect(live.rows.map((row) => row.platform)).toEqual(["instagram", "facebook"]);
    expect(live.missing).toEqual(["linkedin", "google"]);
  });

  it("says a connection is ending once it ends within a week, or has ended, and a paused account is marked", () => {
    const soon = liveAccountsOf([channel({ expiresAt: "2026-11-15T06:00:00.000Z" })], NOW).rows[0];
    expect(soon?.ending).toBe("Ends in 3 days");
    expect(liveAccountsOf([channel({ expiresAt: "2026-12-30T00:00:00.000Z" })], NOW).rows[0]?.ending).toBeNull();
    expect(liveAccountsOf([channel({ expiresAt: "2026-11-01T00:00:00.000Z", paused: true })], NOW).rows[0]).toMatchObject({ ending: "The connection has ended", paused: true });
    expect(daysUntilEnd({}, NOW)).toBeNull();
    expect(endsInWords(0)).toBe("Ends today");
    expect(endsInWords(1)).toBe("Ends in 1 day");
  });
});

describe("connectNoticeLine", () => {
  it("says what happened when a network sends the customer back, and nothing for a made-up address", () => {
    expect(connectNoticeLine("connected", "instagram")).toEqual({ ok: true, text: "Instagram is connected. Posts from now on will also go there." });
    expect(connectNoticeLine("denied", "google")?.ok).toBe(false);
    expect(connectNoticeLine("failed", "nope")?.text).toContain("That account");
    expect(connectNoticeLine("hacked", "instagram")).toBeNull();
    expect(connectNoticeLine(undefined, undefined)).toBeNull();
  });
});

describe("an account that is connected elsewhere", () => {
  it("says so plainly and never whose it is", () => {
    const line = connectNoticeLine("failed", "instagram", "ACCOUNT_IN_USE");
    expect(line?.ok).toBe(false);
    expect(line?.text).toContain("already connected somewhere else");
    expect(connectNoticeLine("failed", "instagram", "OTHER")).toEqual(connectNoticeLine("failed", "instagram"));
  });

  it("offers to move it only when the posting service names another of her brands", () => {
    expect(accountInUse({ social: "failed", channel: "instagram", reason: "ACCOUNT_IN_USE", heldBy: "b1" })).toEqual({ channel: "instagram", heldBy: "b1" });
    expect(accountInUse({ social: "failed", channel: "instagram", reason: "ACCOUNT_IN_USE" })).toBeNull();
    expect(accountInUse({ social: "failed", channel: "instagram", reason: "ACCOUNT_IN_USE", heldBy: " " })).toBeNull();
    expect(accountInUse({ social: "failed", channel: "tiktok", reason: "ACCOUNT_IN_USE", heldBy: "b1" })).toBeNull();
    expect(accountInUse({ social: "connected", channel: "instagram", reason: "ACCOUNT_IN_USE", heldBy: "b1" })).toBeNull();
  });
});
