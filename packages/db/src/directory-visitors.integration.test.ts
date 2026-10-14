import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  countDirectoryVisitors,
  deleteDirectoryVisitor,
  findDirectoryVisitor,
  listDirectoryVisitorsForStaff,
  touchDirectoryVisitor,
  upsertDirectoryVisitor,
} from "./queries/directory-visitors";
import { directoryVisitors } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-09T10:00:00.000Z");
const LATER = new Date("2026-10-10T10:00:00.000Z");
const PRIYA = "+919876543210";
const MISSING = "00000000-0000-4000-8000-00000000ffff";

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("directory visitors", () => {
  it("creates a visitor the first time a number proves itself", async () => {
    const visitor = await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
    expect(visitor).toMatchObject({ phone: PRIYA, name: "Priya Sharma" });
    expect(await findDirectoryVisitor(dbs.staff.db, visitor.id)).toMatchObject({ id: visitor.id, phone: PRIYA });
  });

  it("keeps one account per number and takes the latest name", async () => {
    const first = await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
    const second = await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya S", now: LATER });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Priya S");
    expect(second.lastSeenAt.toISOString()).toBe(LATER.toISOString());
    expect(await dbs.owner.db.select().from(directoryVisitors)).toHaveLength(1);
  });

  it("finds nobody for an unknown or malformed id", async () => {
    expect(await findDirectoryVisitor(dbs.staff.db, MISSING)).toBeNull();
    expect(await findDirectoryVisitor(dbs.staff.db, "not-a-uuid")).toBeNull();
  });

  it("notes a return visit", async () => {
    const visitor = await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
    await touchDirectoryVisitor(dbs.staff.db, visitor.id, LATER);
    expect((await findDirectoryVisitor(dbs.staff.db, visitor.id))?.lastSeenAt.toISOString()).toBe(LATER.toISOString());
  });

  it("refuses a malformed number or an empty name", async () => {
    await expect(upsertDirectoryVisitor(dbs.staff.db, { phone: "9876543210", name: "Priya", now: NOW })).rejects.toThrow();
    await expect(upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "", now: NOW })).rejects.toThrow();
  });

  it("is invisible to the app role: only staff reach it", async () => {
    await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
    await expect(dbs.app.db.select().from(directoryVisitors)).rejects.toThrow();
  });

  describe("for the staff console", () => {
    const ARJUN = "+919123456789";
    const LIST = { limit: 25, offset: 0, search: "" };

    it("lists the most recently seen first and counts them", async () => {
      await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
      await upsertDirectoryVisitor(dbs.staff.db, { phone: ARJUN, name: "Arjun Rao", now: LATER });
      const page = await listDirectoryVisitorsForStaff(dbs.staff.db, LIST);
      expect(page.rows.map((row) => row.name)).toEqual(["Arjun Rao", "Priya Sharma"]);
      expect(page.total).toBe(2);
      expect(await countDirectoryVisitors(dbs.staff.db)).toBe(2);
    });

    it("pages the list and reports the whole total", async () => {
      await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
      await upsertDirectoryVisitor(dbs.staff.db, { phone: ARJUN, name: "Arjun Rao", now: LATER });
      const page = await listDirectoryVisitorsForStaff(dbs.staff.db, { limit: 1, offset: 1, search: "" });
      expect(page.rows.map((row) => row.name)).toEqual(["Priya Sharma"]);
      expect(page.total).toBe(2);
    });

    it("finds a visitor by part of the name, ignoring case and taking wildcards literally", async () => {
      await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
      await upsertDirectoryVisitor(dbs.staff.db, { phone: ARJUN, name: "Arjun Rao", now: LATER });
      expect((await listDirectoryVisitorsForStaff(dbs.staff.db, { ...LIST, search: "SHAR" })).rows.map((row) => row.name)).toEqual(["Priya Sharma"]);
      expect((await listDirectoryVisitorsForStaff(dbs.staff.db, { ...LIST, search: "%" })).total).toBe(0);
    });

    it("finds a visitor by a full number however it is written, but not by a few digits", async () => {
      await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
      await upsertDirectoryVisitor(dbs.staff.db, { phone: ARJUN, name: "Arjun Rao", now: LATER });
      const byNumber = await listDirectoryVisitorsForStaff(dbs.staff.db, { ...LIST, search: "+91 98765-43210" });
      expect(byNumber.rows.map((row) => row.name)).toEqual(["Priya Sharma"]);
      expect((await listDirectoryVisitorsForStaff(dbs.staff.db, { ...LIST, search: "9876" })).total).toBe(0);
    });

    it("refuses a page that cannot be real", async () => {
      await expect(listDirectoryVisitorsForStaff(dbs.staff.db, { limit: 0, offset: 0, search: "" })).rejects.toThrow(RangeError);
      await expect(listDirectoryVisitorsForStaff(dbs.staff.db, { limit: 5, offset: -1, search: "" })).rejects.toThrow(RangeError);
    });
  });

  describe("erasing", () => {
    it("erases one account, so the same number starts fresh", async () => {
      const visitor = await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: NOW });
      expect(await deleteDirectoryVisitor(dbs.staff.db, visitor.id)).toBe(true);
      expect(await findDirectoryVisitor(dbs.staff.db, visitor.id)).toBeNull();
      const again = await upsertDirectoryVisitor(dbs.staff.db, { phone: PRIYA, name: "Priya Sharma", now: LATER });
      expect(again.id).not.toBe(visitor.id);
    });

    it("says false for an account that is already gone or an id that is not one", async () => {
      expect(await deleteDirectoryVisitor(dbs.staff.db, MISSING)).toBe(false);
      expect(await deleteDirectoryVisitor(dbs.staff.db, "not-a-uuid")).toBe(false);
    });
  });
});
