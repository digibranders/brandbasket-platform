import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", () => ({}));

const { LISTING_ACCOUNT_HOME, LISTING_PAGE_PATH } = await import("./customer-access");

describe("where a free listing account lands", () => {
  it("is a page that exists, not a removed one", () => {
    expect(LISTING_PAGE_PATH).toBe("/details");
    expect(LISTING_ACCOUNT_HOME).toBe(LISTING_PAGE_PATH);
    expect(existsSync(new URL(`../../app/app-host/(protected)${LISTING_PAGE_PATH}/page.tsx`, import.meta.url))).toBe(true);
  });
});
