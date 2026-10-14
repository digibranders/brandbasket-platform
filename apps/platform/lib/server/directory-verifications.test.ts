import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readClaimedWebsites,
  readDirectoryStatuses,
  readLiveDirectoryPictures,
  resolveDirectoryAsk,
  type Database,
} from "@firstfold/db";
import { statusResponseSchema } from "@/lib/directory-api";
import { getStaffDb } from "./db";
import { readStatuses } from "./directory-verifications";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@firstfold/db", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/db")>("@firstfold/db");
  return {
    answerByAsked: actual.answerByAsked,
    readClaimedWebsites: vi.fn(),
    readDirectoryStatuses: vi.fn(),
    readLiveDirectoryPictures: vi.fn(),
    resolveDirectoryAsk: vi.fn(),
  };
});

const DB = {} as Database;
const ID = "k7m2q9a";
const KEY = "dentists/thane/naupada/smile-dental";
const GYM_KEY = "gyms/thane/majiwada/iron-house";
const PHOTO = "0192f3c4-0000-7000-8000-000000000001";
const VERIFIED_AT = new Date("2026-09-29T09:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStaffDb).mockReturnValue(DB);
});

describe("readStatuses", () => {
  it("reads each business once and answers under every id and key it was asked by", async () => {
    const lookup = { placeIds: [ID], unplacedKeys: [GYM_KEY] };
    vi.mocked(resolveDirectoryAsk).mockResolvedValue({
      lookup,
      readAs: new Map([
        [ID, ID],
        [KEY, ID],
        [GYM_KEY, GYM_KEY],
      ]),
    });
    vi.mocked(readDirectoryStatuses).mockResolvedValue(
      new Map([
        [ID, { verifiedAt: VERIFIED_AT, phone: "+919820011223", trusted: false }],
        [GYM_KEY, { verifiedAt: VERIFIED_AT, phone: null, trusted: true }],
      ]),
    );
    vi.mocked(readLiveDirectoryPictures).mockResolvedValue(new Map([[ID, { listing: PHOTO, ad_tall: null, ad_wide: null }]]));
    vi.mocked(readClaimedWebsites).mockResolvedValue(new Map([[ID, "https://smiledental.example/"]]));

    const answer = await readStatuses({ ids: [ID], keys: [KEY, GYM_KEY] });

    const smile = {
      verifiedAt: VERIFIED_AT.toISOString(),
      phone: "+919820011223",
      photo: PHOTO,
      website: "https://smiledental.example/",
      trusted: false,
    };
    expect(answer).toEqual({
      statuses: {
        [ID]: smile,
        [KEY]: smile,
        // The Trusted tag staff granted by hand travels with the status.
        [GYM_KEY]: { verifiedAt: VERIFIED_AT.toISOString(), phone: null, photo: null, website: null, trusted: true },
      },
    });
    expect(statusResponseSchema.parse(answer)).toEqual(answer);
    expect(resolveDirectoryAsk).toHaveBeenCalledWith(DB, { ids: [ID], keys: [KEY, GYM_KEY] });
    for (const read of [readDirectoryStatuses, readLiveDirectoryPictures, readClaimedWebsites]) {
      expect(read).toHaveBeenCalledWith(DB, lookup);
    }
  });

  it("leaves out a business that is not verified, whatever pictures or website it has", async () => {
    vi.mocked(resolveDirectoryAsk).mockResolvedValue({ lookup: { placeIds: [ID], unplacedKeys: [] }, readAs: new Map([[ID, ID]]) });
    vi.mocked(readDirectoryStatuses).mockResolvedValue(new Map());
    vi.mocked(readLiveDirectoryPictures).mockResolvedValue(new Map([[ID, { listing: PHOTO, ad_tall: null, ad_wide: null }]]));
    vi.mocked(readClaimedWebsites).mockResolvedValue(new Map([[ID, "https://smiledental.example/"]]));
    expect(await readStatuses({ ids: [ID], keys: [] })).toEqual({ statuses: {} });
  });
});
