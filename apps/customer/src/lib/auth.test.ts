import { beforeEach, expect, it, vi } from "vitest";
import { createAuth, type AuthConfig } from "@brandbasket/auth";
import { isPasswordPending } from "@brandbasket/db";
import { generatePasswordResetEmail, generateSetPasswordUrl, SET_PASSWORD_LIFETIME_SECONDS } from "./auth";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => ({ ...(await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db")), isPasswordPending: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: () => ({}), getPublicDb: vi.fn() }));
vi.mock("./env", () => ({ serverEnv: () => ({ BETTER_AUTH_SECRET: "s".repeat(32), APP_ORIGIN: "https://app.brandbasket.in" }) }));
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

function fakeResetApi(): void {
  vi.mocked(createAuth).mockImplementation((config: AuthConfig) => ({
    api: { requestPasswordReset: async ({ body }: { body: { email: string } }) => {
      await config.mailer?.sendPasswordReset({ email: body.email, name: "Owner", token: "tok-abc" });
    } },
  } as unknown as ReturnType<typeof createAuth>));
}

it("makes a three day reset link for an account that has not set a password", async () => {
  vi.mocked(isPasswordPending).mockResolvedValue(true);
  fakeResetApi();
  await expect(generateSetPasswordUrl("new@example.com")).resolves.toBe("https://app.brandbasket.in/reset-password/tok-abc");
  const [config] = vi.mocked(createAuth).mock.calls[0] ?? [];
  expect(config?.resetPasswordLifetimeSeconds).toBe(SET_PASSWORD_LIFETIME_SECONDS);
  expect(SET_PASSWORD_LIFETIME_SECONDS).toBe(259_200);
  expect(config?.nextCookies).toBe(false);
});

it("makes no link, and asks Better Auth for none, when the account already has a password", async () => {
  vi.mocked(isPasswordPending).mockResolvedValue(false);
  fakeResetApi();
  await expect(generateSetPasswordUrl("old@example.com")).resolves.toBeNull();
  expect(createAuth).not.toHaveBeenCalled();
});
