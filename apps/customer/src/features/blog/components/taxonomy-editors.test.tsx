import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BlogCategory } from "../server/store";
import { CategoryEditor } from "./taxonomy-editors";

vi.mock("next/navigation", () => ({ usePathname: () => "/website/blog/categories/3", useRouter: () => ({ refresh: vi.fn() }) }));

const CATEGORY: BlogCategory = { id: "3", name: "Back care", slug: "back-care", description: null, metaTitle: null, metaDescription: null, publishedCount: 2, draftCount: 0 };
const ok = vi.fn().mockResolvedValue({ ok: true });

const leave = (): boolean => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("CategoryEditor", () => {
  it("asks before leaving only while there are unsaved changes", () => {
    render(<CategoryEditor category={CATEGORY} host="kulkarniphysio.example" canWrite save={ok} remove={ok} />);
    expect(leave()).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Back and neck care" } });
    expect(leave()).toBe(true);
  });
});
