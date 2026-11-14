import { describe, expect, it } from "vitest";
import { isPostingServicePicture, postPictureSrc } from "./post-picture";

const BASE = "https://social.digibranders.com/publisher";

describe("the picture of a post on the calendar", () => {
  it("is asked for at this app's own address", () => {
    expect(postPictureSrc("https://social.digibranders.com/publisher/posts/b/h.jpg")).toBe("/api/social-post-picture?src=https%3A%2F%2Fsocial.digibranders.com%2Fpublisher%2Fposts%2Fb%2Fh.jpg");
  });

  it("is fetched only when it is a poster picture of the posting service", () => {
    expect(isPostingServicePicture(`${BASE}/posts/brandbasket-01a1-x/abc123.jpg`, BASE)).toBe(true);
    expect(isPostingServicePicture(`${BASE}/posts/b/h.PNG`, BASE)).toBe(true);
    expect(isPostingServicePicture("https://social.digibranders.com/posts/b/h.jpg", "https://social.digibranders.com")).toBe(true);
  });

  it("refuses another site, another path, a query, a login in the address and anything that climbs out", () => {
    expect(isPostingServicePicture("https://evil.example/publisher/posts/b/h.jpg", BASE)).toBe(false);
    expect(isPostingServicePicture(`${BASE}/api/v1/workspaces`, BASE)).toBe(false);
    expect(isPostingServicePicture(`${BASE}/posts/b/h.jpg?x=1`, BASE)).toBe(false);
    expect(isPostingServicePicture("https://user:pw@social.digibranders.com/publisher/posts/b/h.jpg", BASE)).toBe(false);
    expect(isPostingServicePicture(`${BASE}/posts/../secret.jpg`, BASE)).toBe(false);
    expect(isPostingServicePicture(`${BASE}/posts/b/h.svg`, BASE)).toBe(false);
    expect(isPostingServicePicture("not a url", BASE)).toBe(false);
  });
});
