import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startSiteJobAction } from "@/legacy-social/actions";
import { StartDialog } from "./ai-start-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/legacy-social/actions", () => ({ startNextMonthAction: vi.fn(async () => ({ status: "saved" })), startSiteJobAction: vi.fn(async () => ({ status: "saved" })) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const connected = new Set(["instagram"] as const);

describe("the website in the start window", () => {
  it("fills in the website on file and lets her change it", async () => {
    render(<StartDialog connected={connected} website="fynix.digital" onClose={() => undefined} />);
    const field = screen.getByLabelText("Your website address") as HTMLInputElement;
    expect(field.value).toBe("fynix.digital");
    expect(screen.queryByText(/not the website we have on file/)).toBeNull();
    fireEvent.change(field, { target: { value: "https://new-site.example" } });
    expect(screen.getByText(/not the website we have on file \(fynix\.digital\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read my website" }));
    await waitFor(() => expect(vi.mocked(startSiteJobAction)).toHaveBeenCalledTimes(1));
    expect((vi.mocked(startSiteJobAction).mock.calls[0]?.[0] as FormData).get("site")).toBe("https://new-site.example");
  });

  it("does not call the same website another one when only the scheme or www differ", () => {
    render(<StartDialog connected={connected} website="fynix.digital" onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Your website address"), { target: { value: "https://www.Fynix.digital/" } });
    expect(screen.queryByText(/not the website we have on file/)).toBeNull();
  });

  it("offers the website from setup while none is on file", () => {
    render(<StartDialog connected={connected} savedWebsite="acme.com" onClose={() => undefined} />);
    expect((screen.getByLabelText("Your website address") as HTMLInputElement).value).toBe("acme.com");
  });
});
