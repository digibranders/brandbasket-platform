import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHANGELOG_ENTRIES } from "../entries";
import { ChangelogList } from "./changelog-list";

describe("ChangelogList", () => {
  it("lists every entry newest first with a date, a title and the words", () => {
    render(<ChangelogList />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(CHANGELOG_ENTRIES.length);
    expect(rows[0]?.textContent).toContain(CHANGELOG_ENTRIES[0]?.title);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(CHANGELOG_ENTRIES.length);
  });

  it("marks only the newest row Latest", () => {
    render(<ChangelogList />);
    expect(screen.getAllByText("Latest")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")[0]?.textContent).toContain("Latest");
  });

  it("gives each date a machine-readable time", () => {
    const { container } = render(<ChangelogList />);
    const times = [...container.querySelectorAll("time")].map((time) => time.getAttribute("datetime"));
    expect(times).toEqual(CHANGELOG_ENTRIES.map((entry) => entry.date));
  });
});
