import { describe, expect, it } from "vitest";
import { serviceStatuses } from "./client-services";

describe("serviceStatuses", () => {
  const lines = [
    { addOn: "paid-ads", status: "active" as const },
    { addOn: "managed-website", status: "active" as const },
    { addOn: "social-media", status: "pending" as const },
  ];
  const none = new Set<string>();

  it("lists only the services the client has, in catalogue order", () => {
    const result = serviceStatuses({ lines, project: { status: "live" }, websiteLate: false, toSetUp: none });
    expect(result.map((item) => item.id)).toEqual(["managed-website", "social-media", "paid-ads"]);
  });

  it("reads the website from its build stage, red when the preview is late", () => {
    expect(serviceStatuses({ lines, project: { status: "building" }, websiteLate: true, toSetUp: none })[0]).toMatchObject({ state: "late", text: "Building" });
    expect(serviceStatuses({ lines, project: { status: "live" }, websiteLate: false, toSetUp: none })[0]).toMatchObject({ state: "active", text: "Live" });
    expect(serviceStatuses({ lines, project: null, websiteLate: false, toSetUp: none })[0]).toMatchObject({ state: "waiting", text: "Setting up" });
  });

  it("says pending lines wait for payment and paid ones still to follow up are to set up", () => {
    const result = serviceStatuses({ lines, project: { status: "live" }, websiteLate: false, toSetUp: new Set(["paid-ads"]) });
    expect(result.find((item) => item.id === "social-media")).toMatchObject({ state: "waiting", text: "Waiting for payment" });
    expect(result.find((item) => item.id === "paid-ads")).toMatchObject({ state: "setup", text: "To set up" });
  });
});
