import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetOfflineAnswer, isSiteOffline } from "../lib/offline-check";
import { maintenanceResponse } from "../lib/maintenance-response";

const fetchMock = vi.fn();
const OFFLINE = () => Response.json({ error: "This website is offline.", code: "site_offline" }, { status: 403 });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.BRANDBASKET_API_ORIGIN = "https://app.example.test";
  process.env.BRANDBASKET_SITE_TOKEN = "token-1";
  forgetOfflineAnswer();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("maintenanceResponse", () => {
  it("is a 503 that asks to be retried and keeps the page out of search", async () => {
    const response = maintenanceResponse("Riverside Dental");
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<title>Under maintenance</title>");
    expect(html).toContain("Riverside Dental is taking a short break");
  });

  it("escapes a business name that carries markup, and shows no links", async () => {
    const html = await maintenanceResponse("<script>x</script>").text();
    expect(html).not.toContain("<script>x");
    expect(html).not.toContain("<a ");
  });

  it("falls back to the plain headline without a name", async () => {
    expect(await maintenanceResponse().text()).toContain("We'll be back soon");
  });
});

describe("isSiteOffline", () => {
  it("is true when the platform says the plan has ended", async () => {
    fetchMock.mockResolvedValue(OFFLINE());
    await expect(isSiteOffline(0)).resolves.toBe(true);
  });

  it("is never offline outside production when no site token is set", async () => {
    delete process.env.BRANDBASKET_SITE_TOKEN;
    await expect(isSiteOffline(0)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is false while the plan runs", async () => {
    fetchMock.mockResolvedValue(Response.json({ business: "Riverside" }));
    await expect(isSiteOffline(0)).resolves.toBe(false);
  });

  it("does not ask again within a minute, and asks again after", async () => {
    fetchMock.mockImplementation(async () => OFFLINE());
    await isSiteOffline(0);
    await isSiteOffline(59_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await isSiteOffline(61_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("comes back within a minute of the client paying", async () => {
    fetchMock.mockImplementationOnce(async () => OFFLINE()).mockImplementationOnce(async () => Response.json({ business: "Riverside" }));
    await expect(isSiteOffline(0)).resolves.toBe(true);
    await expect(isSiteOffline(61_000)).resolves.toBe(false);
  });

  it("never takes the site offline for a platform error, and asks again soon", async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: "no" }, { status: 401 }));
    await expect(isSiteOffline(0)).resolves.toBe(false);
    await isSiteOffline(11_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never takes the site offline when the platform cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(isSiteOffline(0)).resolves.toBe(false);
  });
});
