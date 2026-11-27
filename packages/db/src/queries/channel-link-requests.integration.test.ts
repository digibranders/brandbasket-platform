import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { reopenChannelLinkRequest } from "./channel-link-requests";
import { execSql, openTestDatabases, querySql, resetTestDatabase, type TestDatabases } from "../testing";

let databases: TestDatabases;

beforeAll(() => {
  databases = openTestDatabases();
});

beforeEach(async () => {
  await resetTestDatabase(databases.owner);
});

afterAll(async () => {
  await databases.closeAll();
});

async function seedRequest(state: "requested" | "invited" | "refused" | "connected"): Promise<{ businessId: string; userId: string }> {
  const [business] = await querySql<{ id: string }>(databases.owner, "insert into businesses (id, slug, name, currency) values (gen_random_uuid(), 'om-sweets', 'Om Sweets', 'INR') returning id");
  if (business === undefined) throw new Error("No business was inserted");
  await execSql(databases.owner, "insert into users (id, name, email) values ('u1', 'Asha', 'asha@om.test')");
  const reason = state === "refused" ? "'Check the link and send it again.'" : "null";
  await execSql(
    databases.owner,
    `insert into channel_link_requests (id, business_id, brand_id, network, url, handle, state, reason, answered_at)
     values (gen_random_uuid(), '${business.id}', 'om-sweets', 'instagram', 'https://www.instagram.com/old_name', 'old_name', '${state}', ${reason}, ${state === "requested" ? "null" : "now()"})`,
  );
  return { businessId: business.id, userId: "u1" };
}

const NEW = { brandId: "om-sweets", network: "instagram", url: "https://www.instagram.com/fynix_digital", handle: "fynix_digital", adminProfileUrl: null } as const;

describe("reopenChannelLinkRequest", () => {
  it("puts a request that was marked connected back with the team, with the new link", async () => {
    const { businessId, userId } = await seedRequest("connected");
    const reopened = await reopenChannelLinkRequest(databases.staff.db, { ...NEW, businessId, userId });
    expect(reopened).toMatchObject({ state: "requested", url: "https://www.instagram.com/fynix_digital", handle: "fynix_digital", reason: null, answeredAt: null, answeredByStaffId: null, notifiedAt: null });
  });

  it.each(["requested", "invited", "refused"] as const)("leaves a %s request as it is: only a connected one is reopened", async (state) => {
    const { businessId, userId } = await seedRequest(state);
    expect(await reopenChannelLinkRequest(databases.staff.db, { ...NEW, businessId, userId })).toBeNull();
    const rows = await querySql<{ state: string; handle: string }>(databases.owner, "select state, handle from channel_link_requests");
    expect(rows).toEqual([{ state, handle: "old_name" }]);
  });
});
