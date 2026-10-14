import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { userPrivacySettings, users } from "./schema";
import { clearNominee, findNominee, saveNominee } from "./queries/user-privacy-settings";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const ASHA = "user-asha";
const RAVI = "user-ravi";
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values([
    { id: ASHA, name: "Asha", email: "asha@placeholder.test", emailVerified: false },
    { id: RAVI, name: "Ravi", email: "ravi@placeholder.test", emailVerified: false },
  ]);
});

describe("an owner's nominee", () => {
  it("is saved, replaced and removed by the owner alone", async () => {
    expect(await findNominee(dbs.app.db, ASHA)).toBeNull();
    await saveNominee(dbs.app.db, ASHA, { name: "Meera Rao", phone: "+919876543210" });
    expect(await findNominee(dbs.app.db, ASHA)).toEqual({ name: "Meera Rao", phone: "+919876543210" });
    await saveNominee(dbs.app.db, ASHA, { name: "Meera R", phone: "+919811111111" });
    expect(await findNominee(dbs.app.db, ASHA)).toEqual({ name: "Meera R", phone: "+919811111111" });
    expect(await dbs.owner.db.select().from(userPrivacySettings)).toHaveLength(1);
    expect(await clearNominee(dbs.app.db, ASHA)).toBe(true);
    expect(await clearNominee(dbs.app.db, ASHA)).toBe(false);
    expect(await findNominee(dbs.app.db, ASHA)).toBeNull();
  });

  it("is invisible to another owner, who cannot overwrite or remove it either", async () => {
    await saveNominee(dbs.app.db, ASHA, { name: "Meera Rao", phone: "+919876543210" });
    expect(await findNominee(dbs.app.db, RAVI)).toBeNull();
    // Ravi's scope writing a row for Asha is refused by row-level security.
    expect(
      await captureErrorText(dbs.app.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${RAVI}, true)`);
        await tx.insert(userPrivacySettings).values({ userId: ASHA, nomineeName: "Mallory", nomineePhone: "+919000000000" });
      })),
    ).toContain("row-level security");
    expect(await clearNominee(dbs.app.db, RAVI)).toBe(false);
    expect(await findNominee(dbs.app.db, ASHA)).toEqual({ name: "Meera Rao", phone: "+919876543210" });
  });

  it("lets staff read it and delete it (as the account erasure does) but not change it", async () => {
    await saveNominee(dbs.app.db, ASHA, { name: "Meera Rao", phone: "+919876543210" });
    expect(await dbs.staff.db.select().from(userPrivacySettings)).toHaveLength(1);
    expect(await captureErrorText(dbs.staff.db.update(userPrivacySettings).set({ nomineeName: "Staff" }))).toContain("permission denied");
    expect(await captureErrorText(dbs.staff.db.insert(userPrivacySettings).values({ userId: RAVI, nomineeName: "X", nomineePhone: "+919000000000" }))).toContain("permission denied");
    await dbs.staff.db.delete(userPrivacySettings).where(eq(userPrivacySettings.userId, ASHA));
    expect(await dbs.owner.db.select().from(userPrivacySettings)).toEqual([]);
  });

  it("is invisible to the public form role, and refuses a number that is not E.164 or an empty name", async () => {
    await saveNominee(dbs.app.db, ASHA, { name: "Meera Rao", phone: "+919876543210" });
    expect(await captureErrorText(dbs.publicRole.db.select().from(userPrivacySettings))).toContain("permission denied");
    expect(await captureErrorText(saveNominee(dbs.app.db, RAVI, { name: "Meera", phone: "98765" }))).toContain("user_privacy_settings_phone_check");
    expect(await captureErrorText(saveNominee(dbs.app.db, RAVI, { name: "", phone: "+919876543210" }))).toContain("user_privacy_settings_name_check");
  });
});
