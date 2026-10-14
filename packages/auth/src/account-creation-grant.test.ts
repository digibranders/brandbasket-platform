import { describe, expect, it } from "vitest";
import { hasAccountCreationGrant, withAccountCreationGrant } from "./account-creation-grant";

describe("account creation grants", () => {
  it("is absent outside a grant", () => {
    expect(hasAccountCreationGrant("owner@example.com")).toBe(false);
  });

  it("applies to the granted email, ignoring case and surrounding spaces", async () => {
    const inside = await withAccountCreationGrant(" Owner@Example.com ", async () =>
      hasAccountCreationGrant("owner@example.com"),
    );
    expect(inside).toBe(true);
  });

  it("does not apply to a different email", async () => {
    const inside = await withAccountCreationGrant("owner@example.com", async () =>
      hasAccountCreationGrant("someone-else@example.com"),
    );
    expect(inside).toBe(false);
  });

  it("survives awaits inside the granted work", async () => {
    const inside = await withAccountCreationGrant("owner@example.com", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return hasAccountCreationGrant("owner@example.com");
    });
    expect(inside).toBe(true);
  });

  it("ends when the granted work finishes", async () => {
    await withAccountCreationGrant("owner@example.com", async () => undefined);
    expect(hasAccountCreationGrant("owner@example.com")).toBe(false);
  });

  it("rejects a malformed email instead of granting it", async () => {
    await expect(withAccountCreationGrant("not-an-email", async () => undefined)).rejects.toThrow(
      "Account creation grants need a valid email address.",
    );
  });

  it("rejects an email that is only valid ASCII after lowercasing", async () => {
    // K is the KELVIN SIGN, not ASCII "K". It lowercases to ASCII "k", so validating after
    // lowercasing would let it through; validating the original input must reject it instead.
    await expect(withAccountCreationGrant("K@example.com", async () => undefined)).rejects.toThrow(
      "Account creation grants need a valid email address.",
    );
  });

  it("keeps two concurrent grants isolated from each other across interleaved awaits", async () => {
    const [first, second] = await Promise.all([
      withAccountCreationGrant("first@example.com", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return hasAccountCreationGrant("first@example.com") && !hasAccountCreationGrant("second@example.com");
      }),
      withAccountCreationGrant("second@example.com", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return hasAccountCreationGrant("second@example.com") && !hasAccountCreationGrant("first@example.com");
      }),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
  });
});
