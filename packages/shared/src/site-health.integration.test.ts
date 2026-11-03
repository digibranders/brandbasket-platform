import { businesses, domains, projects, siteChecks, type Database } from "@brandbasket/db";
import type { EmailMessage, EmailTransport } from "@brandbasket/email";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runSiteHealth, type SiteHealthProbes } from "./server/site-health";

/** The site health job against a real database, with the network replaced: what it stores, when it alerts, and that one bad site stops nothing. */

const START = new Date("2026-11-03T09:00:00.000Z");
const TEN_MINUTES = 10 * 60_000;
const EXPIRES = new Date("2027-02-04T00:00:00.000Z");
const SPEED = { lighthouseResult: { categories: { performance: { score: 0.82 } }, audits: { "largest-contentful-paint": { numericValue: 1800 } } } };

let dbs: TestDatabases;
let staff: Database;
let cafe = "";

beforeAll(() => {
  dbs = openTestDatabases();
  staff = dbs.staff.db;
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  const rows = await staff
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
      { slug: "riverside", name: "Riverside", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  cafe = rows.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  const riverside = rows.find((row) => row.slug === "riverside")?.id ?? "";
  await staff.insert(projects).values([
    { businessId: cafe, status: "live" },
    { businessId: riverside, status: "live" },
  ]);
  await staff.insert(domains).values([
    { businessId: cafe, hostname: "cafe.example.com", isPrimary: true, status: "active" },
    { businessId: riverside, hostname: "riverside.example.com", isPrimary: true, status: "active" },
  ]);
});

function recordingTransport(): { readonly transport: EmailTransport; readonly sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return { sent, transport: { send: async (message) => void sent.push(message) } };
}

/** The cafe answers with `cafeStatus` (or throws when null); riverside's certificate read throws something odd. */
function probes(cafeStatus: () => number | null, pageSpeedCalls: string[]): SiteHealthProbes {
  return {
    fetch: async (input) => {
      const url = String(input);
      if (url.startsWith("https://www.googleapis.com/")) {
        pageSpeedCalls.push(url);
        return Response.json(SPEED);
      }
      if (url.startsWith("https://riverside.example.com")) return new Response("ok", { status: 200 });
      const status = cafeStatus();
      if (status === null) throw new TypeError("fetch failed", { cause: Object.assign(new Error("refused"), { code: "ECONNREFUSED" }) });
      return new Response("page", { status });
    },
    certificateExpiry: async (hostname) => {
      if (hostname === "riverside.example.com") throw new Error("socket hang up");
      return EXPIRES;
    },
  };
}

describe("runSiteHealth", () => {
  it("stores each check, measures phone speed once a day, and alerts once when a site goes from up to down twice", async () => {
    const answers: (number | null)[] = [200, 503, null, null, 200];
    let run = 0;
    const pageSpeedCalls: string[] = [];
    const { transport, sent } = recordingTransport();
    const reports = [];
    for (run = 0; run < answers.length; run += 1) {
      const at = new Date(START.getTime() + run * TEN_MINUTES);
      const index = run;
      reports.push(
        await runSiteHealth(staff, {
          transport,
          alertTo: "support@brandbasket.in",
          adminOrigin: "https://console.brandbasket.in",
          pageSpeedKey: null,
          now: () => at,
          probes: probes(() => (index < answers.length ? (answers[index] as number | null) : 200), pageSpeedCalls),
        }),
      );
    }

    const rows = (await staff.select().from(siteChecks)).sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime());
    const cafeRows = rows.filter((row) => row.businessId === cafe);
    expect(cafeRows.map((row) => row.status)).toEqual(["up", "down", "down", "down", "up"]);
    expect(cafeRows[0]).toMatchObject({ httpStatus: 200, sslExpiresAt: EXPIRES, phoneSpeedScore: 82, phoneLcpMs: 1800, url: "https://cafe.example.com/" });
    expect(cafeRows[2]).toMatchObject({ httpStatus: null, error: "Could not connect (ECONNREFUSED)" });
    // Two sites, each measured once on the first run.
    expect(pageSpeedCalls).toHaveLength(2);
    expect(rows.filter((row) => row.businessId !== cafe).every((row) => row.status === "up" && row.error === "Certificate read failed: socket hang up")).toBe(true);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("Website down: Chennai Cafe");
    expect(sent[0]?.bodyText).toContain("3 November 2026, 14:40 IST");
    expect(sent[0]?.bodyText).toContain(`https://console.brandbasket.in/clients/${cafe}`);
    expect(reports[2]).toMatchObject({ sites: 2, up: 1, down: 1, errors: 0, alertsSent: 1 });
  });

  it("stores an error row for a site whose check fails on our side and still checks the others", async () => {
    const { transport } = recordingTransport();
    const report = await runSiteHealth(staff, {
      transport,
      alertTo: "support@brandbasket.in",
      adminOrigin: "https://console.brandbasket.in",
      pageSpeedKey: null,
      now: () => START,
      probes: {
        ...probes(() => 200, []),
        // Not a network failure: a bug of ours in the probe. It must not escape the loop.
        certificateExpiry: () => {
          throw new Error("probe bug");
        },
      },
    });
    expect(report).toMatchObject({ sites: 2, errors: 2 });
    const rows = await staff.select({ status: siteChecks.status, error: siteChecks.error }).from(siteChecks);
    expect(rows).toEqual([
      { status: "error", error: "probe bug" },
      { status: "error", error: "probe bug" },
    ]);
  });
});
