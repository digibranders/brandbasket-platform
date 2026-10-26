import { listServiceSetups, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb } from "./db";
import { loadServicesBought } from "./first-look";
import { getProjectOverview } from "./onboarding";
import { loadTodo } from "./todo";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("./first-look", () => ({ loadServicesBought: vi.fn() }));
vi.mock("./onboarding", () => ({ getProjectOverview: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ listServiceSetups: vi.fn(), withTenantScope: vi.fn() }));

const appDb = { name: "app-db" } as never;
const appTx = { name: "app-tx" } as never;
const freshTenant = () => ({ userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" }) as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(getProjectOverview).mockResolvedValue({ project: null, completed: [] });
});

describe("loadTodo", () => {
  it("marks the saved Social answers done and drops them from the open count", async () => {
    vi.mocked(loadServicesBought).mockResolvedValue(["social"]);
    vi.mocked(listServiceSetups).mockResolvedValue([
      { service: "social", answers: { instagramUrl: "https://instagram.com/cafe", facebookUrl: "", adminAccess: "yes" } },
    ] as never);

    const todo = await loadTodo(freshTenant());

    expect(listServiceSetups).toHaveBeenCalledWith(appTx, "business-1");
    expect(todo.items.find((item) => item.key === "accounts")?.done).toBe(true);
    expect(todo.items.filter((item) => !item.done).map((item) => item.key)).toEqual(["offers", "budget"]);
    expect(todo.open).toBe(2);
    expect(todo.answers.social).toEqual({ instagramUrl: "https://instagram.com/cafe", facebookUrl: "", adminAccess: "yes" });
  });

  it("shows every Social item open and logs once when the saved answers cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(loadServicesBought).mockResolvedValue(["social"]);
    vi.mocked(listServiceSetups).mockRejectedValue(new Error("db down"));

    const todo = await loadTodo(freshTenant());

    expect(todo.items.map((item) => [item.key, item.done])).toEqual([
      ["accounts", false],
      ["offers", false],
      ["budget", false],
    ]);
    expect(todo.open).toBe(3);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe("[todo] could not read the saved answers");
    log.mockRestore();
  });

  it("gives a Social-only customer no website link", async () => {
    vi.mocked(loadServicesBought).mockResolvedValue(["social"]);
    vi.mocked(listServiceSetups).mockResolvedValue([]);

    const todo = await loadTodo(freshTenant());

    expect(todo.items.length).toBeGreaterThan(0);
    expect(todo.items.some((item) => item.kind === "link")).toBe(false);
    expect(todo.items.every((item) => item.service === "social")).toBe(true);
  });
});
