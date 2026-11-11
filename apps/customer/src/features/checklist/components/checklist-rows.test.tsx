import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { itemsFor, type ChecklistRow } from "../rules-items";
import { ChecklistRows } from "./checklist-rows";

const [business, brand, services] = itemsFor(["website"]);
if (business === undefined || brand === undefined || services === undefined) throw new Error("The website items are missing.");
const ROWS: readonly ChecklistRow[] = [
  { item: brand, done: false },
  { item: services, done: false },
  { item: business, done: true },
];

describe("ChecklistRows", () => {
  it("says how far along it is and lists every item with its service", () => {
    render(<ChecklistRows rows={ROWS} canWrite />);
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
    expect(within(screen.getAllByRole("listitem")[0] as HTMLElement).getByText("Logo and photos")).toBeTruthy();
    expect(screen.getAllByText("Website")).toHaveLength(3);
  });

  it("gives an open item an Add link to its sheet, and a done item a Done badge", () => {
    render(<ChecklistRows rows={ROWS} canWrite />);
    const adds = screen.getAllByRole("link", { name: "Add" });
    expect(adds.map((link) => link.getAttribute("href"))).toEqual(["/checklist?item=brand", "/checklist?item=services"]);
    expect(screen.getAllByText("Done")).toHaveLength(1);
  });

  it("shows a viewer every item but no Add", () => {
    render(<ChecklistRows rows={ROWS} canWrite={false} />);
    expect(screen.queryByRole("link", { name: "Add" })).toBeNull();
    expect(screen.getByRole("link", { name: /Logo and photos/ }).getAttribute("href")).toBe("/checklist?item=brand");
  });
});
