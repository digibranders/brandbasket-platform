import { expect, it } from "vitest";
import { otpLimitMessage } from "./auth-retry";

it.each([
  ["network", "from this network"], ["phone", "for this number"], ["email", "for this email address"], ["global", "temporarily busy"],
] as const)("describes the actual %s send budget and rounds its wait up", (scope, wording) => {
  const message = otpLimitMessage({ scope, retryAfterSeconds: 137 }, "send");
  expect(message).toContain(wording);
  expect(message).toContain("3 minutes");
  expect(message).not.toContain("sent to this number");
});

it("keeps a short retry precise and treats confirmation as checks", () => {
  expect(otpLimitMessage({ scope: "network", retryAfterSeconds: 15 }, "confirm"))
    .toBe("Too many code checks from this network. Try again in 15 seconds.");
});
