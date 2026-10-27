import { listDeliverablesForStaff, listMonthlyReportsForStaff } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBoughtServices } from "@/lib/server/bought-services";
import { WORK_NOTICES, WORK_NOTICE_TEXT, readWorkNotice, type WorkNotice } from "@/lib/work-notices";
import { WorkSection } from "./work-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listDeliverablesForStaff: vi.fn(), listMonthlyReportsForStaff: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({ db: true })) }));
vi.mock("@/lib/server/bought-services", () => ({ listBoughtServices: vi.fn() }));
vi.mock("@/app/(protected)/clients/[businessId]/work-actions", () => ({
  addDeliverableAction: vi.fn(),
  saveDeliverableAction: vi.fn(),
  moveDeliverableAction: vi.fn(),
  deleteDeliverableAction: vi.fn(),
  saveReportAction: vi.fn(),
  removeReportAction: vi.fn(),
}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const ITEM = "01a0f71b-8402-7d48-a90a-207e8c8a8aaa";

function item(over: Record<string, unknown> = {}): never {
  return {
    id: ITEM,
    businessId: BUSINESS,
    service: "social",
    kind: "post",
    title: "Diwali offer",
    caption: "Come in",
    dueOn: "2026-11-01",
    status: "planned",
    linkUrl: null,
    imageKey: null,
    approvedAt: null,
    ...over,
  } as never;
}

async function render(notice: WorkNotice | null = null): Promise<string> {
  return renderToStaticMarkup(await WorkSection({ businessId: BUSINESS, notice }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listBoughtServices).mockResolvedValue(["social", "search"]);
  vi.mocked(listDeliverablesForStaff).mockResolvedValue([]);
  vi.mocked(listMonthlyReportsForStaff).mockResolvedValue([]);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T06:30:00Z"));
});

describe("WorkSection", () => {
  it("renders nothing when the business bought neither service", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue([]);
    expect(await render()).toBe("");
    expect(listDeliverablesForStaff).not.toHaveBeenCalled();
  });

  it("asks for what is dated today (India) or later, plus anything not yet published", async () => {
    await render();
    expect(listDeliverablesForStaff).toHaveBeenCalledWith({ db: true }, BUSINESS, { from: "2026-10-27" });
  });

  it("shows only the Social block for Social, with the add form and the picture field", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
    const html = await render();
    expect(html).toContain('id="work"');
    expect(html).toContain("Add a post");
    expect(html).toContain('name="picture"');
    expect(html).toContain('<input type="hidden" name="kind" value="post"/>');
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
    expect(html).not.toContain("Add a page or listing");
  });

  it("shows only the Search block for Search, with a kind choice", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    const html = await render();
    expect(html).toContain("Add a page or listing");
    expect(html).toContain('<option value="page"');
    expect(html).toContain('<option value="listing"');
    expect(html).not.toContain("Add a post");
  });

  it("a planned post shows Send for approval, Delete and an edit form", async () => {
    vi.mocked(listDeliverablesForStaff).mockResolvedValue([item()]);
    const html = await render();
    expect(html).toContain("Diwali offer");
    expect(html).toContain("Send for approval");
    expect(html).toContain('value="send"');
    expect(html).toContain("Delete");
    expect(html).toContain("Save changes");
    expect(html).not.toContain("Take back");
  });

  it("a post waiting for the customer shows Take back and an edit form, and no Delete", async () => {
    vi.mocked(listDeliverablesForStaff).mockResolvedValue([item({ status: "awaiting_approval" })]);
    const html = await render();
    expect(html).toContain("Take back");
    expect(html).toContain('value="pull"');
    expect(html).toContain("Save changes");
    expect(html).not.toContain("Send for approval");
    expect(html).not.toContain(">Delete<");
  });

  it("an approved post says when the customer approved it, has no edit form, and offers Take back and Mark published", async () => {
    vi.mocked(listDeliverablesForStaff).mockResolvedValue([item({ status: "approved", approvedAt: new Date("2026-10-26T18:45:00Z") })]);
    const html = await render();
    expect(html).toContain("Approved by the customer on 27 October 2026");
    expect(html).not.toContain("Save changes");
    expect(html).toContain("Take back");
    expect(html).toContain("Mark published");
    expect(html).toContain('name="linkUrl"');
  });

  it("a published post shows no buttons and no forms beyond the add and report forms", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["social"]);
    vi.mocked(listDeliverablesForStaff).mockResolvedValue([item({ status: "published" })]);
    const html = await render();
    expect(html).toContain("Diwali offer");
    expect(html).not.toContain("Take back");
    expect(html).not.toContain("Mark published");
    expect(html).not.toContain("Send for approval");
    expect(html).not.toContain("Save changes");
    expect(html).not.toContain(">Delete<");
  });

  it("a planned page offers Mark done with a link box, and Delete, but never Send for approval", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    vi.mocked(listDeliverablesForStaff).mockResolvedValue([item({ service: "search", kind: "page", title: "Home page", caption: null })]);
    const html = await render();
    expect(html).toContain("Home page");
    expect(html).toContain("Mark done");
    expect(html).toContain('name="linkUrl"');
    expect(html).toContain("Delete");
    expect(html).not.toContain("Send for approval");
  });

  it("lists a post under Social and a page under Search only", async () => {
    vi.mocked(listDeliverablesForStaff).mockResolvedValue([item({ title: "A social post" }), item({ id: "01a0f71b-8402-7d48-a90a-207e8c8a8bbb", service: "search", kind: "listing", title: "A maps listing", caption: null })]);
    const html = await render();
    const split = html.indexOf("Add a page or listing");
    expect(html.indexOf("A social post")).toBeLessThan(split);
    expect(html.indexOf("A maps listing")).toBeGreaterThan(split);
  });

  it("serves a thumbnail from the console's picture route only when the post has a picture", async () => {
    vi.mocked(listDeliverablesForStaff).mockResolvedValue([item({ imageKey: `deliverables/${ITEM}/display` })]);
    expect(await render()).toContain(`src="/deliverable-images/${ITEM}"`);
    vi.mocked(listDeliverablesForStaff).mockResolvedValue([item()]);
    expect(await render()).not.toContain("/deliverable-images/");
  });

  it("offers this month and the five before it for a report, and lists the saved links with a Remove", async () => {
    vi.mocked(listBoughtServices).mockResolvedValue(["search"]);
    vi.mocked(listMonthlyReportsForStaff).mockResolvedValue([
      { service: "search", month: "2026-09-01", url: "https://reports.example/sep" },
      { service: "social", month: "2026-09-01", url: "https://reports.example/other" },
    ] as never);
    const html = await render();
    for (const value of ["2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"]) expect(html).toContain(`value="${value}"`);
    expect(html).not.toContain('value="2026-04"');
    expect(html).toContain("https://reports.example/sep");
    expect(html).not.toContain("https://reports.example/other");
    expect(html).toContain('name="month" value="2026-09-01"');
    expect(html).toContain("Remove");
  });

  it("has a line for every notice, and shows the one it is given", async () => {
    for (const notice of WORK_NOTICES) {
      expect(WORK_NOTICE_TEXT[notice].text.length).toBeGreaterThan(5);
      expect(await render(notice)).toContain(WORK_NOTICE_TEXT[notice].text.replace("'", "&#x27;"));
    }
    expect(await render(null)).not.toContain('role="status"');
  });
});

describe("readWorkNotice", () => {
  it("accepts only the known values", () => {
    expect(readWorkNotice("locked")).toBe("locked");
    expect(readWorkNotice("nope")).toBeNull();
    expect(readWorkNotice(["added"])).toBeNull();
    expect(readWorkNotice(undefined)).toBeNull();
  });
});
