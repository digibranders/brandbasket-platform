import { describe, expect, it } from "vitest";
import { parseRollupRunRequest } from "./site-analytics-rollup-request";

const parse = (query: string) => parseRollupRunRequest(new URL(`https://app.example/api/internal/roll-up-site-analytics${query}`));

describe("parseRollupRunRequest", () => {
  it("defaults to a real run", () => {
    expect(parse("")).toEqual({ dryRun: false });
  });

  it("reads a dry run", () => {
    expect(parse("?dryRun=1")).toEqual({ dryRun: true });
    expect(parse("?dryRun=0")).toEqual({ dryRun: false });
  });

  it.each(["?dryRun=yes", "?dryRun=true", "?dryRun=", "?limit=5", "?x=1"])("refuses %s rather than guessing", (query) => {
    expect(parse(query)).toBeNull();
  });
});
