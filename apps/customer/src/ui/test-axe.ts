import { axe } from "vitest-axe";
import { expect } from "vitest";

/** Fails on any axe violation. Colour contrast is measured from the tokens instead (tokens.contrast.test.ts): happy-dom has no layout. */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}
