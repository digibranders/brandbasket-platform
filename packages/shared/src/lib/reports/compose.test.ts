import { describe, expect, it } from "vitest";
import { composeSearch, composeSocial, composeWebsite, shortDate, type ReportFacts } from "./compose";
import { reportContentSchema } from "./content";

const EMPTY: ReportFacts = {
  currency: "INR",
  site: { up: 0, down: 0, phoneSpeed: null, certificateEndsOn: null },
  enquiries: { current: {}, previous: {} },
  social: { postsPublished: 0, postsPlanned: 0, reach: null, followers: null, profileVisits: null, ads: { spendCents: null, enquiries: null } },
  search: { keywordsPageOne: null, keywordsPageOnePrevious: null, pagesImproved: 0, listingsFixed: 0 },
  done: { website: [], social: [], search: [] },
};
const facts = (patch: Partial<ReportFacts>): ReportFacts => ({ ...EMPTY, ...patch });

describe("shortDate", () => {
  it("words a day", () => expect(shortDate("2026-10-09")).toBe("9 Oct 2026"));
});

describe("a service with nothing measured", () => {
  it("gets no report", () => {
    expect(composeWebsite(EMPTY, "2026-10")).toBeNull();
    expect(composeSocial(EMPTY, "2026-10")).toBeNull();
    expect(composeSearch(EMPTY, "2026-10")).toBeNull();
  });
});

describe("composeWebsite", () => {
  const measured = facts({
    site: { up: 4290, down: 10, phoneSpeed: { score: 82, on: "2026-10-29" }, certificateEndsOn: "2027-01-12" },
    enquiries: { current: { website_form: 7, website_call: 4, website_whatsapp: 1, chatbot: 0 }, previous: { website_form: 5, website_call: 1, website_whatsapp: 0, chatbot: 0 } },
    done: { website: [{ on: "2026-10-20", text: "Changed the opening hours" }, { on: "2026-10-03", text: "Updated the site's security software" }], social: [], search: [] },
  });

  it("states each measured figure with its unit and date, and compares like with like", () => {
    const content = composeWebsite(measured, "2026-10");
    expect(content?.headline).toBe("Your website was online 99.77% of the month and sent you 12 enquiries, 6 more than in September.");
    expect(content?.figures).toEqual([
      { label: "Online in October", value: "99.77% of 4,300 checks" },
      { label: "Enquiries from your website in October", value: "12 (6 more than September)" },
      { label: "Website forms in October", value: "7" },
      { label: "Website call taps in October", value: "4" },
      { label: "WhatsApp taps in October", value: "1" },
      { label: "Speed on phones, 29 Oct 2026", value: "82 out of 100" },
      { label: "Secure connection valid until", value: "12 Jan 2027" },
    ]);
    expect(content?.whatWeDid).toEqual(["3 Oct 2026: Updated the site's security software", "20 Oct 2026: Changed the opening hours"]);
  });

  it("leaves a channel that was never measured out, instead of showing zero", () => {
    const content = composeWebsite(facts({ ...measured, enquiries: { current: { website_form: 3 }, previous: { website_form: 3 } } }), "2026-10");
    expect(content?.figures.map((figure) => figure.label)).not.toContain("Website call taps in October");
    expect(content?.figures[1]).toEqual({ label: "Enquiries from your website in October", value: "3 (Same as September)" });
  });

  it("does not compare when last month measured different channels", () => {
    const content = composeWebsite(facts({ ...measured, enquiries: { current: { website_form: 3, website_call: 2 }, previous: { website_form: 3 } } }), "2026-10");
    expect(content?.figures[1]?.value).toBe("5");
  });

  it("reports a month with no uptime checks from what was measured", () => {
    const content = composeWebsite(facts({ enquiries: { current: { website_form: 1 }, previous: {} } }), "2026-10");
    expect(content?.headline).toBe("Your website sent you 1 enquiry.");
  });

  it("says a fall as plainly as a rise", () => {
    const content = composeWebsite(facts({ ...measured, enquiries: { current: { website_form: 2 }, previous: { website_form: 9 } } }), "2026-10");
    expect(content?.figures[1]?.value).toBe("2 (7 fewer than September)");
  });
});

describe("composeSocial", () => {
  it("composes posts, reach and ad figures in rupees, and leaves out a cost it cannot work out", () => {
    const content = composeSocial(
      facts({
        social: { postsPublished: 9, postsPlanned: 12, reach: 12400, followers: 1830, profileVisits: null, ads: { spendCents: 450000, enquiries: 18 } },
        done: { website: [], social: [{ on: "2026-10-05", text: "Published a post: Diwali offer" }], search: [] },
      }),
      "2026-10",
    );
    expect(content?.headline).toBe("We published 9 posts for you in October. Your ads brought 18 enquiries.");
    expect(content?.figures).toEqual([
      { label: "Posts published in October", value: "9 of 12 planned" },
      { label: "People reached in October", value: "12,400" },
      { label: "Followers in October", value: "1,830" },
      { label: "Ad spend in October", value: "₹4,500" },
      { label: "Enquiries from your ads in October", value: "18" },
      { label: "Cost of one ad enquiry", value: "₹250" },
    ]);
    const none = composeSocial(facts({ social: { ...EMPTY.social, ads: { spendCents: 100000, enquiries: 0 } } }), "2026-10");
    expect(none?.figures.map((figure) => figure.label)).not.toContain("Cost of one ad enquiry");
  });

  it("uses dollars for a dollar customer", () => {
    const content = composeSocial(facts({ currency: "USD", social: { ...EMPTY.social, ads: { spendCents: 12050, enquiries: null } } }), "2026-10");
    expect(content?.figures[0]?.value).toBe("$120.50");
  });
});

describe("composeSearch", () => {
  it("composes the keyword change and the work done", () => {
    const content = composeSearch(
      facts({ search: { keywordsPageOne: 18, keywordsPageOnePrevious: 15, pagesImproved: 2, listingsFixed: 1 }, enquiries: { current: { google_profile_call: 6 }, previous: {} } }),
      "2026-10",
    );
    expect(content?.headline).toBe("We improved 2 pages and 1 listing for you in October. You were on page one of Google for 18 keywords in October.");
    expect(content?.figures).toContainEqual({ label: "Keywords on page one of Google in October", value: "18 (3 more than September)" });
    expect(content?.figures).toContainEqual({ label: "Calls from your Google profile in October", value: "6" });
  });
});

describe("what we did", () => {
  it("caps at twenty lines and says how many it left out", () => {
    const done = Array.from({ length: 25 }, (_, index) => ({ on: `2026-10-${String(index + 1).padStart(2, "0")}`, text: `Job ${index + 1}` }));
    const content = composeWebsite(facts({ site: { ...EMPTY.site, up: 1 }, done: { website: done, social: [], search: [] } }), "2026-10");
    expect(content?.whatWeDid).toHaveLength(20);
    expect(content?.whatWeDid.at(-1)).toBe("And 6 more.");
  });
});

describe("every composed report", () => {
  it("fits the stored shape the customer app reads, and has no em or en dash", () => {
    const content = composeWebsite(facts({ site: { up: 1, down: 0, phoneSpeed: null, certificateEndsOn: null } }), "2026-10");
    expect(reportContentSchema.safeParse(content).success).toBe(true);
    expect(JSON.stringify(content)).not.toMatch(/[–—]/);
  });
});
