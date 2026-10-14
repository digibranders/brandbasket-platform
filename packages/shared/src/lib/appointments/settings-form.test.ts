import { describe, expect, it } from "vitest";
import { parsePausedMessage, parseServiceName, parseSlotSettings } from "./settings-form";

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const validSlotSettings = { slotMinutes: "30", minNoticeMinutes: "60", horizonDays: "28" };

describe("parsePausedMessage", () => {
  it("trims the message", () => {
    expect(parsePausedMessage("  Back on Monday  ")).toEqual({ success: true, data: "Back on Monday" });
  });

  it("treats a blank message as none", () => {
    expect(parsePausedMessage("   ")).toEqual({ success: true, data: null });
    expect(parsePausedMessage("")).toEqual({ success: true, data: null });
  });

  it("rejects a message that is too long", () => {
    expect(parsePausedMessage("x".repeat(161))).toEqual({
      success: false,
      field: "pausedMessage",
      message: "Keep the message to 160 characters.",
    });
  });

  it("accepts a message right at the limit", () => {
    expect(parsePausedMessage("x".repeat(160))).toMatchObject({ success: true });
  });

  it("squashes a carriage-return/line-feed into a space", () => {
    expect(parsePausedMessage("Back\r\non Monday")).toEqual({ success: true, data: "Back on Monday" });
  });

  it("strips a stray control character", () => {
    expect(parsePausedMessage("Back\u0000 on Monday")).toEqual({ success: true, data: "Back on Monday" });
  });
});

describe("parseServiceName", () => {
  it("trims the name", () => {
    expect(parseServiceName("  Root canal  ")).toEqual({ success: true, data: "Root canal" });
  });

  it("rejects an empty name", () => {
    expect(parseServiceName("   ")).toEqual({
      success: false,
      field: "name",
      message: "Name the service in up to 80 characters.",
    });
  });

  it("rejects a name that is too long", () => {
    expect(parseServiceName("x".repeat(81))).toEqual({
      success: false,
      field: "name",
      message: "Name the service in up to 80 characters.",
    });
  });

  it("accepts a name right at the limit", () => {
    expect(parseServiceName("x".repeat(80))).toMatchObject({ success: true });
  });

  it("squashes a carriage-return/line-feed into a space", () => {
    expect(parseServiceName("Root\r\ncanal")).toEqual({ success: true, data: "Root canal" });
  });

  it("strips a stray control character", () => {
    expect(parseServiceName("Root\u0000 canal")).toEqual({ success: true, data: "Root canal" });
  });
});

describe("parseSlotSettings", () => {
  it("accepts a valid combination", () => {
    expect(parseSlotSettings(formData(validSlotSettings))).toEqual({
      success: true,
      data: { slotMinutes: 30, minNoticeMinutes: 60, horizonDays: 28 },
    });
  });

  it("accepts every published slotMinutes option", () => {
    for (const slotMinutes of [15, 20, 30, 45, 60]) {
      expect(parseSlotSettings(formData({ ...validSlotSettings, slotMinutes: String(slotMinutes) }))).toMatchObject({
        success: true,
        data: { slotMinutes },
      });
    }
  });

  it("accepts every published minNoticeMinutes option", () => {
    for (const minNoticeMinutes of [0, 60, 120, 240, 1440]) {
      expect(
        parseSlotSettings(formData({ ...validSlotSettings, minNoticeMinutes: String(minNoticeMinutes) })),
      ).toMatchObject({ success: true, data: { minNoticeMinutes } });
    }
  });

  it("accepts every published horizonDays option", () => {
    for (const horizonDays of [7, 14, 28, 56]) {
      expect(parseSlotSettings(formData({ ...validSlotSettings, horizonDays: String(horizonDays) }))).toMatchObject({
        success: true,
        data: { horizonDays },
      });
    }
  });

  it("rejects a slotMinutes that is not one of the published options", () => {
    expect(parseSlotSettings(formData({ ...validSlotSettings, slotMinutes: "25" }))).toMatchObject({
      success: false,
      field: "slotMinutes",
      message: "Choose a slot length.",
    });
  });

  it("rejects a minNoticeMinutes that is not one of the published options", () => {
    expect(parseSlotSettings(formData({ ...validSlotSettings, minNoticeMinutes: "30" }))).toMatchObject({
      success: false,
      field: "minNoticeMinutes",
      message: "Choose a minimum notice.",
    });
  });

  it("rejects a horizonDays that is not one of the published options", () => {
    expect(parseSlotSettings(formData({ ...validSlotSettings, horizonDays: "21" }))).toMatchObject({
      success: false,
      field: "horizonDays",
      message: "Choose a booking window.",
    });
  });

  it("rejects a missing field", () => {
    expect(parseSlotSettings(formData({ minNoticeMinutes: "60", horizonDays: "28" }))).toMatchObject({
      success: false,
      field: "slotMinutes",
    });
  });

  it("rejects a non-numeric value", () => {
    expect(parseSlotSettings(formData({ ...validSlotSettings, slotMinutes: "thirty" }))).toMatchObject({
      success: false,
      field: "slotMinutes",
    });
  });

  it("rejects a non-integer value", () => {
    expect(parseSlotSettings(formData({ ...validSlotSettings, slotMinutes: "30.5" }))).toMatchObject({
      success: false,
      field: "slotMinutes",
    });
  });

  it("checks fields in order and reports the first failure", () => {
    expect(parseSlotSettings(formData({ slotMinutes: "25", minNoticeMinutes: "30", horizonDays: "21" }))).toMatchObject({
      field: "slotMinutes",
    });
  });
});
