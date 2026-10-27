import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS } from "@brandbasket/shared/lib/onboarding/steps";
import { STEP_NOTES, stepNotes } from "./step-notes";

describe("step notes", () => {
  it("has at least one note for every step", () => {
    for (const { key } of ONBOARDING_STEPS) expect(stepNotes(key).length).toBeGreaterThan(0);
  });

  it("uses no em or en dashes", () => {
    const text = Object.values(STEP_NOTES).flatMap((notes) => notes.map((note) => `${note.answer} ${note.use}`)).join(" ");
    expect(text).not.toMatch(/[–—]/);
  });
});
