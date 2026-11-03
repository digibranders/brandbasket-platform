import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlertDialog } from "./alert-dialog";
import { Button } from "./button";
import { Dialog, DialogClose, Sheet } from "./dialog";
import { IconButton } from "./icon-button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "./menu";
import { Popover } from "./popover";
import { expectNoAxeViolations } from "./test-axe";
import { ToastProvider, useToast } from "./toast";

describe("Dialog", () => {
  it("opens as a named modal dialog, closes on Escape and returns focus", async () => {
    render(
      <Dialog trigger={<Button>New request</Button>} title="New request" footer={<DialogClose><Button>Cancel</Button></DialogClose>}>
        <p>Tell us what you need.</p>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "New request" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "New request" });
    expect(dialog.textContent).toContain("Tell us what you need.");
    await expectNoAxeViolations(document.body);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from its close button", async () => {
    render(
      <Dialog trigger={<Button>Open</Button>} title="Book a call">
        <p>Body</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Sheet", () => {
  it("opens a record as a named dialog", async () => {
    render(
      <Sheet trigger={<Button>Open enquiry</Button>} title="Rohan Mehta" description="Website chat">
        <p>Wants a quote for a blood test at home.</p>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open enquiry" }));
    expect(await screen.findByRole("dialog", { name: "Rohan Mehta" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("AlertDialog", () => {
  it("states the consequence and backs out with Cancel", async () => {
    const onConfirm = vi.fn();
    render(
      <AlertDialog
        trigger={<Button variant="danger">Remove</Button>}
        title="Remove Social & Ads?"
        description="It ends on Sat 28 Nov. Your plan then costs less."
        cancelLabel="Keep it"
        action={<Button variant="danger" onClick={onConfirm}>Remove</Button>}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Social & Ads?" });
    expect(dialog.textContent).toContain("It ends on Sat 28 Nov.");
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("Menu", () => {
  it("opens from its button, moves with the arrow keys and runs an item", async () => {
    const onSignOut = vi.fn();
    render(
      <Menu trigger={<IconButton icon="DotsThree" label="Account" tooltip={false} />}>
        <MenuLabel>Anand Verma</MenuLabel>
        <MenuItem icon="UserCircle">Your profile</MenuItem>
        <MenuSeparator />
        <MenuItem icon="SignOut" onClick={onSignOut}>
          Sign out
        </MenuItem>
      </Menu>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(await screen.findByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Your profile", "Sign out"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("Popover", () => {
  it("opens a titled panel from its button and closes on Escape", async () => {
    render(
      <Popover trigger={<IconButton icon="Bell" label="Notifications" tooltip={false} />} title="Notifications">
        <p>New enquiry from Rohan Mehta</p>
      </Popover>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const panel = await screen.findByRole("dialog", { name: "Notifications" });
    expect(panel.textContent).toContain("New enquiry from Rohan Mehta");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Toast", () => {
  function Confirm() {
    const toast = useToast();
    return <Button onClick={() => toast("Call booked. The video link is in your email.")}>Book</Button>;
  }

  it("shows a short confirmation in a live region", async () => {
    render(
      <ToastProvider>
        <Confirm />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(await screen.findByText("Call booked. The video link is in your email.")).toBeTruthy();
  });
});
