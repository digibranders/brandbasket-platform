import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn<(...args: unknown[]) => string>(() => "event-1");
vi.mock("@sentry/nextjs", () => ({ captureException: (...args: unknown[]) => captureException(...args) }));

const { load } = await import("./loaded");
const { redirect, notFound } = await import("next/navigation");

describe("load", () => {
  beforeEach(() => captureException.mockClear());

  it("returns the data when the loader works", async () => {
    await expect(load("home.services", async () => [1, 2])).resolves.toEqual({ ok: true, data: [1, 2] });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports a failure to Sentry and returns a typed failure instead of throwing", async () => {
    const failure = new Error("connection refused");
    const result = await load("home.services", async () => {
      throw failure;
    });
    expect(result).toMatchObject({ ok: false, error: { eventId: "event-1" } });
    expect(result.ok === false && result.error.at).toBeInstanceOf(Date);
    expect(captureException).toHaveBeenCalledWith(failure, { tags: { area: "home.services" } });
  });

  it("never swallows Next's redirect or notFound", async () => {
    await expect(load("x", async () => redirect("/login"))).rejects.toThrow();
    await expect(load("x", async () => notFound())).rejects.toThrow();
    expect(captureException).not.toHaveBeenCalled();
  });
});
