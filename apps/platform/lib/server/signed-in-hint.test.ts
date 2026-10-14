import { cookies, headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "./auth";
import { forgetSignedIn, signInCustomer } from "./signed-in-hint";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("./auth", () => ({ getAuth: vi.fn() }));
vi.mock("./env", () => ({
  serverEnv: () => ({ APP_ORIGIN: "https://app.firstfold.io" }),
  signedInHintDomain: () => "firstfold.io",
}));

const set = vi.fn();
const signInEmail = vi.fn();
const requestHeaders = new Headers({ host: "app.firstfold.io" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue({ set } as unknown as Awaited<ReturnType<typeof cookies>>);
  vi.mocked(getAuth).mockReturnValue({ api: { signInEmail } } as unknown as ReturnType<typeof getAuth>);
});

describe("signInCustomer", () => {
  it("signs in with Better Auth, then marks the person signed in with their initials for the website", async () => {
    signInEmail.mockResolvedValue({ user: { id: "user-1", name: "Dr Kiran Tester" } });

    expect(await signInCustomer({ email: "kiran@example.test", password: "secret-password" }, requestHeaders as Awaited<ReturnType<typeof headers>>)).toEqual({
      userId: "user-1",
    });
    expect(signInEmail).toHaveBeenCalledWith({ body: { email: "kiran@example.test", password: "secret-password" }, headers: requestHeaders });
    expect(set).toHaveBeenCalledWith("ff_signed_in", "DT", expect.objectContaining({ domain: "firstfold.io", secure: true, httpOnly: false }));
  });

  it("marks nobody when the sign-in fails", async () => {
    signInEmail.mockRejectedValue(new Error("Invalid email or password"));
    await expect(
      signInCustomer({ email: "kiran@example.test", password: "wrong-password" }, requestHeaders as Awaited<ReturnType<typeof headers>>),
    ).rejects.toThrow("Invalid email or password");
    expect(set).not.toHaveBeenCalled();
  });
});

describe("forgetSignedIn", () => {
  it("expires the marker on the same domain it was set for", async () => {
    await forgetSignedIn();
    expect(set).toHaveBeenCalledWith("ff_signed_in", "", expect.objectContaining({ domain: "firstfold.io", maxAge: 0 }));
  });
});
