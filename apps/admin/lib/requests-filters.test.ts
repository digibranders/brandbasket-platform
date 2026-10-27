import { describe, expect, it } from "vitest";
import { readRequestFilters, requestsHref } from "./requests-filters";

describe("readRequestFilters", () => {
  it("opens on Needs reply", () => {
    expect(readRequestFilters({})).toEqual({ queue: "needs_reply", mine: false });
  });

  it("reads every filter from the address", () => {
    expect(readRequestFilters({ queue: "done", mine: "1", category: "billing", search: " gstin ", cursor: "0192f3c4-1111-7000-8000-000000000001" })).toEqual({
      queue: "done",
      mine: true,
      category: "billing",
      search: "gstin",
      cursor: "0192f3c4-1111-7000-8000-000000000001",
    });
  });

  it("drops values it does not know instead of failing the page", () => {
    expect(readRequestFilters({ queue: "everything", category: "made-up", cursor: "not-an-id", mine: "yes" })).toEqual({ queue: "needs_reply", mine: false });
  });
});

describe("requestsHref", () => {
  const filters = { queue: "waiting_on_client" as const, mine: true, category: "billing" as const, search: "gstin", cursor: "0192f3c4-1111-7000-8000-000000000001" };

  it("keeps the other filters and starts from the first page when one changes", () => {
    expect(requestsHref(filters, { queue: "done" })).toBe("/support?queue=done&mine=1&category=billing&search=gstin");
  });

  it("leaves out defaults", () => {
    expect(requestsHref({ queue: "needs_reply", mine: false }, {})).toBe("/support");
    expect(requestsHref(filters, { mine: false, category: undefined, search: undefined, queue: "needs_reply" })).toBe("/support");
  });

  it("keeps the page cursor only when asked for the next page", () => {
    expect(requestsHref(filters, { cursor: "0192f3c4-1111-7000-8000-000000000009" })).toBe(
      "/support?queue=waiting_on_client&mine=1&category=billing&search=gstin&cursor=0192f3c4-1111-7000-8000-000000000009",
    );
  });
});
