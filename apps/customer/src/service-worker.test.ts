import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const CUSTOMER = resolve(__dirname, "../public");
const ADMIN = resolve(__dirname, "../../admin/public");
const source = (dir: string, file: string): string => readFileSync(resolve(dir, file), "utf8");

type Listener = (event: unknown) => void;

function load() {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const focused = vi.fn();
  const self = {
    location: { origin: "https://app.example.test" },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    clients: {
      windows: [] as unknown[],
      matchAll: async function () {
        return self.clients.windows;
      },
      openWindow: async (url: string) => void opened.push(url),
    },
  };
  runInNewContext(source(CUSTOMER, "sw.js"), { self, URL, console });
  const fire = async (type: string, event: Record<string, unknown>): Promise<void> => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({ ...event, waitUntil: (work: Promise<unknown>) => (pending = work) });
    await pending;
  };
  return { self, shown, opened, navigated, focused, fire };
}

describe("the service worker", () => {
  it("is the same file in both apps", () => {
    expect(source(ADMIN, "sw.js")).toBe(source(CUSTOMER, "sw.js"));
  });

  it("shows the notification with its tag and address", async () => {
    const { shown, fire } = load();
    await fire("push", { data: { json: () => ({ title: "Payment failed", body: "Open Billing", tag: "billing.payment_failed", url: "https://app.example.test/billing" }) } });
    expect(shown).toHaveLength(1);
    expect(shown[0]?.title).toBe("Payment failed");
    expect(shown[0]?.options).toMatchObject({ body: "Open Billing", tag: "billing.payment_failed", data: { url: "https://app.example.test/billing" } });
  });

  it("still shows something when the message cannot be read", async () => {
    const { shown, fire } = load();
    await fire("push", { data: { json: () => { throw new Error("not json"); } } });
    expect(shown[0]?.title).toBe("Brandbasket");
  });

  it("opens the page on a tap, in a new window when none is open", async () => {
    const { opened, fire } = load();
    const close = vi.fn();
    await fire("notificationclick", { notification: { close, data: { url: "https://app.example.test/billing" } } });
    expect(close).toHaveBeenCalled();
    expect(opened).toEqual(["https://app.example.test/billing"]);
  });

  it("focuses an open window and sends it to the page", async () => {
    const { self, fire } = load();
    const navigate = vi.fn(async () => undefined);
    const client = { focus: async () => ({ navigate }), navigate };
    self.clients.windows.push(client);
    await fire("notificationclick", { notification: { close: () => undefined, data: { url: "https://app.example.test/requests" } } });
    expect(navigate).toHaveBeenCalledWith("https://app.example.test/requests");
  });

  it("never opens another site's address", async () => {
    const { opened, fire } = load();
    await fire("notificationclick", { notification: { close: () => undefined, data: { url: "https://evil.example/phish" } } });
    expect(opened).toEqual(["https://app.example.test/"]);
  });
});

describe("the manifests", () => {
  it.each([
    ["customer", CUSTOMER],
    ["admin", ADMIN],
  ])("%s manifest is installable: standalone, 512 and maskable icons that exist", (_app, dir) => {
    const manifest = JSON.parse(source(dir, "manifest.webmanifest")) as { display: string; start_url: string; icons: { src: string; sizes: string; purpose: string }[] };
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any")).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) expect(() => readFileSync(resolve(dir, icon.src.slice(1)))).not.toThrow();
  });
});
