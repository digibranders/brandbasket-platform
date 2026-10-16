import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DomainNotReadyForDnsError, markDomainReadyForDns, recordDomainDnsCheck } from "./queries/domain-connect";
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
