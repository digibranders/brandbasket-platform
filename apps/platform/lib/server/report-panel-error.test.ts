import { beforeEach, describe, expect, it, vi } from "vitest";

const report = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("./error-report", () => ({ reportServerError: report }));
import { reportUnexpectedPanelError } from "./report-panel-error";

beforeEach(() => { report.mockReset(); });
describe("handled panel failures", () => {
  it("reports an unexpected failure with fixed route and signed-in identity", async () => {
    const error = new Error("sensitive database detail");
    await reportUnexpectedPanelError(error, "/patients", "account-id");
    expect(report).toHaveBeenCalledWith(error, { app: "platform", operation: "server_action", route: "/patients", userId: "account-id" });
  });
  it("does not create incidents for expected database field limits", async () => {
    const error = Object.assign(new Error("constraint"), { code: "23514" });
    await reportUnexpectedPanelError(new Error("wrapped", { cause: error }), "/details", "account-id");
    expect(report).not.toHaveBeenCalled();
  });
});
