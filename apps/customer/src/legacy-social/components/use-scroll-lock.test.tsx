import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useScrollLock } from "./use-scroll-lock";

function Holder({ active = true }: { readonly active?: boolean }) {
  useScrollLock(active);
  return null;
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("useScrollLock", () => {
  it("holds the page still while a pop-up is open and lets it scroll again when it closes", () => {
    const { unmount } = render(<Holder />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the page still until the last of two pop-ups closes", () => {
    const first = render(<Holder />);
    const second = render(<Holder />);
    first.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    second.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("does nothing while it is not active", () => {
    render(<Holder active={false} />);
    expect(document.body.style.overflow).toBe("");
  });
});
