import type { ProvisionCandidate, ProvisionedSourceInput, ProvisionSource } from "@brandbasket/db";
import { GoogleAccessLost } from "@brandbasket/shared/server/google/oauth";
import { describe, expect, it, vi } from "vitest";
import { isComplete, provisionAll, provisionOne, skipReason, TAG_WAIT_MS, type ProvisionConfig, type ProvisionDeps } from "./google-provision";

const NOW = new Date("2026-11-03T04:00:00.000Z");
const CONFIG: ProvisionConfig = { analyticsAccountName: "Brandbasket clients", mainAccountEmail: "official.brandbasket@gmail.com", secondOwnerEmail: "second@example.com", analyticsTagEnabled: false, freeBaseDomain: "sites.brandbasket.in" };
const TOKEN = "T".repeat(40);
const candidate = (over: Partial<ProvisionCandidate> = {}): ProvisionCandidate => ({ businessId: "01a1a150-aaaa", businessName: "Kulkarni Physio", hostname: "kulkarni.example", vercelProjectId: "prj_1", vercelTeamId: null, hostingPaused: false, ga4: null, gsc: null, ...over });
const source = (over: Partial<ProvisionSource> = {}): ProvisionSource => ({ externalId: "x", status: "pending", measurementId: null, verifiedAt: null, provisionedAt: null, secondOwnerOk: false, detail: null, ...over });
const DONE_GA4 = source({ externalId: "999", status: "awaiting_setup", measurementId: "G-ABC123", provisionedAt: NOW });
const DONE_GSC = source({ externalId: "https://kulkarni.example/", status: "pending", verifiedAt: NOW, secondOwnerOk: true });

function fakes(over: { shows?: boolean; verifies?: boolean; listedOwners?: string[]; config?: Partial<ProvisionConfig>; account?: boolean } = {}) {
  const calls: string[] = [];
  const saved: ProvisionedSourceInput[] = [];
  const deps: ProvisionDeps = {
    admin: {
      findAccount: vi.fn(async () => { calls.push("findAccount"); return over.account === false ? null : { account: "accounts/1", properties: [] }; }),
      createProperty: vi.fn(async () => { calls.push("createProperty"); return "999"; }),
      createWebStream: vi.fn(async () => { calls.push("createWebStream"); return "G-ABC123"; }),
      createKeyEvent: vi.fn(async (_id, event) => { calls.push(`keyEvent:${event}`); }),
    },
    verification: {
      metaToken: vi.fn(async () => { calls.push("metaToken"); return TOKEN; }),
      verify: vi.fn(async () => { calls.push("verify"); return over.verifies ?? true; }),
      addToSearchConsole: vi.fn(async () => { calls.push("addSite"); }),
      owners: vi.fn(async () => { calls.push("owners"); return over.listedOwners ?? ["official.brandbasket@gmail.com", "second@example.com"]; }),
      setOwners: vi.fn(async () => { calls.push("setOwners"); }),
    },
    save: async (input) => void saved.push(input),
    setEnv: async (_c, key) => void calls.push(`env:${key}`),
    redeploy: async () => void calls.push("redeploy"),
    pageShowsToken: async () => over.shows ?? false,
    config: { ...CONFIG, ...over.config },
    now: NOW,
  };
  return { deps, calls, saved };
}

describe("skipReason and isComplete", () => {
  it("never provisions a free address or a paused site", () => {
    expect(skipReason(candidate({ hostname: "kulkarni.sites.brandbasket.in" }), CONFIG)).toBe("free-address");
    expect(skipReason(candidate({ hostingPaused: true }), CONFIG)).toBe("hosting-paused");
    expect(skipReason(candidate(), CONFIG)).toBeNull();
    expect(skipReason(candidate({ hostname: "sites.brandbasket.in.evil.example" }), CONFIG)).toBeNull();
  });
  it("is complete only when both sources are done, and not after a domain change", () => {
    expect(isComplete(candidate({ ga4: DONE_GA4, gsc: DONE_GSC }), CONFIG)).toBe(true);
    expect(isComplete(candidate({ ga4: DONE_GA4, gsc: { ...DONE_GSC, externalId: "https://old.example/" } }), CONFIG)).toBe(false);
    expect(isComplete(candidate({ ga4: DONE_GA4, gsc: { ...DONE_GSC, secondOwnerOk: false } }), CONFIG)).toBe(false);
    expect(isComplete(candidate({ ga4: DONE_GA4, gsc: { ...DONE_GSC, secondOwnerOk: false } }), { ...CONFIG, secondOwnerEmail: null })).toBe(true);
    expect(isComplete(candidate({ ga4: DONE_GA4, gsc: DONE_GSC }), { ...CONFIG, analyticsTagEnabled: true })).toBe(false);
  });
});

describe("provisionOne", () => {
  it("does nothing for a free address", async () => {
    const { deps, calls } = fakes();
    expect(await provisionOne(candidate({ hostname: "kulkarni.sites.brandbasket.in" }), deps)).toEqual({ businessId: "01a1a150-aaaa", result: "skipped", note: "free-address" });
    expect(calls).toEqual([]);
  });

  it("makes the property, stream and key events, asks for the tag with one redeploy, and waits, withholding the Analytics id while the tag is off", async () => {
    const { deps, calls, saved } = fakes();
    expect((await provisionOne(candidate(), deps)).result).toBe("waiting");
    expect(calls).toEqual(["findAccount", "createProperty", "createWebStream", "keyEvent:form_send", "keyEvent:call_tap", "keyEvent:whatsapp_tap", "metaToken", "env:NEXT_PUBLIC_GSC_VERIFICATION", "redeploy"]);
    expect(saved.map((row) => [row.source, row.status])).toEqual([["ga4", "awaiting_setup"], ["ga4", "awaiting_setup"], ["ga4", "awaiting_setup"], ["gsc", "awaiting_setup"], ["gsc", "awaiting_setup"]]);
    expect(saved.find((row) => row.source === "ga4" && row.measurementId !== undefined)?.measurementId).toBe("G-ABC123");
    expect(calls).not.toContain("env:NEXT_PUBLIC_GA4_ID");
  });

  it("does not redeploy again while the earlier request is still fresh, and does again once it is stale", async () => {
    const fresh = fakes();
    await provisionOne(candidate({ ga4: DONE_GA4, gsc: source({ externalId: "https://kulkarni.example/", status: "awaiting_setup", provisionedAt: new Date(NOW.getTime() - 60_000) }) }), fresh.deps);
    expect(fresh.calls).toEqual(["metaToken"]);
    const stale = fakes();
    await provisionOne(candidate({ ga4: DONE_GA4, gsc: source({ externalId: "https://kulkarni.example/", status: "awaiting_setup", provisionedAt: new Date(NOW.getTime() - TAG_WAIT_MS - 1) }) }), stale.deps);
    expect(stale.calls).toEqual(["metaToken", "env:NEXT_PUBLIC_GSC_VERIFICATION", "redeploy"]);
  });

  it("verifies, adds the site and the second owner once the page shows the tag, then reads the owners back", async () => {
    const { deps, calls, saved } = fakes({ shows: true });
    const outcome = await provisionOne(candidate({ ga4: DONE_GA4, gsc: source({ externalId: "https://kulkarni.example/", status: "awaiting_setup", provisionedAt: NOW }) }), deps);
    expect(outcome.result).toBe("complete");
    expect(calls).toEqual(["metaToken", "verify", "addSite", "setOwners", "owners"]);
    expect(saved.at(-1)).toMatchObject({ source: "gsc", secondOwnerOk: true, detail: null });
    expect(saved.some((row) => row.status === "pending" && row.verifiedAt === NOW)).toBe(true);
  });

  it("waits when Google has not seen the tag, and notes a second owner Google did not list", async () => {
    const early = fakes({ shows: true, verifies: false });
    expect((await provisionOne(candidate({ ga4: DONE_GA4, gsc: source({ externalId: "https://kulkarni.example/", status: "awaiting_setup", provisionedAt: NOW }) }), early.deps)).result).toBe("waiting");
    expect(early.calls).not.toContain("addSite");
    const missing = fakes({ shows: true, listedOwners: ["official.brandbasket@gmail.com"] });
    expect((await provisionOne(candidate({ ga4: DONE_GA4, gsc: { ...DONE_GSC, secondOwnerOk: false } }), missing.deps)).result).toBe("working");
    expect(missing.saved.at(-1)).toMatchObject({ secondOwnerOk: false, detail: "Google did not list the second owner" });
  });

  it("skips the owner step and says so when no second owner is set", async () => {
    const { deps, calls, saved } = fakes({ config: { secondOwnerEmail: null } });
    const outcome = await provisionOne(candidate({ gsc: { ...DONE_GSC, secondOwnerOk: false } }), deps);
    expect(outcome.result).toBe("working");
    expect(calls).not.toContain("setOwners");
    expect(saved.at(-1)).toMatchObject({ detail: "No second owner is set" });
  });

  it("starts the Search Console site over when the primary domain changed", async () => {
    const { deps, saved } = fakes();
    await provisionOne(candidate({ ga4: DONE_GA4, gsc: { ...DONE_GSC, externalId: "https://old.example/" } }), deps);
    expect(saved[0]).toMatchObject({ source: "gsc", externalId: "https://kulkarni.example/", status: "awaiting_setup", verifiedAt: null, secondOwnerOk: false });
  });

  it("sets the Analytics id, starts the pull and redeploys once when the tag is switched on", async () => {
    const { deps, calls, saved } = fakes({ config: { analyticsTagEnabled: true } });
    await provisionOne(candidate({ ga4: DONE_GA4, gsc: DONE_GSC }), deps);
    expect(calls).toEqual(["metaToken", "env:NEXT_PUBLIC_GA4_ID", "redeploy"]);
    expect(saved.at(-1)).toMatchObject({ source: "ga4", status: "pending" });
  });

  it("reports a Google failure by class only, and stops the run when the account is refused", async () => {
    const down = fakes();
    vi.mocked(down.deps.admin.findAccount).mockRejectedValueOnce(Object.assign(new Error("Analytics Admin answered HTTP 429. property secret"), { failure: "quota" }));
    expect(await provisionOne(candidate(), down.deps)).toMatchObject({ result: "error", note: "quota" });
    const refused = fakes();
    vi.mocked(refused.deps.admin.findAccount).mockRejectedValueOnce(new GoogleAccessLost());
    await expect(provisionOne(candidate(), refused.deps)).rejects.toBeInstanceOf(GoogleAccessLost);
  });

  it("is a no-op for a business that is already complete", async () => {
    const { deps, calls } = fakes();
    expect((await provisionOne(candidate({ ga4: DONE_GA4, gsc: DONE_GSC }), deps)).result).toBe("complete");
    expect(calls).toEqual([]);
  });
});

describe("provisionAll", () => {
  it("settles skipped and complete businesses at once and only waits for the ones with work", async () => {
    const { deps } = fakes();
    const waits: number[] = [];
    const outcomes = await provisionAll(
      [candidate({ businessId: "a", hostname: "a.sites.brandbasket.in" }), candidate({ businessId: "b", ga4: DONE_GA4, gsc: DONE_GSC }), candidate({ businessId: "c" })],
      deps,
      { sleep: async (ms) => void waits.push(ms), random: () => 0 },
    );
    expect(outcomes.map((outcome) => [outcome.businessId, outcome.result])).toEqual([["a", "skipped"], ["b", "complete"], ["c", "waiting"]]);
    expect(waits).toEqual([12_000]);
  });
});
