import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SecretInput } from "./secret-input";

describe("SecretInput", () => {
  it("starts hidden, posts under the name it was given, and offers a button to show it", () => {
    const html = renderToStaticMarkup(createElement(SecretInput, { id: "teams-support", name: "teamsUrl", maxLength: 1000 }));
    expect(html).toContain('type="password"');
    expect(html).toContain('name="teamsUrl"');
    expect(html).toContain('id="teams-support"');
    expect(html).toContain('aria-label="Show the address"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('type="button"');
  });
});
