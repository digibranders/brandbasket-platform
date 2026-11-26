import { describe, expect, it, vi } from "vitest";
import type { Database } from "@brandbasket/db";

const findChannelLinkMailInfo = vi.fn();
vi.mock("@brandbasket/db", () => ({ findChannelLinkMailInfo: (...args: unknown[]) => findChannelLinkMailInfo(...args), isPhoneAccountEmail: (email: string) => email.endsWith("@phone.invalid") }));

import { sendChannelLinkUpdate } from "./channel-link-mail";

const db = {} as Database;
const request = { network: "instagram", handle: "acme_foods", reason: null };
const info = { request, businessName: "Om Sweets", requester: { name: "Asha", email: "asha@om.test" } };
const run = (update: "received" | "invited" | "refused" | "connected", transport = { send: vi.fn(async () => undefined) }) => ({ transport, result: sendChannelLinkUpdate(db, transport as never, { requestId: "r1", update, appOrigin: "https://app.example.test", mode: "unified" }) });

describe("sendChannelLinkUpdate", () => {
  it("emails the person who sent the link, with the steps for her network and app mode when invited", async () => {
    findChannelLinkMailInfo.mockResolvedValue(info);
    const { transport, result } = run("invited");
    expect(await result).toBe("sent");
    const message = (transport.send.mock.calls[0] as unknown as [{ to: string; bodyText: string }])[0];
    expect(message.to).toBe("asha@om.test");
    expect(message.bodyText).toContain("Facebook, then Settings");
    expect(message.bodyText).toContain("https://app.example.test/social/review");
  });

  it("gives the team's reason when refused", async () => {
    findChannelLinkMailInfo.mockResolvedValue({ ...info, request: { ...request, reason: "Personal account." } });
    const { transport, result } = run("refused");
    expect(await result).toBe("sent");
    expect((transport.send.mock.calls[0] as unknown as [{ bodyText: string }])[0].bodyText).toContain("Personal account.");
  });

  it("sends nothing to a phone-only account, or when the request is gone", async () => {
    findChannelLinkMailInfo.mockResolvedValue({ ...info, requester: { name: "Asha", email: "91999@phone.invalid" } });
    const first = run("received");
    expect(await first.result).toBe("no-email");
    expect(first.transport.send).not.toHaveBeenCalled();
    findChannelLinkMailInfo.mockResolvedValue(null);
    expect(await run("connected").result).toBe("not-found");
  });

  it("never throws when the mail cannot be sent", async () => {
    findChannelLinkMailInfo.mockResolvedValue(info);
    const { result } = run("connected", { send: vi.fn(async () => { throw new Error("down"); }) });
    expect(await result).toBe("failed");
  });
});
