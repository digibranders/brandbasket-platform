import { describe, expect, it } from "vitest";
import { headlineText, websiteHeadline } from "./headline";

const text = (input: Parameters<typeof websiteHeadline>[0]): string | null => {
  const segments = websiteHeadline(input);
  return segments === null ? null : headlineText(segments);
};

describe("websiteHeadline", () => {
  it("says the month in one sentence, with the figures marked for emphasis", () => {
    const segments = websiteHeadline({ uptimePercent: 99.96, enquiries: 21, previousEnquiries: 15, previousMonthName: "September" });
    expect(segments).toEqual([
      { text: "Your website was online " },
      { text: "99.96%", emphasis: true },
      { text: " of the month and sent you " },
      { text: "21 enquiries", emphasis: true },
      { text: ", 6 more than in September." },
    ]);
  });

  it("words a fall and no change as plainly as a rise", () => {
    const base = { uptimePercent: 99.9, previousMonthName: "September" };
    expect(text({ ...base, enquiries: 10, previousEnquiries: 13 })).toBe("Your website was online 99.9% of the month and sent you 10 enquiries, 3 fewer than in September.");
    expect(text({ ...base, enquiries: 10, previousEnquiries: 10 })).toBe("Your website was online 99.9% of the month and sent you 10 enquiries, the same as in September.");
  });

  it("leaves the comparison out when there is nothing to compare", () => {
    expect(text({ uptimePercent: 100, enquiries: 9, previousEnquiries: null, previousMonthName: null })).toBe("Your website was online 100% of the month and sent you 9 enquiries.");
  });

  it("says enquiry for one", () => {
    expect(text({ uptimePercent: 100, enquiries: 1, previousEnquiries: null, previousMonthName: null })).toBe("Your website was online 100% of the month and sent you 1 enquiry.");
  });

  it("says plainly when the site was down more than it should be", () => {
    expect(text({ uptimePercent: 98.8, enquiries: 4, previousEnquiries: 4, previousMonthName: "September" })).toBe(
      "Your website was online 98.8% of the month, which is lower than we want, and sent you 4 enquiries, the same as in September.",
    );
  });

  it("uses only what was measured", () => {
    expect(text({ uptimePercent: 99.96, enquiries: null, previousEnquiries: null, previousMonthName: null })).toBe("Your website was online 99.96% of the month.");
    expect(text({ uptimePercent: null, enquiries: 21, previousEnquiries: 15, previousMonthName: "September" })).toBe("Your website sent you 21 enquiries, 6 more than in September.");
  });

  it("has no sentence when nothing was measured", () => {
    expect(websiteHeadline({ uptimePercent: null, enquiries: null, previousEnquiries: null, previousMonthName: null })).toBeNull();
  });

  it("keeps a zero: the site was watched and nobody got in touch", () => {
    expect(text({ uptimePercent: 99.9, enquiries: 0, previousEnquiries: 3, previousMonthName: "September" })).toBe("Your website was online 99.9% of the month and sent you 0 enquiries, 3 fewer than in September.");
  });
});
