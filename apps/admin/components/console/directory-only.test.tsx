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
    expect(renderToStaticMarkup(<DirectoryOnly directory>Ads</DirectoryOnly>)).toBe("Ads");
  });

  it("answers as a page that does not exist where it does not (Fynix)", () => {
    expect(() => renderToStaticMarkup(<DirectoryOnly directory={false}>Ads</DirectoryOnly>)).toThrow("NEXT_NOT_FOUND");
  });
});
