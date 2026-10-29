import { beforeEach, expect, it, vi } from "vitest";
import { createAuth, type AuthConfig } from "@brandbasket/auth";
import { generateStaffPasswordResetEmail } from "./auth";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));
vi.mock("./env", () => ({ serverEnv: () => ({
  BETTER_AUTH_SECRET: "s".repeat(32), APP_ORIGIN: "https://app.brandbasket.in", ADMIN_ORIGIN: "https://console.brandbasket.in",
}) }));
vi.mock("@brandbasket/auth", async () => ({
  ...await vi.importActual<typeof import("@brandbasket/auth")>("@brandbasket/auth"), createAuth: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

it("captures simultaneous staff reset emails separately with links on the console origin", async () => {
  vi.mocked(createAuth).mockImplementation((config: AuthConfig) => ({
    api: { requestPasswordReset: async ({ body }: { body: { email: string } }) => {
      await Promise.resolve();
      if (body.email === "absent@example.com") return;
      await config.mailer?.sendPasswordReset({ email: body.email, name: "Staff", token: `token-${body.email.split("@")[0]}` });
    } },
  } as unknown as ReturnType<typeof createAuth>));
  const [first, absent, second] = await Promise.all([
    generateStaffPasswordResetEmail("first@example.com"), generateStaffPasswordResetEmail("absent@example.com"), generateStaffPasswordResetEmail("second@example.com"),
  ]);
  expect(first).toMatchObject({ to: "first@example.com", bodyText: expect.stringContaining("https://console.brandbasket.in/reset-password/token-first") });
  expect(second).toMatchObject({ to: "second@example.com", bodyText: expect.stringContaining("https://console.brandbasket.in/reset-password/token-second") });
  expect(absent).toBeNull();
  expect(vi.mocked(createAuth).mock.calls.every(([config]) => config.nextCookies === false && config.baseURL === "https://console.brandbasket.in")).toBe(true);
});
