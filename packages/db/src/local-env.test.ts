import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findWorkspaceRoot, requireEnv } from "./local-env";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("findWorkspaceRoot", () => {
  it("walks up to the directory that contains pnpm-workspace.yaml", () => {
    const root = makeTempDir("fynix-root-");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    const nested = join(root, "packages", "db", "src");
    mkdirSync(nested, { recursive: true });

    expect(findWorkspaceRoot(nested)).toBe(root);
  });

  it("throws a helpful error outside a workspace", () => {
    const outside = makeTempDir("fynix-outside-");

    expect(() => findWorkspaceRoot(outside)).toThrow(/Could not find pnpm-workspace\.yaml/);
  });

  it("resolves a relative start directory instead of stopping immediately", () => {
    const root = makeTempDir("fynix-relative-root-");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    const nested = join(root, "packages", "db", "src");
    mkdirSync(nested, { recursive: true });

    const originalCwd = process.cwd();
    try {
      process.chdir(nested);
      expect(realpathSync(findWorkspaceRoot("."))).toBe(realpathSync(root));
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("requireEnv", () => {
  const NAME = "FYNIX_TEST_REQUIRE_ENV";

  afterEach(() => {
    delete process.env[NAME];
  });

  it("returns the trimmed value", () => {
    process.env[NAME] = "  value  ";
    expect(requireEnv(NAME)).toBe("value");
  });

  it("throws when the variable is missing or blank", () => {
    expect(() => requireEnv(NAME)).toThrow(`${NAME} is not set`);
    process.env[NAME] = "   ";
    expect(() => requireEnv(NAME)).toThrow(`${NAME} is not set`);
  });
});
