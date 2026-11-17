import { NOTIFICATION_TOPICS, type ChannelChoices } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { alwaysSentLines, notificationRows } from "./notifications";

const ON: ChannelChoices = { bell: true, email: true, push: false };

describe("notificationRows", () => {
  const choices = Object.fromEntries(NOTIFICATION_TOPICS.map((topic) => [topic, ON])) as Record<(typeof NOTIFICATION_TOPICS)[number], ChannelChoices>;
  const custom = { ...choices, billing: { bell: true, email: false, push: true }, product_news: { bell: false, email: false, push: false } };

  it("has one row for every topic the database knows, in its order, with the person's choice on each channel", () => {
    const rows = notificationRows(custom);
    expect(rows.map((row) => row.topic)).toEqual([...NOTIFICATION_TOPICS]);
    expect(rows.find((row) => row.topic === "billing")).toMatchObject({ bell: true, email: false, push: true });
    expect(rows.find((row) => row.topic === "calls")).toMatchObject({ bell: true, email: true, push: false });
  });

  it("words every row and keeps dashes out of the words", () => {
    for (const row of notificationRows(choices)) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.label).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
    }
  });

  it("lists what is always sent, from the event registry, without dashes", () => {
    const lines = alwaysSentLines();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
  });
});
