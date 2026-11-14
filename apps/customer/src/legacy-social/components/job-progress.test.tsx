import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkingNote } from "./job-progress";

afterEach(cleanup);

describe("WorkingNote", () => {
  it("says what is being done and that the customer can leave, without any step", () => {
    render(<WorkingNote title="Writing your posts" />);
    expect(screen.getByRole("status").textContent).toContain("Writing your posts");
    expect(screen.getByText("You can leave this page. They will be here when you are back.")).toBeTruthy();
    expect(screen.queryByText(/step/i)).toBeNull();
  });
});
