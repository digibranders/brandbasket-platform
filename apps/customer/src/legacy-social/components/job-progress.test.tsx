import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JobProgress } from "./job-progress";

afterEach(cleanup);

describe("JobProgress", () => {
  it("fills as far as the step the job has reached", () => {
    render(<JobProgress step={2} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("50%");
  });

  it("never goes past full", () => {
    render(<JobProgress step={9} />);
    expect((screen.getByRole("progressbar").firstElementChild as HTMLElement).style.width).toBe("100%");
  });

  it("pulses when the step is not known", () => {
    render(<JobProgress />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect((bar.firstElementChild as HTMLElement).className).toContain("animate-pulse");
  });
});
