import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS } from "@brandbasket/shared/lib/onboarding/steps";
import { STEP_NOTES, stepNotes } from "./step-notes";

describe("step notes", () => {
  it("has at least one note for every step", () => {
    for (const { key } of ONBOARDING_STEPS) expect(stepNotes(key).length).toBeGreaterThan(0);
  });

  it("does not tell a customer who has paid to pay", () => {
    const paid = stepNotes("review", { paid: true }).map((note) => `${note.answer} ${note.use}`).join(" ");
    expect(paid).not.toMatch(/pay/i);
    expect(stepNotes("review").map((note) => note.use).join(" ")).toMatch(/Once you pay/);
  });

  it("uses no em or en dashes", () => {
    const text = [...Object.values(STEP_NOTES).flat(), ...stepNotes("review", { paid: true })].map((note) => `${note.answer} ${note.use}`).join(" ");
    expect(text).not.toMatch(/[–—]/);
  });
});
