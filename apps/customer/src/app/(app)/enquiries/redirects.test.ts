import { describe, expect, it, vi } from "vitest";
import Oyechats from "../oyechats/page";
import WebsiteEnquiries from "../website/enquiries/page";
import WebsiteLeads from "../website/enquiries/leads/page";
import WebsiteName from "../website/enquiries/name/page";

// Permanent (308): emailed and bookmarked links are updated, never sent on with a temporary 307 (PARITY Part 2).
vi.mock("next/navigation", () => ({
  permanentRedirect: vi.fn((href: string) => {
    throw new Error(`permanentRedirect:${href}`);
  }),
}));

describe("old addresses", () => {
  it.each([
    ["/oyechats", Oyechats],
    ["/website/enquiries", WebsiteEnquiries],
    ["/website/enquiries/leads", WebsiteLeads],
    ["/website/enquiries/name", WebsiteName],
  ])("%s goes to /enquiries", (_path, page) => {
    expect(() => page()).toThrow("permanentRedirect:/enquiries");
  });
});
