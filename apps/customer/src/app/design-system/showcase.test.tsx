import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/ui";
import { Showcase } from "./showcase";

const read = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");

/** Components exported from src/ui: value exports that start with a capital letter. */
function uiComponents(): string[] {
  const index = read("../../ui/index.ts");
  return [...index.matchAll(/export \{([^}]*)\}/g)]
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((name) => name.trim())
    .filter((name) => /^[A-Z][a-z]/.test(name) && !name.startsWith("type "));
}

describe("the design system preview", () => {
  it("has an entry for every primitive (plan 60, section 16)", () => {
    const showcase = read("showcase.tsx");
    // The provider wraps the whole app in the root layout; the preview shows a toast through useToast.
    const missing = uiComponents().filter((name) => name !== "ToastProvider" && !showcase.includes(`<${name}`));
    expect(missing).toEqual([]);
  });

  it("renders", () => {
    render(
      <ToastProvider>
        <Showcase />
      </ToastProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Design system" })).toBeTruthy();
  });
});
