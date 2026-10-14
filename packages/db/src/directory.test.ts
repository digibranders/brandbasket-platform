import { describe, expect, it } from "vitest";
import { isDirectoryTrending, reviewerDisplayName } from "./queries/directory";

describe("reviewerDisplayName", () => {
  it.each([
    ["Priya Sharma", "Priya S."],
    ["Priya Anand Sharma", "Priya S."],
    ["  Priya   sharma  ", "Priya S."],
    ["Ravi", "Ravi"],
    ["रवि कुमार", "रवि क."],
    ["", ""],
  ])("shows %j as %j", (fullName, shown) => {
    expect(reviewerDisplayName(fullName)).toBe(shown);
  });
});

describe("isDirectoryTrending", () => {
  it.each([
    [20, 0, true],
    [19, 0, false],
    [0, 0, false],
    [30, 20, true],
    [29, 20, false],
    [20, 13, true],
    [20, 14, false],
    [12, 1, false],
    [500, 500, false],
  ])("scores %d against last week's %d as %s", (score, previousScore, trending) => {
    expect(isDirectoryTrending(score, previousScore)).toBe(trending);
  });
});
