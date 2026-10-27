import { expect, it } from "vitest";
import { CALLS_PATH } from "./links";
import { REQUESTS_PATH } from "@/lib/requests/links";

it("keeps Calls under Requests, so the Requests link in the rail stays lit on it", () => {
  expect(CALLS_PATH).toBe("/requests/calls");
  expect(CALLS_PATH.startsWith(`${REQUESTS_PATH}/`)).toBe(true);
});
