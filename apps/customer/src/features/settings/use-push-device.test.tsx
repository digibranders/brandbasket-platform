import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUSH_MESSAGES, usePushDevice } from "@brandbasket/shared/lib/use-push-device";

const KEY = "AQID";
const SUBSCRIPTION = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "a" } };

interface Stubs {
  subscription: { toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn>; endpoint: string } | null;
  permission: NotificationPermission;
  request: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

function stubBrowser(overrides: Partial<{ permission: NotificationPermission; existing: boolean; userAgent: string; standalone: boolean; pushManager: boolean }> = {}): Stubs {
  const subscription = { endpoint: SUBSCRIPTION.endpoint, toJSON: () => SUBSCRIPTION, unsubscribe: vi.fn(async () => true) };
  const stubs: Stubs = {
    subscription: overrides.existing ? subscription : null,
    permission: overrides.permission ?? "default",
    request: vi.fn(async () => "granted"),
    register: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => subscription),
  };
  const pushManager = { getSubscription: async () => stubs.subscription, subscribe: stubs.subscribe };
  const registration = { pushManager };
  vi.stubGlobal("navigator", {
    userAgent: overrides.userAgent ?? "Mozilla/5.0 (X11; Linux x86_64) Chrome/130",
    maxTouchPoints: 0,
    standalone: overrides.standalone,
    serviceWorker: { getRegistration: async () => (overrides.existing ? registration : undefined), register: stubs.register, ready: Promise.resolve(registration) },
  });
  vi.stubGlobal("Notification", Object.assign(vi.fn(), { permission: stubs.permission, requestPermission: stubs.request }));
  if (overrides.pushManager !== false) vi.stubGlobal("PushManager", vi.fn());
  else vi.stubGlobal("PushManager", undefined);
  if (overrides.pushManager === false) delete (window as unknown as Record<string, unknown>).PushManager;
  window.matchMedia = vi.fn(() => ({ matches: overrides.standalone === true })) as never;
  return stubs;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("usePushDevice", () => {
  it("looks without asking: no permission question and no worker registered on load", async () => {
    const stubs = stubBrowser();
    const { result } = renderHook(() => usePushDevice({ publicKey: KEY, save: vi.fn(), remove: vi.fn() }));
    await waitFor(() => expect(result.current.state).toBe("off"));
    expect(stubs.request).not.toHaveBeenCalled();
    expect(stubs.register).not.toHaveBeenCalled();
  });

  it("reads an existing subscription as on", async () => {
    stubBrowser({ existing: true });
    const { result } = renderHook(() => usePushDevice({ publicKey: KEY, save: vi.fn(), remove: vi.fn() }));
    await waitFor(() => expect(result.current.state).toBe("on"));
  });

  it("turns on after the click: asks permission, registers, subscribes and saves", async () => {
    const stubs = stubBrowser();
    const save = vi.fn(async () => ({ ok: true }));
    const { result } = renderHook(() => usePushDevice({ publicKey: KEY, save, remove: vi.fn() }));
    await waitFor(() => expect(result.current.state).toBe("off"));
    await act(() => result.current.turnOn());
    expect(stubs.request).toHaveBeenCalledTimes(1);
    expect(stubs.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(stubs.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(save).toHaveBeenCalledWith(SUBSCRIPTION);
    expect(result.current.state).toBe("on");
  });

  it("gives the browser's subscription back when our server could not save it", async () => {
    const stubs = stubBrowser();
    const { result } = renderHook(() => usePushDevice({ publicKey: KEY, save: vi.fn(async () => ({ ok: false })), remove: vi.fn() }));
    await waitFor(() => expect(result.current.state).toBe("off"));
    await act(() => result.current.turnOn());
    const subscription = await stubs.subscribe.mock.results[0]?.value;
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(result.current.state).toBe("off");
    expect(result.current.message).toBe(PUSH_MESSAGES.failed);
  });

  it("says it is blocked when the person declines the browser's question", async () => {
    const stubs = stubBrowser();
    stubs.request.mockResolvedValueOnce("denied");
    const { result } = renderHook(() => usePushDevice({ publicKey: KEY, save: vi.fn(), remove: vi.fn() }));
    await waitFor(() => expect(result.current.state).toBe("off"));
    await act(() => result.current.turnOn());
    expect(result.current.state).toBe("blocked");
    expect(result.current.message).toBe(PUSH_MESSAGES.blocked);
    expect(stubs.register).not.toHaveBeenCalled();
  });

  it("turns off: removes the address on our side, then in the browser", async () => {
    const stubs = stubBrowser({ existing: true });
    const remove = vi.fn(async () => ({ ok: true }));
    const { result } = renderHook(() => usePushDevice({ publicKey: KEY, save: vi.fn(), remove }));
    await waitFor(() => expect(result.current.state).toBe("on"));
    await act(() => result.current.turnOff());
    expect(remove).toHaveBeenCalledWith(SUBSCRIPTION.endpoint);
    expect(stubs.subscription?.unsubscribe).toHaveBeenCalled();
    expect(result.current.state).toBe("off");
  });

  it("is unavailable without a key, and asks an iPhone browser tab to install the app", async () => {
    stubBrowser();
    const noKey = renderHook(() => usePushDevice({ publicKey: null, save: vi.fn(), remove: vi.fn() }));
    await waitFor(() => expect(noKey.result.current.state).toBe("unavailable"));
    stubBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", pushManager: false });
    const iphone = renderHook(() => usePushDevice({ publicKey: KEY, save: vi.fn(), remove: vi.fn() }));
    await waitFor(() => expect(iphone.result.current.state).toBe("needs-install"));
  });
});
