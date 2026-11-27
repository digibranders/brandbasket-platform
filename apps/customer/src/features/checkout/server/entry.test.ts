import { describe, expect, it } from "vitest";
import { unpaidHoldRedirect } from "@/lib/guard-rules";
import { isAwaitingFirstPayment } from "./entry";

// "server-only" is mocked: entry.ts reads the database in its loaders, which these tests never call.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

describe("isAwaitingFirstPayment", () => {
  it("holds a sign-up account that chose Managed Website and has not paid", () => {
    expect(isAwaitingFirstPayment({ kind: "listing", signupChoice: "managed" } as never)).toBe(true);
  });

  it("does not hold a business being built (plan 66): its advance made it a website client, so every page opens", () => {
    const building = { kind: "website", signupChoice: "managed" } as never;
    expect(isAwaitingFirstPayment(building)).toBe(false);
    expect(unpaidHoldRedirect("/", isAwaitingFirstPayment(building))).toBeNull();
    expect(unpaidHoldRedirect("/website", isAwaitingFirstPayment(building))).toBeNull();
  });
});
