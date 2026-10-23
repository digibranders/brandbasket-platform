import { describe, expect, it, vi } from "vitest";
import { customerNav } from "@/components/panel/customer-nav";

vi.mock("@/lib/server/customer-access", () => ({ ADVERTISE_PATH: "/advertise", LISTING_PAGE_PATH: "/business" }));

const NAV = { setupDone: false, appointmentsEnabled: false, newAppointmentCount: 0, listing: { ownListing: false, claim: false } } as const;

const labels = (showWebsite: boolean, setupDone = false): string[] => customerNav({ ...NAV, showWebsite, setupDone }).map((row) => row.label);

describe("customerNav", () => {
  it("shows the website's section for a client that has a website", () => {
    expect(labels(true)).toEqual(["Home", "Set up your website", "Your project", "OyeChats", "Your domain", "Content", "Services", "Billing"]);
  });

  it("drops the setup row once setup has been sent", () => {
    expect(labels(true, true)).not.toContain("Set up your website");
  });

  it("hides the whole website section from a client without one, keeping Home, Services and Billing", () => {
    expect(labels(false)).toEqual(["Home", "Services", "Billing"]);
  });

  it("starts the account section with a hairline, with or without the website section above it", () => {
    for (const showWebsite of [true, false]) {
      const rows = customerNav({ ...NAV, showWebsite, setupDone: false });
      expect(rows.find((row) => row.label === "Services")?.sectionStart).toBe(true);
    }
  });
});
