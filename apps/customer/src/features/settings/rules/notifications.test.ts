import { NOTIFICATION_TOPICS } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { notificationRows } from "./notifications";

describe("notificationRows", () => {
  const choices = { new_enquiry: true, needs_approval: true, request_reply: true, billing: false, monthly_report: true, product_news: false };

  it("has one row for every topic the database knows, in its order, with the person's choice", () => {
    const rows = notificationRows(choices);
    expect(rows.map((row) => row.topic)).toEqual([...NOTIFICATION_TOPICS]);
    expect(rows.find((row) => row.topic === "billing")?.email).toBe(false);
    expect(rows.find((row) => row.topic === "new_enquiry")?.email).toBe(true);
  });

  it("words every row and keeps dashes out of the words", () => {
    for (const row of notificationRows(choices)) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.label).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    }
  });
});
