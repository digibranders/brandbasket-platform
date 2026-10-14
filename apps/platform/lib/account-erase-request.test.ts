import { describe, expect, it } from "vitest";
import { ERASE_RUN_DEFAULT_LIMIT, parseEraseRunRequest } from "./account-erase-request";

const parse = (query: string) => parseEraseRunRequest(new URL(`https://app.example/api/internal/erase-closed-accounts${query}`));

describe("parseEraseRunRequest", () => {
  it("defaults to a real run of the default size", () => {
    expect(parse("")).toEqual({ dryRun: false, limit: ERASE_RUN_DEFAULT_LIMIT });
  });

  it("reads a dry run and a limit", () => {
    expect(parse("?dryRun=1&limit=5")).toEqual({ dryRun: true, limit: 5 });
    expect(parse("?dryRun=0")).toEqual({ dryRun: false, limit: ERASE_RUN_DEFAULT_LIMIT });
  });

  it.each(["?dryRun=yes", "?dryRun=true", "?limit=0", "?limit=-1", "?limit=1.5", "?limit=abc", "?limit=101", "?limit=0010", "?limit="])(
    "refuses %s rather than guessing",
    (query) => {
      expect(parse(query)).toBeNull();
    },
  );
});
