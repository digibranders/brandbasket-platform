import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppNotFound from "./(app)/not-found";
import PayNotFound from "./(pay)/not-found";
import RootNotFound from "./not-found";

describe("the 404s", () => {
  it("has one main on its own, and none inside a frame that has its own", () => {
    expect(render(<RootNotFound />).container.querySelectorAll("main")).toHaveLength(1);
    for (const Inner of [AppNotFound, PayNotFound]) {
      const { container, unmount } = render(<Inner />);
      expect(container.querySelector("main")).toBeNull();
      expect(container.textContent).toContain("This page does not exist");
      unmount();
    }
  });
});
