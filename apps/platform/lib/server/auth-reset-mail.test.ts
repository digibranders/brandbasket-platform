import { beforeEach, expect, it, vi } from "vitest";
import { createAuth, type AuthConfig } from "@brandbasket/auth";
import { generatePasswordResetEmail } from "./auth";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: () => ({}) }));
vi.mock("./public-db", () => ({ getPublicDb: vi.fn() }));
vi.mock("./env", () => ({ serverEnv: () => ({
  BETTER_AUTH_SECRET: "s".repeat(32), APP_ORIGIN: "https://app.fynix.digital", ADMIN_ORIGIN: "https://console.fynix.digital",
}) }));
vi.mock("@brandbasket/auth", async () => ({
  ...await vi.importActual<typeof import("@brandbasket/auth")>("@brandbasket/auth"), createAuth: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it("keeps concurrently generated messages in their own request capture", async () => {
  vi.mocked(createAuth).mockImplementation((config: AuthConfig) => ({
    api: { requestPasswordReset: async ({ body }: { body: { email: string } }) => {
      await Promise.resolve();
      if (body.email === "absent@example.com") return;
      await config.mailer?.sendPasswordReset({ email: body.email, name: "Owner", token: `token-${body.email.split("@")[0]}` });
    } },
  } as unknown as ReturnType<typeof createAuth>));
  const [first, absent, second] = await Promise.all([
    generatePasswordResetEmail("first@example.com"), generatePasswordResetEmail("absent@example.com"), generatePasswordResetEmail("second@example.com"),
  ]);
  expect(first).toMatchObject({ to: "first@example.com", bodyText: expect.stringContaining("token-first") });
  expect(second).toMatchObject({ to: "second@example.com", bodyText: expect.stringContaining("token-second") });
  expect(absent).toBeNull();
  expect(createAuth).toHaveBeenCalledTimes(3);
  expect(vi.mocked(createAuth).mock.calls.every(([config]) => config.nextCookies === false)).toBe(true);
});
