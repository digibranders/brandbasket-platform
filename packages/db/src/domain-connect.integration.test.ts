import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DomainNotReadyForDnsError,
  DomainSwitchNotReadyError,
  getConnectingDomain,
  markDomainReadyForDns,
  recordDomainDnsCheck,
  requestDomainMove,
  switchToDomain,
} from "./queries/domain-connect";
import { DomainTakenError } from "./queries/onboarding-data";
import { withTenantScope } from "./scope";
import { businesses, businessMembers, domains, projects, users, type DomainStatus, type ProjectStatus } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

let dbs: TestDatabases;
let businessId = "";
let projectId = "";

async function setProjectStatus(status: ProjectStatus): Promise<void> {
  await dbs.staff.db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function seedDomain(status: DomainStatus = "pending"): Promise<void> {
  await dbs.staff.db.insert(domains).values({ businessId, hostname: "harbour-bakery.com", isPrimary: true, status });
}

async function domainStatus(): Promise<DomainStatus | undefined> {
  const [row] = await dbs.staff.db.select({ status: domains.status }).from(domains).where(eq(domains.businessId, businessId));
  return row?.status;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: "owner-1", name: "Riley Owner", email: "riley@example.com" });
  const [business] = await dbs.staff.db.insert(businesses).values({ slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR" }).returning({ id: businesses.id });
  if (business === undefined) throw new Error("Seed business was not inserted");
  businessId = business.id;
  await dbs.staff.db.insert(businessMembers).values({ businessId, userId: "owner-1", role: "owner" });
  const [project] = await dbs.staff.db.insert(projects).values({ businessId, status: "approved" }).returning({ id: projects.id });
  if (project === undefined) throw new Error("Seed project was not inserted");
  projectId = project.id;
});

describe("markDomainReadyForDns", () => {
  it("moves a pending domain to awaiting_dns once the project is approved", async () => {
    await seedDomain();
    await expect(markDomainReadyForDns(dbs.staff.db, { businessId })).resolves.toEqual({ hostname: "harbour-bakery.com", changed: true });
    expect(await domainStatus()).toBe("awaiting_dns");
  });

  it("says nothing changed the second time, so the customer is not emailed twice", async () => {
    await seedDomain("awaiting_dns");
    await expect(markDomainReadyForDns(dbs.staff.db, { businessId })).resolves.toEqual({ hostname: "harbour-bakery.com", changed: false });
  });

  it("refuses a project that has not been approved", async () => {
    await seedDomain();
    await setProjectStatus("preview");
    await expect(markDomainReadyForDns(dbs.staff.db, { businessId })).rejects.toThrow(DomainNotReadyForDnsError);
  });

  it("refuses when there is no domain", async () => {
    await expect(markDomainReadyForDns(dbs.staff.db, { businessId })).rejects.toThrow(DomainNotReadyForDnsError);
  });

  it("refuses a domain that is already active", async () => {
    await seedDomain("active");
    await expect(markDomainReadyForDns(dbs.staff.db, { businessId })).rejects.toThrow(DomainNotReadyForDnsError);
  });
});

describe("recordDomainDnsCheck", () => {
  const hostname = "harbour-bakery.com";

  it("moves awaiting_dns to verifying the first time it finds the domain connected", async () => {
    await seedDomain("awaiting_dns");
    await expect(recordDomainDnsCheck(dbs.staff.db, { businessId, hostname, result: "connected" })).resolves.toEqual({ becameConnected: true });
    expect(await domainStatus()).toBe("verifying");
  });

  it("does not report a second connected check as news", async () => {
    await seedDomain("verifying");
    await expect(recordDomainDnsCheck(dbs.staff.db, { businessId, hostname, result: "connected" })).resolves.toEqual({ becameConnected: false });
  });

  it("moves verifying back when the domain stops being connected, and marks one pointing elsewhere", async () => {
    await seedDomain("verifying");
    await recordDomainDnsCheck(dbs.staff.db, { businessId, hostname, result: "pending" });
    expect(await domainStatus()).toBe("awaiting_dns");
    await recordDomainDnsCheck(dbs.staff.db, { businessId, hostname, result: "elsewhere" });
    expect(await domainStatus()).toBe("misconfigured");
    await expect(recordDomainDnsCheck(dbs.staff.db, { businessId, hostname, result: "connected" })).resolves.toEqual({ becameConnected: true });
  });

  it("never touches a domain that is not in the DNS step", async () => {
    await seedDomain("pending");
    await recordDomainDnsCheck(dbs.staff.db, { businessId, hostname, result: "connected" });
    expect(await domainStatus()).toBe("pending");

    await dbs.staff.db.update(domains).set({ status: "active" });
    await recordDomainDnsCheck(dbs.staff.db, { businessId, hostname, result: "elsewhere" });
    expect(await domainStatus()).toBe("active");
  });

  it("ignores a check made for a domain the business no longer has", async () => {
    await seedDomain("awaiting_dns");
    await expect(recordDomainDnsCheck(dbs.staff.db, { businessId, hostname: "old-name.com", result: "connected" })).resolves.toEqual({ becameConnected: false });
    expect(await domainStatus()).toBe("awaiting_dns");
  });
});

describe("moving a live customer to their own domain", () => {
  const FREE = "harbour.sites.example.test";
  const OWN = "harbour-bakery.com";

  async function seedLiveOnFreeAddress(): Promise<void> {
    await setProjectStatus("live");
    await dbs.staff.db.insert(domains).values({ businessId, hostname: FREE, isPrimary: true, status: "active" });
  }

  function asOwner<T>(work: Parameters<typeof withTenantScope<T>>[2]): Promise<T> {
    return withTenantScope(dbs.app.db, { userId: "owner-1", businessId }, work);
  }

  async function rows(): Promise<readonly { hostname: string; status: DomainStatus; isPrimary: boolean; removed: boolean }[]> {
    const all = await dbs.staff.db.select().from(domains).where(eq(domains.businessId, businessId));
    return all.map((row) => ({ hostname: row.hostname, status: row.status, isPrimary: row.isPrimary, removed: row.removedAt !== null }));
  }

  it("keeps the free address as the main one while the request is pending", async () => {
    await seedLiveOnFreeAddress();
    const requested = await asOwner((tx) => requestDomainMove(tx, { hostname: OWN, ownerConfirmedAt: new Date() }));
    expect(requested).toMatchObject({ hostname: OWN, status: "pending", isPrimary: false });
    expect(await rows()).toEqual(
      expect.arrayContaining([
        { hostname: FREE, status: "active", isPrimary: true, removed: false },
        { hostname: OWN, status: "pending", isPrimary: false, removed: false },
      ]),
    );
  });

  it("treats the requested domain as the one being connected", async () => {
    await seedLiveOnFreeAddress();
    await asOwner((tx) => requestDomainMove(tx, { hostname: OWN, ownerConfirmedAt: new Date() }));
    await expect(asOwner((tx) => getConnectingDomain(tx))).resolves.toMatchObject({ hostname: OWN, isPrimary: false });
  });

  it("retires an earlier request instead of keeping two", async () => {
    await seedLiveOnFreeAddress();
    await asOwner((tx) => requestDomainMove(tx, { hostname: "first-choice.com", ownerConfirmedAt: new Date() }));
    await asOwner((tx) => requestDomainMove(tx, { hostname: OWN, ownerConfirmedAt: new Date() }));
    const live = (await rows()).filter((row) => !row.removed && !row.isPrimary);
    expect(live.map((row) => row.hostname)).toEqual([OWN]);
  });

  it("refuses a domain that is live for another business, without saying whose", async () => {
    await seedLiveOnFreeAddress();
    const [other] = await dbs.staff.db.insert(businesses).values({ slug: "other-bakery", name: "Other Bakery", currency: "INR" }).returning({ id: businesses.id });
    await dbs.staff.db.insert(domains).values({ businessId: other!.id, hostname: OWN, isPrimary: true, status: "active" });
    await expect(asOwner((tx) => requestDomainMove(tx, { hostname: OWN, ownerConfirmedAt: new Date() }))).rejects.toThrow(DomainTakenError);
  });

  it("asks for DNS on a live site, but only for a domain it is moving to", async () => {
    await seedLiveOnFreeAddress();
    await expect(markDomainReadyForDns(dbs.staff.db, { businessId })).rejects.toThrow(DomainNotReadyForDnsError);
    await asOwner((tx) => requestDomainMove(tx, { hostname: OWN, ownerConfirmedAt: new Date() }));
    await expect(markDomainReadyForDns(dbs.staff.db, { businessId })).resolves.toEqual({ hostname: OWN, changed: true });
  });

  it("switches to the connected domain: it becomes the main one, the free address is retired and the website address follows", async () => {
    await seedLiveOnFreeAddress();
    await asOwner((tx) => requestDomainMove(tx, { hostname: OWN, ownerConfirmedAt: new Date() }));
    await markDomainReadyForDns(dbs.staff.db, { businessId });
    await recordDomainDnsCheck(dbs.staff.db, { businessId, hostname: OWN, result: "connected" });

    await expect(switchToDomain(dbs.staff.db, { businessId })).resolves.toEqual({ oldHostname: FREE, newHostname: OWN });

    expect(await rows()).toEqual(
      expect.arrayContaining([
        { hostname: FREE, status: "active", isPrimary: false, removed: true },
        { hostname: OWN, status: "active", isPrimary: true, removed: false },
      ]),
    );
    const [business] = await dbs.staff.db.select({ websiteUrl: businesses.websiteUrl }).from(businesses).where(eq(businesses.id, businessId));
    expect(business?.websiteUrl).toBe(`https://${OWN}`);
  });

  it("refuses to switch before the DNS has been found connected", async () => {
    await seedLiveOnFreeAddress();
    await asOwner((tx) => requestDomainMove(tx, { hostname: OWN, ownerConfirmedAt: new Date() }));
    await markDomainReadyForDns(dbs.staff.db, { businessId });
    await expect(switchToDomain(dbs.staff.db, { businessId })).rejects.toThrow(DomainSwitchNotReadyError);
  });

  it("refuses to switch when there is nothing to move to", async () => {
    await seedLiveOnFreeAddress();
    await expect(switchToDomain(dbs.staff.db, { businessId })).rejects.toThrow(DomainSwitchNotReadyError);
  });
});
