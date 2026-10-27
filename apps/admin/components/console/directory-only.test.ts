import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DirectoryOnly } from "./directory-only";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("DirectoryOnly", () => {
  it("shows the section where the deployment runs the directory", () => {
    expect(renderToStaticMarkup(createElement(DirectoryOnly, { directory: true }, "Ads"))).toBe("Ads");
  });

  it("answers as a page that does not exist where it does not (Brandbasket)", () => {
    expect(() => renderToStaticMarkup(createElement(DirectoryOnly, { directory: false }, "Ads"))).toThrow("NEXT_NOT_FOUND");
  });
});
