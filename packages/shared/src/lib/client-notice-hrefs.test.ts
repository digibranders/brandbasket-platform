import { describe, expect, it } from "vitest";
import { staffChargeNoticeHref } from "./billing/charge-notices";
import { manualPaymentNoticeHref } from "./billing/manual-payment-notices";
import { businessModuleNoticeHref } from "./business-module-notices";
import { domainConnectNoticeHref } from "./domain-connect-notices";
import { projectLaunchNoticeHref } from "./project-launch-notices";
import { projectPreviewNoticeHref } from "./project-preview-notices";

const ID = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

// Each notice link names the console tab that prints it, so it never lands on a redirect.
describe("the console links notices point at", () => {
  it("Plan and billing for payments and charges", () => {
    expect(manualPaymentNoticeHref(ID, "recorded")).toBe(`/clients/${ID}/billing?payment=recorded`);
    expect(staffChargeNoticeHref(ID, "added")).toBe(`/clients/${ID}/billing?charges=added#extras`);
  });

  it("the Website tab for preview, launch, domain and site-data notices", () => {
    expect(projectPreviewNoticeHref(ID, "sent")).toBe(`/clients/${ID}/website?preview=sent`);
    expect(projectLaunchNoticeHref(ID, "launched")).toBe(`/clients/${ID}/website?launch=launched`);
    expect(domainConnectNoticeHref(ID, "ready")).toBe(`/clients/${ID}/website?dns=ready#domain`);
    expect(businessModuleNoticeHref(ID, "zone-saved")).toBe(`/clients/${ID}/website?features=zone-saved#features`);
  });
});
