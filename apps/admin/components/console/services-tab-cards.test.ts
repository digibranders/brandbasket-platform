import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ServiceStatus } from "@/lib/client-services";
import { ServicesTabCards } from "./services-tab-cards";

// The cards reach the kickoff prompt, which imports server actions, and those import server-only modules.
vi.mock("server-only", () => ({}));

const ID = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const SERVICES: ServiceStatus[] = [
  { id: "managed-website", short: "Website", title: "Website Management", state: "active", text: "Live" },
  { id: "social-media", short: "Social", title: "Social Media Management", state: "setup", text: "To set up" },
  { id: "paid-ads", short: "Paid Ads", title: "Paid Ads Management", state: "active", text: "Active" },
  { id: "expert-monitoring", short: "Monitoring", title: "Dedicated Expert Monitoring", state: "active", text: "Active" },
];

const render = (services: ServiceStatus[] = SERVICES): string => renderToStaticMarkup(ServicesTabCards({ businessId: ID, services, figures: "[figures]" }));

describe("ServicesTabCards", () => {
  it("shows one card per service with its status word", () => {
    const html = render();
    for (const title of ["Website Management", "Social Media Management", "Paid Ads Management", "Dedicated Expert Monitoring"]) expect(html).toContain(title);
    expect(html).toContain("To set up");
    expect(html).toContain("Live");
  });

  it("links the website card to its tab and says where the others are run", () => {
    const html = render();
    expect(html).toContain(`href="/clients/${ID}/website"`);
    expect(html).toContain("Staff do no Social work.");
    expect(html).toContain(`href="/clients/${ID}/billing#add-ons"`);
  });

  it("puts the figures in the Paid Ads card only", () => {
    expect(render().match(/\[figures\]/g)).toHaveLength(1);
    expect(render(SERVICES.filter((service) => service.id !== "paid-ads"))).not.toContain("[figures]");
  });
});
