import { businessAnnouncements, businessClosures, businessHours, businessProfiles } from "@brandbasket/db";
import { mediaStorageKey } from "@brandbasket/shared/server/media-storage";
import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requirePaid, requireWebsite } from "@/lib/guards";
import { reportError } from "@/lib/report";
import {
  addClosureAction,
  clearAnnouncementAction,
  deleteClosureAction,
  removeBrandAssetAction,
  saveAnnouncementAction,
  saveContactAction,
  saveHoursAction,
} from "./actions";
import { CLOSURE_NOT_FOUND_MESSAGE, CLOSURE_PAST_MESSAGE, IMAGE_GONE_MESSAGE, SAVE_FAILED_MESSAGE, VIEWER_MESSAGE } from "./rules";

/*
 * The actions run for real, with the real @brandbasket/db query helpers, against a recording stand-in for the database
 * transaction. That checks what the exit test of phase 6 asks for: an edit is written to the same tables and columns the old
 * forms wrote, which is what `/api/site/info` (readSiteFacts) reads back.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requirePaid: vi.fn(), requireWebsite: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: () => database }));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const OTHER_ID = "0192f3c4-2222-7000-8000-000000000002";
const MEDIA_ID = "0192f3c4-3333-7000-8000-000000000003";
const STORAGE_KEY = mediaStorageKey(BUSINESS_ID, MEDIA_ID, "display");
const storage = { put: vi.fn(), get: vi.fn(), delete: vi.fn() };
vi.mock("@brandbasket/shared/server/media-storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/shared/server/media-storage")>()), getMediaStorage: () => storage }));

interface Write {
  readonly op: "insert" | "update-on-conflict" | "delete" | "update";
  readonly table: unknown;
  readonly values?: unknown;
}

let writes: Write[];
/** What a select or a returning clause hands back, set per test. */
let rows: unknown[];
let failWith: Error | null;

/** A result that can be awaited as it is or asked for its returning rows, like a drizzle query. */
function result(): Record<string, unknown> {
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(rows),
    returning: async () => rows,
    orderBy: async () => rows,
    limit: async () => rows,
    where: () => query,
    from: () => query,
  };
  return query;
}

const tx = {
  execute: async () => ({ rows: [{ business_id: BUSINESS_ID }] }),
  select: () => result(),
  insert: (table: unknown) => ({
    values: (values: unknown) => {
      if (failWith !== null) throw failWith;
      writes.push({ op: "insert", table, values });
      const query = result();
      query.onConflictDoUpdate = (config: { set: unknown }) => {
        writes.push({ op: "update-on-conflict", table, values: config.set });
        return query;
      };
      return query;
    },
  }),
  delete: (table: unknown) => ({
    where: () => {
      writes.push({ op: "delete", table });
      return result();
    },
  }),
  update: (table: unknown) => ({
    set: (values: unknown) => {
      writes.push({ op: "update", table, values });
      return { where: () => result() };
    },
  }),
};
const database = { transaction: async (work: (scoped: typeof tx) => Promise<unknown>) => work(tx) };

function customer(role: "owner" | "editor" | "viewer" = "owner") {
  return {
    user: { id: "user-1" },
    tenant: { userId: "user-1", businessId: BUSINESS_ID, businessName: "Apex Diagnostics", role },
    businessId: BUSINESS_ID,
    role,
  } as never;
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const unusedWrites = () => expect(writes).toEqual([]);

beforeEach(() => {
  writes = [];
  rows = [];
  failWith = null;
  vi.mocked(requirePaid).mockResolvedValue(customer());
  vi.mocked(requireWebsite).mockResolvedValue(customer());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T05:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("guards", () => {
  it("asks for a paid period on contact and on removing a logo or photo, and for the Managed Website on the rest", async () => {
    rows = [{ displayName: "x" }];
    await saveContactAction(form({ displayName: "Apex" }));
    await removeBrandAssetAction(MEDIA_ID);
    expect(vi.mocked(requirePaid).mock.calls).toEqual([[{ write: true }], [{ write: true }]]);
    expect(requireWebsite).not.toHaveBeenCalled();

    await saveHoursAction(form({}));
    await saveAnnouncementAction(form({ message: "x", startsOn: "2026-11-03", endsOn: "2026-11-04" }));
    await clearAnnouncementAction();
    await addClosureAction(form({ startsOn: "2026-12-01", endsOn: "2026-12-01" }));
    await deleteClosureAction(OTHER_ID);
    expect(vi.mocked(requireWebsite).mock.calls).toEqual([[{ write: true }], [{ write: true }], [{ write: true }], [{ write: true }], [{ write: true }]]);
  });

  it("writes nothing when the guard sends the person away", async () => {
    vi.mocked(requireWebsite).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveHoursAction(form({}))).rejects.toThrow("NEXT_REDIRECT");
    unusedWrites();
  });

  it("refuses a viewer in words and writes nothing", async () => {
    vi.mocked(requirePaid).mockResolvedValue(customer("viewer"));
    vi.mocked(requireWebsite).mockResolvedValue(customer("viewer"));
    const refused = { ok: false, message: VIEWER_MESSAGE };
    expect(await saveContactAction(form({ displayName: "Apex" }))).toEqual(refused);
    expect(await saveHoursAction(form({}))).toEqual(refused);
    expect(await saveAnnouncementAction(form({ message: "x", startsOn: "2026-11-03", endsOn: "2026-11-04" }))).toEqual(refused);
    expect(await clearAnnouncementAction()).toEqual(refused);
    expect(await addClosureAction(form({ startsOn: "2026-12-01", endsOn: "2026-12-01" }))).toEqual(refused);
    expect(await deleteClosureAction(OTHER_ID)).toEqual(refused);
    expect(await removeBrandAssetAction(MEDIA_ID)).toEqual(refused);
    unusedWrites();
  });
});

describe("saveContactAction", () => {
  it("writes the contact columns of business_profiles, and only those", async () => {
    rows = [{ displayName: "Apex Diagnostics" }];
    const outcome = await saveContactAction(form({ displayName: "Apex Diagnostics", phone: "98201 55012", phoneCountry: "IN", email: "hello@apexdiagnostics.in", city: "Mumbai" }));
    expect(outcome).toEqual({ ok: true });
    const upsert = writes.find((write) => write.op === "update-on-conflict");
    expect(upsert?.table).toBe(businessProfiles);
    expect(Object.keys(upsert?.values as object).sort()).toEqual(
      ["addressLine1", "addressLine2", "city", "country", "displayName", "email", "phone", "postalCode", "region", "serviceAreas", "updatedAt"].sort(),
    );
    expect(upsert?.values).toMatchObject({ displayName: "Apex Diagnostics", phone: "+919820155012", email: "hello@apexdiagnostics.in", city: "Mumbai", addressLine1: null });
    expect(revalidatePath).toHaveBeenCalledWith("/business");
  });

  it("answers an invalid form with field errors and writes nothing", async () => {
    expect(await saveContactAction(form({ displayName: "", phone: "98201 55012", phoneCountry: "IN" }))).toMatchObject({ ok: false, fieldErrors: { displayName: "Tell us your business name." } });
    expect(await saveContactAction(form({ displayName: "Apex", phone: "12345", phoneCountry: "IN" }))).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });
    unusedWrites();
  });

  it("reports a database failure and answers in words", async () => {
    failWith = new Error("connection reset");
    const outcome = await saveContactAction(form({ displayName: "Apex" }));
    expect(outcome).toEqual({ ok: false, message: SAVE_FAILED_MESSAGE });
    expect(reportError).toHaveBeenCalledWith(failWith, { area: "business.contact.save" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveHoursAction", () => {
  it("replaces the week in business_hours with the columns the site reads", async () => {
    const outcome = await saveHoursAction(
      form({
        "hours.0.mode": "open",
        "hours.0.opens": "07:00",
        "hours.0.closes": "20:00",
        "hours.4.mode": "open",
        "hours.4.opens": "18:00",
        "hours.4.closes": "02:00",
        "hours.5.mode": "all-day",
        "hours.6.mode": "closed",
      }),
    );
    expect(outcome).toEqual({ ok: true });
    expect(writes[0]).toEqual({ op: "delete", table: businessHours });
    expect(writes[1]).toEqual({
      op: "insert",
      table: businessHours,
      values: [
        { businessId: BUSINESS_ID, dayOfWeek: 0, opensAt: "07:00", closesAt: "20:00", closed: false, openAllDay: false },
        { businessId: BUSINESS_ID, dayOfWeek: 4, opensAt: "18:00", closesAt: "02:00", closed: false, openAllDay: false },
        { businessId: BUSINESS_ID, dayOfWeek: 5, opensAt: null, closesAt: null, closed: false, openAllDay: true },
        { businessId: BUSINESS_ID, dayOfWeek: 6, opensAt: null, closesAt: null, closed: true, openAllDay: false },
      ],
    });
  });

  it("clears the week when every day is not set, inserting nothing", async () => {
    expect(await saveHoursAction(form({ "hours.0.mode": "unset" }))).toEqual({ ok: true });
    expect(writes).toEqual([{ op: "delete", table: businessHours }]);
  });

  it("refuses an open day without times, keeping the old week", async () => {
    const outcome = await saveHoursAction(form({ "hours.2.mode": "open", "hours.2.opens": "09:00" }));
    expect(outcome).toMatchObject({ ok: false, fieldErrors: { "hours.2.closes": expect.any(String) } });
    unusedWrites();
  });
});

describe("announcement actions", () => {
  it("upserts the one announcement row", async () => {
    const outcome = await saveAnnouncementAction(form({ message: " Open on Diwali ", startsOn: "2026-11-08", endsOn: "2026-11-10" }));
    expect(outcome).toEqual({ ok: true });
    expect(writes[0]).toEqual({ op: "insert", table: businessAnnouncements, values: { businessId: BUSINESS_ID, message: "Open on Diwali", startsOn: "2026-11-08", endsOn: "2026-11-10" } });
    expect(writes[1]).toMatchObject({ op: "update-on-conflict", table: businessAnnouncements, values: { message: "Open on Diwali", startsOn: "2026-11-08", endsOn: "2026-11-10" } });
  });

  it("refuses a message with a line break", async () => {
    expect(await saveAnnouncementAction(form({ message: "a\nb", startsOn: "2026-11-08", endsOn: "2026-11-10" }))).toMatchObject({ ok: false, fieldErrors: { message: expect.any(String) } });
    unusedWrites();
  });

  it("removes the row without reading the form", async () => {
    expect(await clearAnnouncementAction()).toEqual({ ok: true });
    expect(writes).toEqual([{ op: "delete", table: businessAnnouncements }]);
    expect(revalidatePath).toHaveBeenCalledWith("/business");
  });
});

describe("addClosureAction", () => {
  const closure = { startsOn: "2026-11-08", endsOn: "2026-11-10", note: "Diwali" };

  it("inserts into business_closures with both times null when shut all day", async () => {
    rows = [{ timeZone: "Asia/Kolkata", id: "c1", startsOn: "2026-11-08", endsOn: "2026-11-10", note: "Diwali", opensAt: null, closesAt: null }];
    expect(await addClosureAction(form(closure))).toEqual({ ok: true });
    expect(writes).toEqual([{ op: "insert", table: businessClosures, values: { businessId: BUSINESS_ID, startsOn: "2026-11-08", endsOn: "2026-11-10", note: "Diwali", opensAt: null, closesAt: null } }]);
  });

  it("stores both times for a half day", async () => {
    rows = [{ timeZone: "Asia/Kolkata", id: "c1", startsOn: "2026-11-08", endsOn: "2026-11-08", note: null, opensAt: "10:00", closesAt: "14:00" }];
    await addClosureAction(form({ startsOn: "2026-11-08", endsOn: "2026-11-08", kind: "hours", opensAt: "10:00", closesAt: "14:00" }));
    expect(writes[0]?.values).toMatchObject({ opensAt: "10:00", closesAt: "14:00", note: null });
  });

  it("refuses a closure whose last day has passed in the business's own time zone", async () => {
    rows = [{ timeZone: "Asia/Kolkata", id: "c1" }];
    const outcome = await addClosureAction(form({ startsOn: "2026-11-01", endsOn: "2026-11-02" }));
    expect(outcome).toEqual({ ok: false, message: CLOSURE_PAST_MESSAGE, fieldErrors: { endsOn: CLOSURE_PAST_MESSAGE } });
    unusedWrites();
  });

  it("accepts a closure ending today, and judges today by the business zone, not the server's", async () => {
    // 05:00 UTC on 3 Nov is still 2 Nov in Los Angeles.
    rows = [{ timeZone: "America/Los_Angeles", id: "c1", startsOn: "2026-11-02", endsOn: "2026-11-02", note: null, opensAt: null, closesAt: null }];
    expect(await addClosureAction(form({ startsOn: "2026-11-02", endsOn: "2026-11-02" }))).toEqual({ ok: true });
    expect(writes).toHaveLength(1);
  });
});

describe("deleteClosureAction", () => {
  it("deletes from business_closures and revalidates", async () => {
    rows = [{ id: OTHER_ID }];
    expect(await deleteClosureAction(OTHER_ID)).toEqual({ ok: true });
    expect(writes).toEqual([{ op: "delete", table: businessClosures }]);
    expect(revalidatePath).toHaveBeenCalledWith("/business");
  });

  it("says so for a row already gone, and still revalidates so the list catches up", async () => {
    rows = [];
    expect(await deleteClosureAction(OTHER_ID)).toEqual({ ok: false, message: CLOSURE_NOT_FOUND_MESSAGE });
    expect(revalidatePath).toHaveBeenCalledWith("/business");
  });

  it("never reaches the database for an id that is not a UUID", async () => {
    expect(await deleteClosureAction("not-an-id")).toEqual({ ok: false, message: CLOSURE_NOT_FOUND_MESSAGE });
    unusedWrites();
  });
});

describe("removeBrandAssetAction", () => {
  it("soft deletes the row, then deletes the stored file", async () => {
    rows = [{ storageKey: STORAGE_KEY }];
    expect(await removeBrandAssetAction(MEDIA_ID)).toEqual({ ok: true });
    expect(writes[0]).toMatchObject({ op: "update", values: { deletedAt: expect.any(Date) } });
    expect(storage.delete).toHaveBeenCalledWith(STORAGE_KEY);
    expect(revalidatePath).toHaveBeenCalledWith("/business/brand");
  });

  it("says so for an image already removed, and deletes no file", async () => {
    rows = [];
    expect(await removeBrandAssetAction(MEDIA_ID)).toEqual({ ok: false, message: IMAGE_GONE_MESSAGE });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a UUID", async () => {
    expect(await removeBrandAssetAction("../../etc")).toMatchObject({ ok: false });
    unusedWrites();
  });
});
