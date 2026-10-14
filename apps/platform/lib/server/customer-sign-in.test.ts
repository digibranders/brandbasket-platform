import type { headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "./auth";
import { signInCustomer } from "./customer-sign-in";

vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({ getAuth: vi.fn() }));

const signInEmail = vi.fn();
const requestHeaders = new Headers({ host: "app.fynix.digital" }) as Awaited<ReturnType<typeof headers>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuth).mockReturnValue({ api: { signInEmail } } as unknown as ReturnType<typeof getAuth>);
});

describe("signInCustomer", () => {
  it("signs in with Better Auth and returns the user's id", async () => {
    signInEmail.mockResolvedValue({ user: { id: "user-1", name: "Dr Kiran Tester" } });
    expect(await signInCustomer({ email: "kiran@example.test", password: "secret-password" }, requestHeaders)).toEqual({ userId: "user-1" });
    expect(signInEmail).toHaveBeenCalledWith({ body: { email: "kiran@example.test", password: "secret-password" }, headers: requestHeaders });
  });

  it("passes on whatever Better Auth throws", async () => {
    signInEmail.mockRejectedValue(new Error("Invalid email or password"));
    await expect(signInCustomer({ email: "kiran@example.test", password: "wrong-password" }, requestHeaders)).rejects.toThrow("Invalid email or password");
  });
});
