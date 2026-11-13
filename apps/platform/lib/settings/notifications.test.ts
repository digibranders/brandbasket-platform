import { NOTIFICATION_TOPICS } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { notificationChoiceSchema, notificationRows, NOTIFICATION_SAVE_FAILED, NOTIFICATION_UNKNOWN_TOPIC } from "./notifications";

const choices = { new_enquiry: true, needs_approval: true, request_reply: true, billing: false, monthly_report: true, product_news: false };

describe("notificationRows", () => {
  it("has one row for every topic the database knows, in its order, with the person's choice", () => {
    const rows = notificationRows(choices);
    expect(rows.map((row) => row.topic)).toEqual([...NOTIFICATION_TOPICS]);
    expect(rows.find((row) => row.topic === "billing")?.email).toBe(false);
    expect(rows.find((row) => row.topic === "new_enquiry")?.email).toBe(true);
  });

  it("words every row and keeps dashes out of the words", () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    for (const text of [...notificationRows(choices).map((row) => row.label), NOTIFICATION_UNKNOWN_TOPIC, NOTIFICATION_SAVE_FAILED]) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(dash);
    }
  });
});

describe("notificationChoiceSchema", () => {
  it("accepts a known topic with a boolean", () => {
    expect(notificationChoiceSchema.safeParse({ topic: "product_news", email: true }).success).toBe(true);
  });

  it.each([
    { topic: "sms", email: true },
    { topic: "billing", email: "yes" },
    { topic: "billing" },
    { email: false },
  ])("refuses %j", (input) => {
    expect(notificationChoiceSchema.safeParse(input).success).toBe(false);
  });
});
