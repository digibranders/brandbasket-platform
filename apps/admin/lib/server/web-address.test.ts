import {
  businessUrlCode,
  changePlaceUrl,
  findPlaces,
  InvalidPlaceUrlChangeReasonError,
  InvalidPlaceUrlError,
  PlaceUrlNotLiveError,
  UnknownPlaceError,
  type Database,
  type DirectoryPlace,
  type ScopedTransaction,
} from "@fynix/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEB_ADDRESS_MESSAGES } from "../web-address-form";
import { getStaffDb } from "./db";
import { changeWebAddress } from "./web-address";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return { ...actual, changePlaceUrl: vi.fn(), findPlaces: vi.fn() };
});

const STAFF_USER = "staff-1";
const NOW = new Date("2026-10-01T10:00:00.000Z");
const TX = { name: "tx" } as unknown as ScopedTransaction;
const SMILE: DirectoryPlace = {
  id: "k7m2q9a",
  origin: "open_data",
  stateCode: "mh",
  citySlug: "thane",
  urlSlug: "smile-dental",
  urlLockedAt: new Date("2026-09-01T00:00:00.000Z"),
};

const transaction = vi.fn(async (work: (tx: ScopedTransaction) => Promise<unknown>) => work(TX));

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    placeId: SMILE.id,
    urlSlug: "smile-dental-care",
    citySlug: "thane",
    reason: "Rebranded in September",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function change(overrides: Record<string, string> = {}) {
  return changeWebAddress({ formData: form(overrides), staffUserId: STAFF_USER, now: NOW });
}

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(async (work) => work(TX));
  vi.mocked(getStaffDb).mockReturnValue({ transaction } as unknown as Database);
  let current = SMILE;
  vi.mocked(findPlaces).mockImplementation(async () => new Map([[current.id, current]]));
  vi.mocked(changePlaceUrl).mockImplementation(async (_tx, _id, url) => {
    current = { ...current, ...url };
  });
});

describe("changeWebAddress", () => {
  it("changes the URL in one transaction and answers with the full new address", async () => {
    expect(await change()).toEqual({
      status: "changed",
      url: `https://fynix.digital/in/mh/business/smile-dental-care/${businessUrlCode("k7m2q9a")}`,
    });
    expect(changePlaceUrl).toHaveBeenCalledWith(
      TX,
      "k7m2q9a",
      { citySlug: "thane", urlSlug: "smile-dental-care" },
      { staffUserId: STAFF_USER, reason: "Rebranded in September" },
      NOW,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("tidies what was typed: spaces around it, and capitals in the name part", async () => {
    await change({ urlSlug: "  Smile-Dental-Care ", reason: "  Rebranded  " });
    expect(changePlaceUrl).toHaveBeenCalledWith(TX, "k7m2q9a", { citySlug: "thane", urlSlug: "smile-dental-care" }, { staffUserId: STAFF_USER, reason: "Rebranded" }, NOW);
  });

  it.each([
    ["urlSlug", { urlSlug: "smile dental" }],
    ["urlSlug", { urlSlug: "a".repeat(71) }],
    ["citySlug", { citySlug: "atlantis" }],
    ["reason", { reason: "no" }],
    ["reason", { reason: "   " }],
    ["reason", { reason: "x".repeat(301) }],
  ] as const)("refuses a bad %s and keeps what was typed", async (field, overrides) => {
    const outcome = await change(overrides);
    expect(outcome).toMatchObject({ status: "error", field, message: WEB_ADDRESS_MESSAGES[field] });
    expect(outcome.status === "error" ? outcome.values : null).toMatchObject(overrides);
    expect(changePlaceUrl).not.toHaveBeenCalled();
  });

  it("keeps a city the directory's lists do not have when the business is already there", async () => {
    vi.mocked(findPlaces).mockResolvedValue(new Map([[SMILE.id, { ...SMILE, citySlug: "new-town" }]]));
    expect(await change({ citySlug: "new-town" })).toEqual({
      status: "changed",
      url: `https://fynix.digital/in/mh/business/smile-dental-care/${businessUrlCode("k7m2q9a")}`,
    });
    expect(await change({ citySlug: "old-town" })).toMatchObject({ status: "error", field: "citySlug", message: WEB_ADDRESS_MESSAGES.citySlug });
  });

  it("renames a business outside the opened districts but keeps it in its own city, which its PIN set", async () => {
    const kolkata: DirectoryPlace = { ...SMILE, stateCode: "wb", citySlug: "wb-north-24-parganas" };
    vi.mocked(findPlaces).mockResolvedValue(new Map([[kolkata.id, kolkata]]));
    expect(await change({ citySlug: "thane" })).toEqual({
      status: "error",
      field: "citySlug",
      message: WEB_ADDRESS_MESSAGES.otherState,
      values: { urlSlug: "smile-dental-care", citySlug: "thane", reason: "Rebranded in September" },
    });
    expect(await change({ citySlug: "wb-kolkata" })).toMatchObject({ status: "error", message: WEB_ADDRESS_MESSAGES.otherState });
    expect(changePlaceUrl).not.toHaveBeenCalled();

    expect(await change({ citySlug: "wb-north-24-parganas" })).toMatchObject({ status: "changed" });
    expect(changePlaceUrl).toHaveBeenCalledWith(
      TX,
      "k7m2q9a",
      { citySlug: "wb-north-24-parganas", urlSlug: "smile-dental-care" },
      { staffUserId: STAFF_USER, reason: "Rebranded in September" },
      NOW,
    );
  });

  it("keeps a Maharashtra business outside Thane in its own city too", async () => {
    const pune: DirectoryPlace = { ...SMILE, stateCode: "mh", citySlug: "mh-pune" };
    vi.mocked(findPlaces).mockResolvedValue(new Map([[pune.id, pune]]));
    expect(await change({ citySlug: "thane" })).toMatchObject({ status: "error", field: "citySlug", message: WEB_ADDRESS_MESSAGES.otherState });
    expect(changePlaceUrl).not.toHaveBeenCalled();
  });

  it("says when the address is already the one asked for, and writes nothing", async () => {
    expect(await change({ urlSlug: "smile-dental" })).toMatchObject({ status: "error", field: "urlSlug", message: WEB_ADDRESS_MESSAGES.same });
    expect(changePlaceUrl).not.toHaveBeenCalled();
  });

  it.each([
    [new PlaceUrlNotLiveError("k7m2q9a"), null, WEB_ADDRESS_MESSAGES.notLive],
    [new UnknownPlaceError("k7m2q9a"), null, WEB_ADDRESS_MESSAGES.unknown],
    [new InvalidPlaceUrlError({ citySlug: "thane", urlSlug: "x" }), "urlSlug", WEB_ADDRESS_MESSAGES.urlSlug],
    [new InvalidPlaceUrlChangeReasonError(), "reason", WEB_ADDRESS_MESSAGES.reason],
  ] as const)("answers %s as a message for the form", async (error, field, message) => {
    vi.mocked(changePlaceUrl).mockRejectedValue(error);
    expect(await change()).toMatchObject({ status: "error", field, message });
  });

  it("answers a business that is gone before anything is written", async () => {
    vi.mocked(findPlaces).mockResolvedValue(new Map());
    expect(await change()).toMatchObject({ status: "error", field: null, message: WEB_ADDRESS_MESSAGES.unknown });
    expect(changePlaceUrl).not.toHaveBeenCalled();
  });

  it("lets any other failure through", async () => {
    vi.mocked(changePlaceUrl).mockRejectedValue(new Error("connection lost"));
    await expect(change()).rejects.toThrow("connection lost");
  });

  it("throws on a form that does not name a business by its id", async () => {
    await expect(change({ placeId: "not-an-id" })).rejects.toThrow("The web address form must name a business id.");
    expect(changePlaceUrl).not.toHaveBeenCalled();
  });
});
