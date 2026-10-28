import { describe, expect, it } from "vitest";
import { ENQUIRY_CHANNELS, summariseEnquiries } from "./enquiries";

describe("summariseEnquiries", () => {
  it("adds the measured channels and ranks them, biggest first", () => {
    const summary = summariseEnquiries({ website_form: 12, website_call: 7, website_whatsapp: 2, website_email: 3, chatbot: 6, google_profile_call: 41, ad_lead: 38 });
    expect(summary.total).toBe(109);
    expect(summary.rows.map((row) => [row.channel, row.count])).toEqual([
      ["google_profile_call", 41],
      ["ad_lead", 38],
      ["website_form", 12],
      ["website_call", 7],
      ["chatbot", 6],
      ["website_email", 3],
      ["website_whatsapp", 2],
    ]);
    expect(summary.notMeasured).toEqual([]);
  });

  it("never counts a source that was not measured as zero", () => {
    const summary = summariseEnquiries({ website_form: 12, website_call: 7, google_profile_call: null });
    expect(summary.total).toBe(19);
    expect(summary.included).toEqual(["website_form", "website_call"]);
    expect(summary.notMeasured).toEqual(["website_whatsapp", "website_email", "chatbot", "google_profile_call", "ad_lead"]);
    expect(summary.rows.map((row) => row.channel)).toEqual(["website_form", "website_call"]);
  });

  it("keeps a measured zero: nothing came in, and we looked", () => {
    const summary = summariseEnquiries({ website_form: 0, website_call: 5 });
    expect(summary.included).toEqual(["website_form", "website_call"]);
    expect(summary.rows).toContainEqual(expect.objectContaining({ channel: "website_form", count: 0, sharePercent: 0 }));
  });

  it("gives each channel its share of the total in whole percent", () => {
    const summary = summariseEnquiries({ website_form: 1, website_call: 3 });
    expect(summary.rows.map((row) => row.sharePercent)).toEqual([75, 25]);
  });

  it("orders ties by the channel list, so the order never flickers", () => {
    const summary = summariseEnquiries({ chatbot: 4, website_form: 4 });
    expect(summary.rows.map((row) => row.channel)).toEqual(["website_form", "chatbot"]);
  });

  it("has a total of zero and no rows when nothing was measured", () => {
    const summary = summariseEnquiries({});
    expect(summary).toMatchObject({ total: 0, rows: [], included: [] });
    expect(summary.notMeasured).toEqual([...ENQUIRY_CHANNELS]);
  });

  it("refuses a count that cannot be real", () => {
    expect(() => summariseEnquiries({ website_form: -1 })).toThrow(RangeError);
    expect(() => summariseEnquiries({ website_form: 1.5 })).toThrow(RangeError);
  });

  it("labels each channel in the customer's words", () => {
    const summary = summariseEnquiries({ google_profile_call: 1 });
    expect(summary.rows[0]?.label).toBe("Google profile calls");
  });
});
