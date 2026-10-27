import { expect, it } from "vitest";
import { ASK_FOR_A_CHANGE_PATH, listHref, listRowHref, requestHref, REQUESTS_PATH } from "./links";

it("opens a request on the Requests page, with a notice when there is one", () => {
  expect(REQUESTS_PATH).toBe("/requests");
  expect(ASK_FOR_A_CHANGE_PATH).toBe("/requests/new");
  expect(requestHref("0192f3c4")).toBe("/requests?open=0192f3c4");
  expect(requestHref("0192f3c4", "window")).toBe("/requests?open=0192f3c4&notice=window");
});

it("keeps the list a row sits in when it is opened", () => {
  expect(listRowHref("0192f3c4", "done")).toBe("/requests?filter=done&open=0192f3c4");
  expect(listHref("open")).toBe("/requests?filter=open");
});
