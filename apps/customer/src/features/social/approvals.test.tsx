import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import { approvePostsAction } from "./actions";
import { ApprovalsPanel } from "./components/approvals-panel";
import type { ApprovalCard } from "./rules";

vi.mock("./actions", () => ({ approvePostsAction: vi.fn() }));

const card = (id: string): ApprovalCard => ({ id, title: `Post ${id}`, caption: `Caption ${id}`, kind: "Instagram post", when: "Wed 25 Nov", imageSrc: null, changeHref: `/requests?new=1&kind=social&about=${id}` });
const show = (cards: ApprovalCard[], canApprove = true) =>
  render(
    <ToastProvider>
      <ApprovalsPanel cards={cards} headline="2 posts need your OK by Wed 25 Nov" canApprove={canApprove} canAsk layout="rows" />
    </ToastProvider>,
  );

beforeEach(() => vi.resetAllMocks());

describe("ApprovalsPanel", () => {
  it("approves the one post that was pressed", async () => {
    vi.mocked(approvePostsAction).mockResolvedValue({ ok: true, data: { outcome: "approved", approved: 1 } });
    show([card("a"), card("b")]);
    await userEvent.click(screen.getAllByRole("button", { name: "Approve" })[1] as HTMLElement);
    await waitFor(() => expect(approvePostsAction).toHaveBeenCalledWith(["b"]));
  });

  it("approves every shown post with Approve all", async () => {
    vi.mocked(approvePostsAction).mockResolvedValue({ ok: true, data: { outcome: "approved", approved: 2 } });
    show([card("a"), card("b")]);
    await userEvent.click(screen.getByRole("button", { name: "Approve all 2" }));
    await waitFor(() => expect(approvePostsAction).toHaveBeenCalledWith(["a", "b"]));
  });

  it("says so when some posts changed while the customer was looking", async () => {
    vi.mocked(approvePostsAction).mockResolvedValue({ ok: true, data: { outcome: "changed", approved: 1 } });
    show([card("a"), card("b")]);
    await userEvent.click(screen.getByRole("button", { name: "Approve all 2" }));
    expect(await screen.findByText("Some posts changed while you were looking. Check them below and try again.")).toBeTruthy();
  });

  it("shows the action's own message when it refuses", async () => {
    vi.mocked(approvePostsAction).mockResolvedValue({ ok: false, message: "We could not save that. Try again." });
    show([card("a"), card("b")]);
    await userEvent.click(screen.getByRole("button", { name: "Approve all 2" }));
    expect(await screen.findByText("We could not save that. Try again.")).toBeTruthy();
  });

  it("opens a post to review with its caption and a link to ask for a change", async () => {
    show([card("a"), card("b")]);
    await userEvent.click(screen.getAllByRole("button", { name: "Review" })[0] as HTMLElement);
    expect(await screen.findByText("Caption a")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ask for a change" }).getAttribute("href")).toBe("/requests?new=1&kind=social&about=a");
  });
});
