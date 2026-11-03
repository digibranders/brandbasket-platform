import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { ToastProvider } from "@/ui";
import { ComponentsShowcase } from "./components-showcase";
import { Showcase } from "./showcase";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const read = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");

/** Components exported from an index: value exports that start with a capital letter. */
function componentsOf(indexPath: string): string[] {
  const index = read(indexPath);
  return [...index.matchAll(/export \{([^}]*)\}/g)]
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((name) => name.trim())
    .filter((name) => /^[A-Z][a-z]/.test(name) && !name.startsWith("type "));
}

describe("the design system preview", () => {
  it("has an entry for every primitive (plan 60, section 16)", () => {
    const showcase = read("showcase.tsx");
    // The provider wraps the whole app in the root layout; the preview shows a toast through useToast.
    const missing = componentsOf("../../ui/index.ts").filter((name) => name !== "ToastProvider" && !showcase.includes(`<${name}`));
    expect(missing).toEqual([]);
  });

  it("has an entry for every application component", () => {
    const showcase = read("components-showcase.tsx");
    const missing = componentsOf("../../components/index.ts").filter((name) => !showcase.includes(`<${name}`));
    expect(missing).toEqual([]);
  });

  it("renders the application components", () => {
    render(
      <NuqsTestingAdapter>
        <ComponentsShowcase />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByText("Application components")).toBeTruthy();
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
