import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findWorkspaceRoot, requireEnv, resolveLocalEnvPath } from "./local-env";

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
    const root = makeTempDir("brandbasket-root-");
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    const nested = join(root, "packages", "db", "src");
    mkdirSync(nested, { recursive: true });

    expect(findWorkspaceRoot(nested)).toBe(root);
  });

  it("throws a helpful error outside a workspace", () => {
    const outside = makeTempDir("brandbasket-outside-");

    expect(() => findWorkspaceRoot(outside)).toThrow(/Could not find pnpm-workspace\.yaml/);
  });

  it("resolves a relative start directory instead of stopping immediately", () => {
    const root = makeTempDir("brandbasket-relative-root-");
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
  const NAME = "BRANDBASKET_TEST_REQUIRE_ENV";

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

describe("resolveLocalEnvPath", () => {
  function workspaceWith(...files: string[]): string {
    const root = makeTempDir("brandbasket-env-root-");
    for (const file of files) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), "A=1\n");
    }
    return root;
  }

  it("prefers apps/platform/.env.local", () => {
    const root = workspaceWith("apps/platform/.env.local", "apps/customer/.env.production");
    expect(resolveLocalEnvPath(root)).toBe(join(root, "apps", "platform", ".env.local"));
  });

  it("falls back to apps/customer when apps/platform has no file", () => {
    const root = workspaceWith("apps/customer/.env.production");
    expect(resolveLocalEnvPath(root)).toBe(join(root, "apps", "customer", ".env.production"));
  });

  it("is null when no file exists", () => {
    expect(resolveLocalEnvPath(workspaceWith())).toBeNull();
  });
});
