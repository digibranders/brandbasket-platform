import { describe, expect, it } from "vitest";
import { staffBellView, type StaffBellRow } from "./staff-bell";

const row = (overrides: Partial<StaffBellRow> = {}): StaffBellRow => ({
  id: "n1",
  title: "Did the kickoff call with Asha Cafe happen?",
  body: null,
  link: "/calls",
  createdAt: new Date("2026-11-17T04:30:00.000Z"),
  readAt: null,
  ...overrides,
});

describe("staffBellView", () => {
  it("lists the notices as given, with India time, and counts the unread ones", () => {
    const view = staffBellView([row(), row({ id: "n2", title: "Started without call confirmation", body: "Asha Cafe", readAt: new Date("2026-11-17T05:00:00.000Z") })]);
    expect(view.items).toEqual([
      { id: "n1", title: "Did the kickoff call with Asha Cafe happen?", body: null, href: "/calls", when: "17 Nov, 10:00", unread: true },
      { id: "n2", title: "Started without call confirmation", body: "Asha Cafe", href: "/calls", when: "17 Nov, 10:00", unread: false },
    ]);
    expect(view.unread).toBe(1);
  });

  it("opens Today for a notice with no link", () => {
    expect(staffBellView([row({ link: null })]).items[0]?.href).toBe("/");
  });

  it("is empty with nothing to show", () => {
    expect(staffBellView([])).toEqual({ items: [], unread: 0 });
  });
});
