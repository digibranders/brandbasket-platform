import { countChatbotLeadsForBusiness, countChatbotLeadsSince, listChatbotLeadsForBusiness, listChatbotsForBusiness, renameChatbot, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEADS_PER_PAGE, loadChatbots, loadLeadsPage, renameCustomerChatbot } from "./chatbots";
import { getAppDb } from "./db";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ countChatbotLeadsForBusiness: vi.fn(), countChatbotLeadsSince: vi.fn(), listChatbotLeadsForBusiness: vi.fn(), listChatbotsForBusiness: vi.fn(), renameChatbot: vi.fn(), withTenantScope: vi.fn() }));

const appDb = { name: "app-db" } as never;
const appTx = { name: "app-tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
});

describe("loadChatbots", () => {
  it("reads the signed-in business's bots through its own tenant scope", async () => {
    const bots = [{ id: "bot-1" }] as never;
    vi.mocked(listChatbotsForBusiness).mockResolvedValue(bots);

    expect(await loadChatbots({ tenant })).toBe(bots);

    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(listChatbotsForBusiness).toHaveBeenCalledWith(appTx, "business-1");
  });
});

describe("loadLeadsPage", () => {
  beforeEach(() => {
    vi.mocked(listChatbotsForBusiness).mockResolvedValue([{ id: "bot-1" }] as never);
    vi.mocked(listChatbotLeadsForBusiness).mockResolvedValue([{ id: "lead-1" }] as never);
  });

  it("reads the requested page of ten, newest first, with the total, through the signed-in business's tenant scope", async () => {
    vi.mocked(countChatbotLeadsForBusiness).mockResolvedValue(23);

    const result = await loadLeadsPage({ tenant }, 2);

    expect(result).toMatchObject({ total: 23, page: 2, pageCount: 3, bots: [{ id: "bot-1" }], leads: [{ id: "lead-1" }] });
    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(countChatbotLeadsForBusiness).toHaveBeenCalledWith(appTx, "business-1");
    expect(listChatbotLeadsForBusiness).toHaveBeenCalledWith(appTx, "business-1", LEADS_PER_PAGE, 10);
    expect(LEADS_PER_PAGE).toBe(10);
  });

  it("counts the leads of the last 7 and the last 30 days for the figures", async () => {
    vi.mocked(countChatbotLeadsForBusiness).mockResolvedValue(23);
    vi.mocked(countChatbotLeadsSince).mockResolvedValueOnce(3).mockResolvedValueOnce(9);

    const now = new Date("2026-10-28T10:00:00Z");
    expect(await loadLeadsPage({ tenant }, 1, now)).toMatchObject({ lastWeek: 3, lastMonth: 9 });
    expect(countChatbotLeadsSince).toHaveBeenNthCalledWith(1, appTx, "business-1", new Date("2026-10-21T10:00:00Z"));
    expect(countChatbotLeadsSince).toHaveBeenNthCalledWith(2, appTx, "business-1", new Date("2026-09-28T10:00:00Z"));
  });

  it("gives the last page for a request past the end, and the first for one before the start or not a whole number", async () => {
    vi.mocked(countChatbotLeadsForBusiness).mockResolvedValue(23);

    expect((await loadLeadsPage({ tenant }, 99)).page).toBe(3);
    expect(listChatbotLeadsForBusiness).toHaveBeenLastCalledWith(appTx, "business-1", 10, 20);
    expect((await loadLeadsPage({ tenant }, 0)).page).toBe(1);
    expect((await loadLeadsPage({ tenant }, -4)).page).toBe(1);
    expect((await loadLeadsPage({ tenant }, 2.7)).page).toBe(2);
  });

  it("is one page, number 1, when there are no leads", async () => {
    vi.mocked(countChatbotLeadsForBusiness).mockResolvedValue(0);
    expect(await loadLeadsPage({ tenant }, 5)).toMatchObject({ total: 0, page: 1, pageCount: 1 });
    expect(listChatbotLeadsForBusiness).toHaveBeenLastCalledWith(appTx, "business-1", 10, 0);
  });

  it("fills a page exactly when the total is a multiple of ten", async () => {
    vi.mocked(countChatbotLeadsForBusiness).mockResolvedValue(20);
    expect((await loadLeadsPage({ tenant }, 2)).pageCount).toBe(2);
  });
});

describe("renameCustomerChatbot", () => {
  it("renames through the signed-in business's own tenant scope, naming that business and not one from the request", async () => {
    vi.mocked(renameChatbot).mockResolvedValue(true);

    expect(await renameCustomerChatbot({ tenant }, "bot-1", "Booking helper")).toBe(true);

    expect(withTenantScope).toHaveBeenCalledWith(appDb, tenant, expect.any(Function));
    expect(renameChatbot).toHaveBeenCalledWith(appTx, { chatbotId: "bot-1", businessId: "business-1", name: "Booking helper" });
  });

  it("says false when no such bot belongs to the business", async () => {
    vi.mocked(renameChatbot).mockResolvedValue(false);
    expect(await renameCustomerChatbot({ tenant }, "someone-elses", "Mine now")).toBe(false);
  });
});
