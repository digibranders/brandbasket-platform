import { DomainTakenError } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWebsite } from "@/lib/guards";
import { notifyTeamDomainConnected, notifyTeamDomainRequested } from "../alerts";
import { VIEWER_MESSAGE } from "../rules/notices";
import { checkDomainAction, requestOwnDomainAction } from "./actions";
import { checkDomainDns } from "./dns-check";
import { CHECK_FAILED_MESSAGE, MOVE_NOT_AVAILABLE_MESSAGE, MOVE_TAKEN_MESSAGE, NO_DOMAIN_TO_CHECK_MESSAGE, NOT_TIME_TO_CONNECT_MESSAGE, TOO_MANY_CHECKS_MESSAGE } from "./rules";

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireWebsite: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({}), getStaffDb: () => ({}) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.test" }) }));
vi.mock("../alerts", () => ({ notifyTeamDomainConnected: vi.fn(), notifyTeamDomainRequested: vi.fn() }));
vi.mock("./dns-check", () => ({ checkDomainDns: vi.fn() }));

let connecting: { hostname: string; status: string; isPrimary: boolean } | null;
let primary: { hostname: string; status: string } | null;
let projectStatus: string;
const moves: string[] = [];
const db = vi.hoisted(() => ({ recordDomainDnsCheck: vi.fn(), requestDomainMove: vi.fn(), consumeRateLimit: vi.fn() }));

vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  withTenantScope: async (_db: unknown, _tenant: unknown, work: (tx: unknown) => Promise<unknown>) => work({}),
  getConnectingDomain: async () => connecting,
  getPrimaryDomain: async () => primary,
  findLatestProject: async () => ({ status: projectStatus }),
  recordDomainDnsCheck: db.recordDomainDnsCheck,
  requestDomainMove: db.requestDomainMove,
  consumeRateLimit: db.consumeRateLimit,
}));

function context(role: "owner" | "viewer" = "owner") {
  return { tenant: { businessId: BUSINESS_ID }, businessId: BUSINESS_ID, businessName: "Apex", role };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  moves.length = 0;
  process.env.CLIENT_SITE_BASE_DOMAIN = "sites.test";
  connecting = { hostname: "apex.in", status: "awaiting_dns", isPrimary: true };
  primary = { hostname: "apex.sites.test", status: "active" };
  projectStatus = "live";
  vi.mocked(requireWebsite).mockResolvedValue(context() as never);
  db.recordDomainDnsCheck.mockResolvedValue({ becameConnected: false });
  db.consumeRateLimit.mockResolvedValue({ allowed: true });
  db.requestDomainMove.mockImplementation(async (_tx: unknown, input: { hostname: string }) => {
    moves.push(input.hostname);
  });
});

describe("checkDomainAction", () => {
  it("checks the stored domain and tells the team the first time it is connected", async () => {
    vi.mocked(checkDomainDns).mockResolvedValue({ overall: "connected", records: [{ host: "@", status: "connected" }] });
    db.recordDomainDnsCheck.mockResolvedValue({ becameConnected: true });
    expect(await checkDomainAction()).toEqual({ ok: true, data: { overall: "connected", records: [{ host: "@", status: "connected" }] } });
    expect(checkDomainDns).toHaveBeenCalledWith("apex.in");
    expect(db.recordDomainDnsCheck).toHaveBeenCalledWith({}, { businessId: BUSINESS_ID, hostname: "apex.in", result: "connected" });
    expect(notifyTeamDomainConnected).toHaveBeenCalledTimes(1);
  });

  it("refuses a free address and a domain staff have not asked to connect yet", async () => {
    connecting = { hostname: "apex.sites.test", status: "active", isPrimary: true };
    expect(await checkDomainAction()).toEqual({ ok: false, message: NO_DOMAIN_TO_CHECK_MESSAGE });
    connecting = { hostname: "apex.in", status: "pending", isPrimary: true };
    expect(await checkDomainAction()).toEqual({ ok: false, message: NOT_TIME_TO_CONNECT_MESSAGE });
    expect(checkDomainDns).not.toHaveBeenCalled();
  });

  it("refuses a viewer before any lookup or write", async () => {
    vi.mocked(requireWebsite).mockResolvedValue(context("viewer") as never);
    expect(await checkDomainAction()).toEqual({ ok: false, message: VIEWER_MESSAGE });
    expect(db.consumeRateLimit).not.toHaveBeenCalled();
    expect(checkDomainDns).not.toHaveBeenCalled();
    expect(db.recordDomainDnsCheck).not.toHaveBeenCalled();
  });

  it("counts checks per business and stops at the hourly budget", async () => {
    vi.mocked(checkDomainDns).mockResolvedValue({ overall: "connected", records: [] });
    await checkDomainAction();
    expect(db.consumeRateLimit).toHaveBeenCalledWith({}, `domain-check:business:${BUSINESS_ID}`, { limit: 20, windowSeconds: 3600 });
    vi.clearAllMocks();
    db.consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect(await checkDomainAction()).toEqual({ ok: false, message: TOO_MANY_CHECKS_MESSAGE });
    expect(checkDomainDns).not.toHaveBeenCalled();
    expect(db.recordDomainDnsCheck).not.toHaveBeenCalled();
  });

  it("says try again when the DNS service cannot be reached", async () => {
    vi.mocked(checkDomainDns).mockRejectedValue(new Error("ETIMEOUT"));
    expect(await checkDomainAction()).toEqual({ ok: false, message: CHECK_FAILED_MESSAGE });
    expect(db.recordDomainDnsCheck).not.toHaveBeenCalled();
  });
});

describe("requestOwnDomainAction", () => {
  it("saves the domain beside the free address and tells the team", async () => {
    expect(await requestOwnDomainAction(null, form({ domain: "https://www.Apex.in/", ownerConfirmed: "on" }))).toEqual({ ok: true });
    expect(moves).toEqual(["apex.in"]);
    expect(notifyTeamDomainRequested).toHaveBeenCalledWith({ id: BUSINESS_ID, name: "Apex" }, "apex.in");
    expect(requireWebsite).toHaveBeenCalledWith({ write: true });
  });

  it("is only for a website live on its free address", async () => {
    projectStatus = "building";
    expect(await requestOwnDomainAction(null, form({ domain: "apex.in", ownerConfirmed: "on" }))).toEqual({ ok: false, message: MOVE_NOT_AVAILABLE_MESSAGE });
    projectStatus = "live";
    primary = { hostname: "apex.in", status: "active" };
    expect(await requestOwnDomainAction(null, form({ domain: "apex.com", ownerConfirmed: "on" }))).toEqual({ ok: false, message: MOVE_NOT_AVAILABLE_MESSAGE });
    expect(moves).toEqual([]);
  });

  it("points at the field that needs fixing", async () => {
    expect(await requestOwnDomainAction(null, form({ domain: "apex.in" }))).toMatchObject({ ok: false, fieldErrors: { ownerConfirmed: "Tick the box to confirm this domain is yours." } });
    expect(await requestOwnDomainAction(null, form({ domain: "app.brandbasket.test", ownerConfirmed: "on" }))).toMatchObject({ ok: false, fieldErrors: { domain: "That address belongs to us. Enter your own domain." } });
  });

  it("says a taken domain is connected elsewhere without naming who holds it", async () => {
    db.requestDomainMove.mockRejectedValue(new DomainTakenError("apex.in"));
    expect(await requestOwnDomainAction(null, form({ domain: "apex.in", ownerConfirmed: "on" }))).toEqual({ ok: false, message: MOVE_TAKEN_MESSAGE, fieldErrors: { domain: MOVE_TAKEN_MESSAGE } });
    expect(notifyTeamDomainRequested).not.toHaveBeenCalled();
  });

  it("refuses a viewer", async () => {
    vi.mocked(requireWebsite).mockResolvedValue(context("viewer") as never);
    expect(await requestOwnDomainAction(null, form({ domain: "apex.in", ownerConfirmed: "on" }))).toEqual({ ok: false, message: VIEWER_MESSAGE });
  });
});
