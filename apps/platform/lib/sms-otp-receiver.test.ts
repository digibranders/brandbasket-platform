import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSmsOtpReceiver, type SmsOtpReceiver, type SmsOtpRuntime } from "./sms-otp-receiver";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

const receivers: SmsOtpReceiver[] = [];

function setup(): {
  receiver: SmsOtpReceiver;
  sms: ReturnType<typeof deferred<unknown>>;
  onCode: ReturnType<typeof vi.fn<(otpId: string, code: string) => void>>;
  read: ReturnType<typeof vi.fn<SmsOtpRuntime["read"]>>;
} {
  const sms = deferred<unknown>();
  const onCode = vi.fn<(otpId: string, code: string) => void>();
  const read = vi.fn<SmsOtpRuntime["read"]>(() => sms.promise);
  const receiver = createSmsOtpReceiver(onCode, { read });
  receivers.push(receiver);
  return { receiver, sms, onCode, read };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  receivers.splice(0).forEach((receiver) => receiver.cancel());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SMS OTP receiving", () => {
  it("registers before sending and buffers a fast leading-zero code until its challenge returns", async () => {
    const { receiver, sms, onCode, read } = setup();
    const response = deferred<{ id: string }>();
    const result = receiver.receive(() => {
      expect(read).toHaveBeenCalledOnce();
      return response.promise;
    }, (value) => value.id);
    sms.resolve({ code: "004821" });
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    response.resolve({ id: "challenge-1" });
    await expect(result).resolves.toEqual({ id: "challenge-1" });
    expect(onCode).toHaveBeenCalledExactlyOnceWith("challenge-1", "004821");
  });

  it("fills only the challenge returned by the successful send", async () => {
    const { receiver, sms, onCode, read } = setup();
    await receiver.receive(async () => ({ id: "challenge-2" }), (value) => value.id);
    sms.resolve({ code: "482913" });
    await flush();
    expect(onCode).toHaveBeenCalledExactlyOnceWith("challenge-2", "482913");
    expect(read.mock.calls[0]?.[0].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("updates the delivery callback without restarting an active reception", async () => {
    const sms = deferred<unknown>();
    const initial = vi.fn();
    const updated = vi.fn();
    const read = vi.fn<SmsOtpRuntime["read"]>(() => sms.promise);
    const receiver = createSmsOtpReceiver(initial, { read });
    receivers.push(receiver);
    await receiver.receive(async () => "challenge", (value) => value);
    receiver.setHandler(updated);
    sms.resolve({ code: "004821" });
    await flush();
    expect(initial).not.toHaveBeenCalled();
    expect(updated).toHaveBeenCalledExactlyOnceWith("challenge", "004821");
    expect(read).toHaveBeenCalledOnce();
  });

  it.each([null, {}, { code: 482913 }, { code: "12345" }, { code: "1234567" }, { code: "12a456" }, { code: " 123456" }, { code: "123456\n" }])(
    "ignores malformed credentials %j", async (credential) => {
      const { receiver, sms, onCode } = setup();
      await receiver.receive(async () => "challenge", (value) => value);
      sms.resolve(credential);
      await flush();
      expect(onCode).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("keeps the server result when browser consent is denied", async () => {
    const { receiver, sms, onCode } = setup();
    const result = receiver.receive(async () => "challenge", (value) => value);
    sms.reject(new Error("NotAllowedError"));
    await expect(result).resolves.toBe("challenge");
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows manual entry after a synchronous credential API failure", async () => {
    const onCode = vi.fn();
    const receiver = createSmsOtpReceiver(onCode, { read: () => { throw new Error("SecurityError"); } });
    receivers.push(receiver);
    await expect(receiver.receive(async () => "challenge", (value) => value)).resolves.toBe("challenge");
    expect(onCode).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not need a browser API to send a code", async () => {
    const onCode = vi.fn();
    const receiver = createSmsOtpReceiver(onCode, null);
    receivers.push(receiver);
    await expect(receiver.receive(async () => "challenge", (value) => value)).resolves.toBe("challenge");
    expect(onCode).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["insecure", "unsupported", "embedded"])("does not request SMS in an %s context", async (context) => {
    const read = vi.fn();
    const browser: Record<string, unknown> = { isSecureContext: context !== "insecure" };
    browser.top = context === "embedded" ? {} : browser;
    if (context !== "unsupported") browser.OTPCredential = {};
    vi.stubGlobal("window", browser);
    vi.stubGlobal("navigator", { credentials: { get: read } });
    const receiver = createSmsOtpReceiver(vi.fn());
    receivers.push(receiver);
    await expect(receiver.receive(async () => "challenge", (value) => value)).resolves.toBe("challenge");
    expect(read).not.toHaveBeenCalled();
  });

  it("requests only SMS transport with an abort signal on a supported browser", async () => {
    const read = vi.fn(async () => ({ code: "004821" }));
    const browser: Record<string, unknown> = { isSecureContext: true, OTPCredential: {} };
    browser.top = browser;
    vi.stubGlobal("window", browser);
    vi.stubGlobal("navigator", { credentials: { get: read } });
    const onCode = vi.fn();
    const receiver = createSmsOtpReceiver(onCode);
    receivers.push(receiver);
    await receiver.receive(async () => "challenge", (value) => value);
    await flush();
    expect(read).toHaveBeenCalledExactlyOnceWith({ otp: { transport: ["sms"] }, signal: expect.any(AbortSignal) });
    expect(onCode).toHaveBeenCalledExactlyOnceWith("challenge", "004821");
  });

  it("cancels the receiver and propagates a failed server action", async () => {
    const { receiver, sms, onCode, read } = setup();
    const failure = new Error("Send failed");
    await expect(receiver.receive(async () => { throw failure; }, () => "challenge")).rejects.toBe(failure);
    expect(read.mock.calls[0]?.[0].aborted).toBe(true);
    sms.resolve({ code: "123456" });
    await flush();
    expect(onCode).not.toHaveBeenCalled();
  });

  it("discards a buffered code when no challenge was created", async () => {
    const { receiver, sms, onCode, read } = setup();
    const response = deferred<string>();
    const result = receiver.receive(() => response.promise, () => null);
    sms.resolve({ code: "123456" });
    await flush();
    response.resolve("published-without-otp");
    await expect(result).resolves.toBe("published-without-otp");
    expect(onCode).not.toHaveBeenCalled();
    expect(read.mock.calls[0]?.[0].aborted).toBe(true);
  });

  it("cancels when typing, confirming, navigating or hiding a form and ignores late SMS", async () => {
    const { receiver, sms, onCode, read } = setup();
    await receiver.receive(async () => "challenge", (value) => value);
    receiver.cancel();
    receiver.cancel();
    expect(read.mock.calls[0]?.[0].aborted).toBe(true);
    sms.resolve({ code: "123456" });
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reactivate when an abandoned send returns late", async () => {
    const { receiver, sms, onCode } = setup();
    const response = deferred<string>();
    const result = receiver.receive(() => response.promise, (value) => value);
    sms.resolve({ code: "123456" });
    await flush();
    receiver.cancel();
    response.resolve("abandoned-challenge");
    await result;
    expect(onCode).not.toHaveBeenCalled();
  });

  it("replaces a receiver in another form on the same page", async () => {
    const first = setup();
    const second = setup();
    await first.receiver.receive(async () => "review", (value) => value);
    await second.receiver.receive(async () => "comment", (value) => value);
    expect(first.read.mock.calls[0]?.[0].aborted).toBe(true);
    first.sms.resolve({ code: "111111" });
    second.sms.resolve({ code: "222222" });
    await flush();
    expect(first.onCode).not.toHaveBeenCalled();
    expect(second.onCode).toHaveBeenCalledExactlyOnceWith("comment", "222222");
  });

  it("an old send cannot cancel or fill a later resend", async () => {
    const firstSms = deferred<unknown>();
    const secondSms = deferred<unknown>();
    const oldResponse = deferred<string>();
    const onCode = vi.fn();
    const read = vi.fn<SmsOtpRuntime["read"]>().mockReturnValueOnce(firstSms.promise).mockReturnValueOnce(secondSms.promise);
    const receiver = createSmsOtpReceiver(onCode, { read });
    receivers.push(receiver);
    const oldSend = receiver.receive(() => oldResponse.promise, (value) => value);
    await receiver.receive(async () => "new-challenge", (value) => value);
    oldResponse.resolve("old-challenge");
    await oldSend;
    firstSms.resolve({ code: "111111" });
    secondSms.resolve({ code: "222222" });
    await flush();
    expect(onCode).toHaveBeenCalledExactlyOnceWith("new-challenge", "222222");
  });

  it("stops after sixty seconds and rejects a late browser resolution", async () => {
    const { receiver, sms, onCode, read } = setup();
    await receiver.receive(async () => "challenge", (value) => value);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read.mock.calls[0]?.[0].aborted).toBe(true);
    sms.resolve({ code: "123456" });
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a failed older send cannot abort the latest receiver", async () => {
    const firstSms = deferred<unknown>();
    const secondSms = deferred<unknown>();
    const oldResponse = deferred<string>();
    const onCode = vi.fn();
    const read = vi.fn<SmsOtpRuntime["read"]>().mockReturnValueOnce(firstSms.promise).mockReturnValueOnce(secondSms.promise);
    const receiver = createSmsOtpReceiver(onCode, { read });
    receivers.push(receiver);
    const oldSend = receiver.receive(() => oldResponse.promise, (value) => value);
    const rejected = expect(oldSend).rejects.toThrow("Old send failed");
    await receiver.receive(async () => "new-challenge", (value) => value);
    oldResponse.reject(new Error("Old send failed"));
    await rejected;
    expect(read.mock.calls[1]?.[0].aborted).toBe(false);
    secondSms.resolve({ code: "004821" });
    await flush();
    expect(onCode).toHaveBeenCalledExactlyOnceWith("new-challenge", "004821");
  });
});
