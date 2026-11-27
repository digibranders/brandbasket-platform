import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { PostRow } from "../view";
import { PostsTable } from "./posts-table";

afterEach(cleanup);

const NOW = "2026-11-27T10:00:00.000Z";
const row = (n: number, platform: PostRow["platform"] = "instagram"): PostRow => ({ key: `k${n}`, title: `Post about topic ${n}`, platform, day: "2026-11-20", link: null, totals: { reach: n, views: n * 2 } });
const rows = Array.from({ length: 12 }, (_, i) => row(i + 1, i < 4 ? "facebook" : "instagram"));
const wrap = (list: readonly PostRow[], searchParams = "") =>
  render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <PostsTable rows={list} nowIso={NOW} />
    </NuqsTestingAdapter>,
  );
const bodyRows = () => within(screen.getByRole("table", { name: "How each post did" })).getAllByRole("row").slice(1);

describe("PostsTable", () => {
  it("shows five posts a page, each with a serial number, and says which ones it shows", () => {
    wrap(rows);
    expect(bodyRows()).toHaveLength(5);
    expect(within(bodyRows()[0] as HTMLElement).getAllByRole("cell")[0]?.textContent).toBe("1");
    expect(within(bodyRows()[4] as HTMLElement).getAllByRole("cell")[0]?.textContent).toBe("5");
    expect(screen.getByText("Showing 1 to 5 of 12 posts")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("goes to the next page and carries the numbers on", () => {
    wrap(rows);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(within(bodyRows()[0] as HTMLElement).getAllByRole("cell")[0]?.textContent).toBe("6");
    expect(screen.getByText("Showing 6 to 10 of 12 posts")).toBeTruthy();
  });

  it("opens on the page in the address, and the last page has what is left", () => {
    wrap(rows, "?page=3");
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText("Showing 11 to 12 of 12 posts")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("filters by network with chips that count the posts, and goes back to the first page", () => {
    wrap(rows, "?page=2");
    fireEvent.click(screen.getByRole("button", { name: /Facebook/ }));
    expect(screen.getByText("Showing 1 to 4 of 4 posts")).toBeTruthy();
    expect(bodyRows()).toHaveLength(4);
    expect(screen.queryByRole("navigation", { name: "Pages of posts" })).toBeNull();
  });

  it("searches the words of a post, and says so when nothing matches", () => {
    wrap(rows);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search posts" }), { target: { value: "topic 7" } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search posts" }), { target: { value: "nothing like this" } });
    expect(screen.getByText("No posts match.")).toBeTruthy();
    expect(screen.getByText("No posts")).toBeTruthy();
  });

  it("shows no network chips when only one network has posts, and no page buttons for a short list", () => {
    wrap([row(1), row(2)]);
    expect(screen.queryByRole("group", { name: "Network" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Pages of posts" })).toBeNull();
    expect(screen.getByText("Showing 1 to 2 of 2 posts")).toBeTruthy();
  });
});
