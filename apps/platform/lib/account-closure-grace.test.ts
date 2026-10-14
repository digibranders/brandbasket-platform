import { ACCOUNT_CLOSURE_GRACE_DAYS as SCHEMA_DAYS } from "@fynix/db";
import { expect, it } from "vitest";
import { ACCOUNT_CLOSURE_GRACE_DAYS } from "./account-closure-grace";

it("tells the browser the same number of days the database keeps", () => {
  expect(ACCOUNT_CLOSURE_GRACE_DAYS).toBe(SCHEMA_DAYS);
});
