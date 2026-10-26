import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadTodo } from "@/lib/server/todo";
import TodoPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/todo", () => ({ loadTodo: vi.fn() }));
vi.mock("@/components/todo/todo-list", () => ({ TodoList: () => null }));

const tenant = { userId: "user-1", businessId: "business-1" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadTodo).mockResolvedValue({ services: [], items: [], open: 0, answers: { social: undefined, search: undefined } });
});

describe("the To do page", () => {
  it("sends an account with no access home and reads nothing", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: false } } as never);

    await expect(TodoPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/");
    expect(loadTodo).not.toHaveBeenCalled();
  });

  it("opens for a paid account", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);

    await expect(TodoPage({ searchParams: Promise.resolve({}) })).resolves.toBeDefined();
    expect(loadTodo).toHaveBeenCalledWith(tenant);
  });
});
