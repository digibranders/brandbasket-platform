import { describe, expect, it } from "vitest";
import { sessionise } from "./sessionise";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 5, 4, 0, 0) + minutes * 60_000);
const hit = (visitorHash: string, minutes: number) => ({ visitorHash, at: at(minutes) });

describe("sessionise", () => {
  it("keeps hits within 30 minutes of each other in one visit", () => {
    const visits = sessionise([hit("a", 0), hit("a", 10), hit("a", 40)]);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ visitorHash: "a", start: at(0), end: at(40) });
    expect(visits[0]?.hits).toHaveLength(3);
  });

  it("starts a new visit after a gap of more than 30 minutes, not exactly 30", () => {
    expect(sessionise([hit("a", 0), hit("a", 30)])).toHaveLength(1);
    expect(sessionise([hit("a", 0), hit("a", 31)])).toHaveLength(2);
  });

  it("keeps different visitors apart", () => {
    expect(sessionise([hit("a", 0), hit("b", 1), hit("a", 2)]).map((visit) => [visit.visitorHash, visit.hits.length])).toEqual([["a", 2], ["b", 1]]);
  });

  it("puts hits in time order whatever order they arrive in, and orders visits by start", () => {
    const visits = sessionise([hit("b", 5), hit("a", 20), hit("a", 0)]);
    expect(visits.map((visit) => visit.start)).toEqual([at(0), at(5)]);
    expect(visits[0]?.hits.map((entry) => entry.at)).toEqual([at(0), at(20)]);
  });

  it("returns nothing for nothing and leaves its input alone", () => {
    expect(sessionise([])).toEqual([]);
    const input = [hit("a", 5), hit("a", 0)];
    sessionise(input);
    expect(input.map((entry) => entry.at)).toEqual([at(5), at(0)]);
  });
});
