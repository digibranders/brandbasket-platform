import { describe, expect, it } from "vitest";
import { daysWords, parseDays, readSchedule, tidyDays, withChannelDays } from "./schedule";

describe("the days a channel posts on", () => {
  it("puts days in week order, each once, and refuses anything that is not a day", () => {
    expect(tidyDays(["sat", "mon", "tue", "mon"])).toEqual(["mon", "tue", "sat"]);
    expect(tidyDays([])).toBeNull();
    expect(tidyDays(["mon", "funday"])).toBeNull();
    expect(tidyDays(["mon", 3])).toBeNull();
  });

  it("reads the days a form sends, and an empty text as the usual spread", () => {
    expect(parseDays("sat, Mon ,tue")).toEqual(["mon", "tue", "sat"]);
    expect(parseDays("")).toEqual([]);
    expect(parseDays("   ")).toEqual([]);
    expect(parseDays("mon,xyz")).toBeNull();
    expect(parseDays("mon,,tue")).toBeNull();
  });

  it("reads what the posting service holds, keeping only channels with valid days", () => {
    const body = { schedule: { channels: { instagram: { days: ["mon", "tue", "sat"], nextWeek: ["2026-11-16"] }, facebook: { days: [] }, linkedin: { days: ["xyz"] }, tiktok: { days: ["mon"] } } } };
    expect(readSchedule(body)).toEqual({ instagram: ["mon", "tue", "sat"] });
    expect(readSchedule(null)).toEqual({});
    expect(readSchedule({ schedule: {} })).toEqual({});
    expect(readSchedule({ schedule: { channels: "no" } })).toEqual({});
  });

  it("says the days in words, or the usual spread", () => {
    expect(daysWords(["mon", "tue", "sat"])).toBe("Mon, Tue, Sat");
    expect(daysWords([])).toBe("Usual spread");
    expect(daysWords(undefined)).toBe("Usual spread");
  });

  it("builds the whole setting with one channel changed, since the posting service replaces everything it is sent", () => {
    const current = { instagram: ["mon", "tue", "sat"], facebook: ["wed", "fri"] } as const;
    expect(withChannelDays(current, "facebook", ["thu"])).toEqual({ instagram: ["mon", "tue", "sat"], facebook: ["thu"] });
    expect(withChannelDays(current, "facebook", [])).toEqual({ instagram: ["mon", "tue", "sat"] });
    expect(withChannelDays({}, "linkedin", ["fri"])).toEqual({ linkedin: ["fri"] });
  });
});

describe("channels grouped by their days", () => {
  it("keeps channels with the very same days together and those with none together", async () => {
    const { dayGroups } = await import("./schedule");
    expect(dayGroups(["instagram", "facebook", "linkedin"], { instagram: ["mon", "tue"], facebook: ["wed"] })).toEqual([["instagram"], ["facebook"], ["linkedin"]]);
    expect(dayGroups(["instagram", "facebook"], { instagram: ["mon"], facebook: ["mon"] })).toEqual([["instagram", "facebook"]]);
    expect(dayGroups(["instagram", "facebook", "linkedin"], { instagram: ["mon"] })).toEqual([["instagram"], ["facebook", "linkedin"]]);
    expect(dayGroups(["instagram", "facebook"], {})).toEqual([["instagram", "facebook"]]);
  });

  it("treats days nobody knows as one group, and leaves out channels that are not connected", async () => {
    const { dayGroups } = await import("./schedule");
    expect(dayGroups(["instagram", "linkedin"], null)).toEqual([["instagram", "linkedin"]]);
    expect(dayGroups(["facebook"], { instagram: ["mon"], facebook: ["fri"] })).toEqual([["facebook"]]);
    expect(dayGroups([], {})).toEqual([]);
  });
});
