import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Server modules guard themselves with "server-only", which throws outside a React Server Component build.
vi.mock("server-only", () => ({}));

afterEach(() => {
  cleanup();
});
