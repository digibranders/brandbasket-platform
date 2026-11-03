import { describe, expect, it, vi } from "vitest";
import Oyechats from "../oyechats/page";
import WebsiteEnquiries from "../website/enquiries/page";
import WebsiteLeads from "../website/enquiries/leads/page";
import WebsiteName from "../website/enquiries/name/page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

describe("old addresses", () => {
  it.each([
    ["/oyechats", Oyechats],
    ["/website/enquiries", WebsiteEnquiries],
    ["/website/enquiries/leads", WebsiteLeads],
    ["/website/enquiries/name", WebsiteName],
  ])("%s goes to /enquiries", (_path, page) => {
    expect(() => page()).toThrow("redirect:/enquiries");
  });
});
