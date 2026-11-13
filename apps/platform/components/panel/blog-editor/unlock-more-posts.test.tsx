// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unlockPostsSummary } from "@/lib/billing/payment-summaries";
import { UnlockMorePosts } from "./unlock-more-posts";

const { unlockBlogPostsAction } = vi.hoisted(() => ({ unlockBlogPostsAction: vi.fn<() => Promise<void>>() }));
vi.mock("@/app/app-host/(protected)/content/blog/actions", () => ({ unlockBlogPostsAction }));

const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  unlockBlogPostsAction.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (name: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === name);
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
};
const render = (): Promise<void> =>
  act(async () => root.render(<UnlockMorePosts posts={100} price="₹560.50" summary={unlockPostsSummary({ posts: 100, price: "₹560.50", currency: "INR" })} />));

describe("Unlock more posts", () => {
  it("shows the block, its price and when it unlocks before opening any payment", async () => {
    await render();
    await act(async () => button("Unlock 100 more posts · ₹560.50").click());
    const dialog = container.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    for (const text of ["Unlock more posts", "100 more blog posts", "₹560.50", "Due today", "The posts unlock as soon as it is confirmed.", "All prices include GST."]) {
      expect(dialog?.textContent).toContain(text);
    }
    expect(unlockBlogPostsAction).not.toHaveBeenCalled();
  });

  it("runs the unlock from the dialog's own button, and not when the customer goes back", async () => {
    unlockBlogPostsAction.mockResolvedValue(undefined);
    await render();
    await act(async () => button("Unlock 100 more posts · ₹560.50").click());
    await act(async () => button("Go back").click());
    expect(unlockBlogPostsAction).not.toHaveBeenCalled();

    await act(async () => button("Unlock 100 more posts · ₹560.50").click());
    await act(async () => button("Pay ₹560.50").click());
    expect(unlockBlogPostsAction).toHaveBeenCalledTimes(1);
  });
});
