import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNSAVED_CHANGES_PROMPT, useUnsavedChangesWarning } from "./use-unsaved-changes-warning";

function Page({ dirty }: { readonly dirty: boolean }) {
  useUnsavedChangesWarning(dirty);
  return (
    <div>
      <a href="/help">Billing</a>
      <a href="/billing#top">Here</a>
      <a href="https://example.com/x">Elsewhere</a>
    </div>
  );
}

function stubConfirm(answer: boolean) {
  const confirm = vi.fn(() => answer);
  vi.stubGlobal("confirm", confirm);
  return confirm;
}

describe("useUnsavedChangesWarning", () => {
  beforeEach(() => {
    (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL("http://localhost/billing");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks before an internal link is followed, and stays put on Cancel", async () => {
    const confirm = stubConfirm(false);
    const followed = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener("click", followed);
    render(<Page dirty />);
    await userEvent.click(screen.getByText("Billing"));
    document.removeEventListener("click", followed);
    expect(confirm).toHaveBeenCalledWith(UNSAVED_CHANGES_PROMPT);
    expect(followed).not.toHaveBeenCalled();
  });

  it("lets the click through when the person agrees to leave", async () => {
    stubConfirm(true);
    const reached = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener("click", reached);
    render(<Page dirty />);
    await userEvent.click(screen.getByText("Billing"));
    document.removeEventListener("click", reached);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it("does not ask when nothing is unsaved, for the same page or for another site", async () => {
    const confirm = stubConfirm(false);
    const stay = (event: Event): void => event.preventDefault();
    document.addEventListener("click", stay);
    const { rerender } = render(<Page dirty />);
    await userEvent.click(screen.getByText("Here"));
    await userEvent.click(screen.getByText("Elsewhere"));
    rerender(<Page dirty={false} />);
    await userEvent.click(screen.getByText("Billing"));
    document.removeEventListener("click", stay);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks the browser to confirm closing the tab only while dirty", () => {
    const { rerender } = render(<Page dirty />);
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    rerender(<Page dirty={false} />);
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });
});
