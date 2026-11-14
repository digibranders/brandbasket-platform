import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PayLayout from "./layout";

vi.mock("@/features/entry/actions", () => ({ signOutAction: vi.fn() }));

describe("the pay frame", () => {
  it("lets an account that has not paid get help, open settings and sign out", () => {
    render(
      <PayLayout>
        <p>Question 1 of 5</p>
      </PayLayout>,
    );
    expect(screen.getByRole("link", { name: "Help" }).getAttribute("href")).toBe("/help");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});
