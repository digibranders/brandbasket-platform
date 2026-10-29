import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "theme.css"), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`, or "" when there is none. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return "";
  return css.slice(start, css.indexOf("}", start));
}

function names(body: string): string[] {
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

const brand = block('html[data-brand="brandbasket"]');
const V2_SELECTOR = 'html[data-brand="brandbasket"]:is([data-app="customer"], [data-app="console"])';
const CUSTOMER_SELECTOR = 'html[data-brand="brandbasket"][data-app="customer"]';
const v2 = block(V2_SELECTOR);
const customer = block(CUSTOMER_SELECTOR);

describe("the v2 palette for the customer dashboard and the staff console", () => {
  it("has one block, for both apps", () => {
    expect(v2).not.toBe("");
  });

  it("sets every colour and font the Brandbasket block sets, so nothing of the old look leaks through", () => {
    const remapped = names(v2);
    for (const name of names(brand)) expect(remapped).toContain(name);
  });

  it("drops the old navy and Figtree", () => {
    expect(v2.toLowerCase()).not.toContain("#0c1e2e");
    expect(v2).not.toContain("figtree");
  });

  it("gives the customer portal its own block, after the shared one (the two tie in specificity), that restates every colour the shared one sets", () => {
    expect(customer).not.toBe("");
    expect(css.indexOf(`${CUSTOMER_SELECTOR} {`)).toBeGreaterThan(css.indexOf(`${V2_SELECTOR} {`));
    const restated = names(customer);
    for (const name of names(v2).filter((token) => token.startsWith("--color-"))) expect(restated).toContain(name);
  });

  it("defines the v2 tokens the new screens use", () => {
    for (const token of ["--color-bg", "--color-surface", "--color-sunken", "--color-ink-2", "--color-rattan", "--color-rattan-wash", "--color-sage", "--color-c-site", "--shadow-lift", "--radius-lift", "--color-ink-3", "--color-ok", "--color-warn", "--color-info", "--color-error-wash"]) {
      expect(css).toContain(`${token}:`);
    }
  });
});
