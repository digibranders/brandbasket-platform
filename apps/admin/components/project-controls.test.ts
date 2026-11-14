import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectControls } from "./project-controls";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({}) }));
vi.mock("@brandbasket/db", () => ({
  canMoveProject: (action: string) => action === "grant-round" || action === "cancel",
  findOpenProjectForStaff: async () => ({
    id: "proj-1",
    businessId: "b1",
    status: "in_progress",
    assignedStaffId: null,
    launchPlannedOn: null,
    onHoldReason: null,
  }),
  listAssignableSupportStaff: async () => [],
}));

describe("ProjectControls", () => {
  it("renders confirm dialogs for grant round and cancel build", async () => {
    const element = await ProjectControls({ businessId: "b1", notice: undefined });
    expect(element).not.toBeNull();
    const html = renderToStaticMarkup(element!);

    expect(html).toContain("Add a round of changes");
    expect(html).toContain("This grants the client one extra round of website revisions without charging them.");
    expect(html).toContain("Cancel this build");
    expect(html).toContain("This cancels the open website build. Their plan and billing do not change.");
    expect(html).toContain('name="confirm"');
    expect(html).toContain('value="yes"');
  });
});
