import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PushPrompt, PUSH_PROMPT_DISMISSED_KEY } from "@/features/home/components/push-prompt";
import { DevicePushSwitch } from "./device-push-switch";

const device = vi.hoisted(() => ({ state: "off" as string, busy: false, message: null as string | null, turnOn: vi.fn(), turnOff: vi.fn() }));

vi.mock("@brandbasket/shared/lib/use-push-device", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/shared/lib/use-push-device")>()),
  usePushDevice: () => device,
}));
vi.mock("../push-actions", () => ({ savePushDeviceAction: vi.fn(), removePushDeviceAction: vi.fn() }));
vi.mock("@/features/settings/push-actions", () => ({ savePushDeviceAction: vi.fn(), removePushDeviceAction: vi.fn() }));

beforeEach(() => {
  Object.assign(device, { state: "off", busy: false, message: null });
  device.turnOn.mockReset();
  device.turnOff.mockReset();
  window.localStorage.clear();
});

describe("DevicePushSwitch", () => {
  it("is off until pressed, and pressing asks to turn on", async () => {
    render(<DevicePushSwitch publicKey="key" />);
    const toggle = screen.getByRole("switch", { name: "Notices on this device" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("On iPhone this needs Brandbasket added to your Home Screen.")).toBeTruthy();
    await userEvent.click(toggle);
    expect(device.turnOn).toHaveBeenCalledTimes(1);
  });

  it("turns off when it is on and pressed", async () => {
    device.state = "on";
    render(<DevicePushSwitch publicKey="key" />);
    const toggle = screen.getByRole("switch", { name: "Notices on this device" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(toggle);
    expect(device.turnOff).toHaveBeenCalledTimes(1);
  });

  it("says why it cannot be used when the browser blocks or lacks push, and shows a failure", () => {
    device.state = "blocked";
    device.message = "We could not turn notifications on. Please try again in a moment.";
    render(<DevicePushSwitch publicKey="key" />);
    expect(screen.getByRole("switch", { name: "Notices on this device" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/blocked for this site/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("We could not turn notifications on");
  });

  it("is not offered when the server has no key", () => {
    device.state = "unavailable";
    const { container } = render(<DevicePushSwitch publicKey={null} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("PushPrompt", () => {
  it("offers the choice once, and turns on only after the button is pressed", async () => {
    render(<PushPrompt publicKey="key" />);
    expect(device.turnOn).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Turn on notices" }));
    expect(device.turnOn).toHaveBeenCalledTimes(1);
  });

  it("is remembered when dismissed, and stays away on the next visit", async () => {
    const { unmount } = render(<PushPrompt publicKey="key" />);
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText(/Get a notice on this device/)).toBeNull();
    expect(window.localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY)).toBe("1");
    unmount();
    render(<PushPrompt publicKey="key" />);
    expect(screen.queryByText(/Get a notice on this device/)).toBeNull();
  });

  it.each(["on", "blocked", "unsupported", "needs-install", "unavailable", "checking"])("is not shown while the state is %s", (state) => {
    device.state = state;
    render(<PushPrompt publicKey="key" />);
    expect(screen.queryByText(/Get a notice on this device/)).toBeNull();
  });
});
