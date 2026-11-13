import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("@brandbasket/shared/server/turnstile-request", () => ({ checkHuman: vi.fn() }));
vi.mock("@/lib/server/sign-in", () => ({ signInWithPassword: vi.fn() }));
vi.mock("@/lib/server/affiliate-access", () => ({ landingForSignedInUser: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ LISTING_PAGE_PATH: "/details" }));
vi.mock("@/lib/server/listing-account", () => ({ createListingAccount: vi.fn(), requestJoinCode: vi.fn() }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn() }));
vi.mock("@/lib/server/website-api-auth", () => ({ leadsApiToken: vi.fn() }));

const { checkHuman } = await import("@brandbasket/shared/server/turnstile-request");
const { signInWithPassword } = await import("@/lib/server/sign-in");
const { landingForSignedInUser } = await import("@/lib/server/affiliate-access");
const { signInCustomer, signInToInvite } = await import("./actions");

const TOKEN = "T".repeat(43);
const IDLE = { status: "idle" } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkHuman).mockResolvedValue({ ok: true } as never);
  vi.mocked(signInWithPassword).mockResolvedValue({ status: "signed-in", userId: "u1" } as never);
  vi.mocked(landingForSignedInUser).mockResolvedValue("/");
});

describe("signing in from an invitation", () => {
  it("goes back to the invite page, and not Home", async () => {
    await expect(signInToInvite(`/invite/${TOKEN}`, IDLE, new FormData())).rejects.toThrow(`NEXT_REDIRECT /invite/${TOKEN}`);
  });

  it("drops a next address that is not an invite page, because a bound argument is still browser input", async () => {
    for (const next of ["https://evil.example", "//evil.example", "/billing", `/invite/${TOKEN}/x`]) {
      await expect(signInToInvite(next, IDLE, new FormData())).rejects.toThrow("NEXT_REDIRECT /");
    }
  });

  it("is plain sign-in without one", async () => {
    await expect(signInCustomer(IDLE, new FormData())).rejects.toThrow("NEXT_REDIRECT /");
  });

  it("stays on the form with the error when the password is wrong", async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ status: "error", message: "No.", email: "a@b.c" } as never);
    expect(await signInToInvite(`/invite/${TOKEN}`, IDLE, new FormData())).toMatchObject({ status: "error" });
  });
});
