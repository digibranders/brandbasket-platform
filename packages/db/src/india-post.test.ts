import { describe, expect, it } from "vitest";
import { cleanOfficeName, parseIndiaPostCsv, splitCsvLine, toSlug } from "./india-post";

const HEADER = "circlename,regionname,divisionname,officename,pincode,officetype,delivery,district,statename,latitude,longitude";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("cleanOfficeName", () => {
  it.each([
    ["Salt Lake Sector V S.O", "Salt Lake Sector V"],
    ["Bidhannagar CK Market S.O", "Bidhannagar CK Market"],
    ["Naupada B.O", "Naupada"],
    ["Thane H.O", "Thane"],
    ["Kalyan  SO", "Kalyan"],
    ["Naupada S.O (Thane)", "Naupada"],
    ["Vashi S.O (Thane)", "Vashi"],
    ["Bidhan Nagar CK Market SO", "Bidhan Nagar CK Market"],
    ["Town Hall SO Mumbai", "Town Hall"],
    ["Ramghat SO North 24 Parganas", "Ramghat"],
    ["Kinhola B.O RAMPURI BK", "Kinhola"],
    ["Sohagpur B.O", "Sohagpur"],
    ["SO", "SO"],
  ])("%j -> %j", (raw, clean) => expect(cleanOfficeName(raw)).toBe(clean));
});

describe("toSlug", () => {
  it("kebab-cases and drops punctuation", () => {
    expect(toSlug("North 24 Parganas")).toBe("north-24-parganas");
    expect(toSlug("Bidhannagar C.K. Market")).toBe("bidhannagar-c-k-market");
  });
});

describe("parseIndiaPostCsv", () => {
  it("groups offices by PIN, with state code, district and A-Z localities", () => {
    const result = parseIndiaPostCsv(
      csv(
        "West Bengal Circle,Kolkata,Salt Lake,Salt Lake Sector V S.O,700091,S.O,Delivery,NORTH 24 PARGANAS,WEST BENGAL,22.57,88.43",
        "West Bengal Circle,Kolkata,Salt Lake,Bidhannagar CK Market S.O,700091,S.O,Non Delivery,NORTH 24 PARGANAS,WEST BENGAL,NA,NA",
      ),
    );
    expect(result.records).toEqual([
      {
        pincode: "700091",
        stateCode: "wb",
        districtSlug: "north-24-parganas",
        districtName: "North 24 Parganas",
        localities: [
          { slug: "bidhannagar-ck-market", name: "Bidhannagar CK Market" },
          { slug: "salt-lake-sector-v", name: "Salt Lake Sector V" },
        ],
      },
    ]);
    expect(result.problems).toEqual([]);
  });

  it("keeps the district with most offices when a PIN spans two, and reports it", () => {
    const result = parseIndiaPostCsv(
      csv(
        "c,r,d,A B.O,421302,B.O,Delivery,THANE,MAHARASHTRA,NA,NA",
        "c,r,d,B B.O,421302,B.O,Delivery,THANE,MAHARASHTRA,NA,NA",
        "c,r,d,C B.O,421302,B.O,Delivery,PALGHAR,MAHARASHTRA,NA,NA",
      ),
    );
    expect(result.records[0]?.districtSlug).toBe("thane");
    expect(result.records[0]?.localities.map((l) => l.slug)).toEqual(["a", "b"]);
    expect(result.problems).toEqual(["421302: offices in 2 districts (thane, palghar); kept thane"]);
  });

  it("skips a row with a bad PIN or an unknown state, and reports it", () => {
    const result = parseIndiaPostCsv(csv("c,r,d,X B.O,12345,B.O,Delivery,D,MAHARASHTRA,NA,NA", "c,r,d,Y B.O,400001,B.O,Delivery,D,ATLANTIS,NA,NA"));
    expect(result.records).toEqual([]);
    expect(result.problems).toEqual(["line 2: bad PIN \"12345\"", "line 3: unknown state \"ATLANTIS\""]);
  });

  it("refuses a file whose header is not India Post's", () => {
    expect(() => parseIndiaPostCsv("pincode,office\n400001,Fort")).toThrow(/header/);
  });

  it("drops duplicate office names within one PIN", () => {
    const result = parseIndiaPostCsv(csv("c,r,d,Fort S.O,400001,S.O,Delivery,MUMBAI,MAHARASHTRA,NA,NA", "c,r,d,Fort H.O,400001,H.O,Delivery,MUMBAI,MAHARASHTRA,NA,NA"));
    expect(result.records[0]?.localities).toEqual([{ slug: "fort", name: "Fort" }]);
  });

  it("reads a file that starts with a byte order mark", () => {
    const result = parseIndiaPostCsv("\uFEFF" + csv("c,r,d,Fort S.O,400001,S.O,Delivery,MUMBAI,MAHARASHTRA,NA,NA"));
    expect(result.records).toHaveLength(1);
  });

  it("reads quoted fields, commas inside quotes and escaped quotes", () => {
    const result = parseIndiaPostCsv(
      csv(
        '"c","r","d","Fort, North S.O","400001","S.O","Delivery","MUMBAI","MAHARASHTRA","NA","NA"',
        'c,r,d,"Say ""Hi"" B.O",400001,B.O,Delivery,MUMBAI,MAHARASHTRA,NA,NA',
      ),
    );
    expect(result.records[0]?.localities.map((l) => l.name)).toEqual(["Fort, North", 'Say "Hi"']);
  });

  it("reads CRLF line endings", () => {
    const result = parseIndiaPostCsv(csv("c,r,d,Fort S.O,400001,S.O,Delivery,MUMBAI,MAHARASHTRA,NA,NA").replace(/\n/g, "\r\n"));
    expect(result.records).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  it("skips a row with no district or office name, and reports it", () => {
    const result = parseIndiaPostCsv(csv("c,r,d,Fort S.O,400001,S.O,Delivery,,MAHARASHTRA,NA,NA"));
    expect(result.records).toEqual([]);
    expect(result.problems).toEqual(["line 2: no district or office name"]);
  });

  it("keeps districts of the same name in different states apart", () => {
    const result = parseIndiaPostCsv(
      csv(
        "c,r,d,A B.O,431001,B.O,Delivery,AURANGABAD,MAHARASHTRA,NA,NA",
        "c,r,d,B B.O,431001,B.O,Delivery,AURANGABAD,BIHAR,NA,NA",
        "c,r,d,C B.O,431001,B.O,Delivery,AURANGABAD,BIHAR,NA,NA",
      ),
    );
    expect(result.records[0]?.stateCode).toBe("br");
    expect(result.records[0]?.localities.map((l) => l.slug)).toEqual(["b", "c"]);
  });

  it("breaks a tie between districts by slug", () => {
    const result = parseIndiaPostCsv(
      csv("c,r,d,A B.O,421302,B.O,Delivery,THANE,MAHARASHTRA,NA,NA", "c,r,d,B B.O,421302,B.O,Delivery,PALGHAR,MAHARASHTRA,NA,NA"),
    );
    expect(result.records[0]?.districtSlug).toBe("palghar");
  });

  it("treats a dot as a word boundary when title-casing a district", () => {
    const result = parseIndiaPostCsv(csv("c,r,d,Fort S.O,516001,S.O,Delivery,Y.S.R. KADAPA,ANDHRA PRADESH,NA,NA"));
    expect(result.records[0]?.districtName).toBe("Y.S.R. Kadapa");
  });
});

describe("splitCsvLine", () => {
  it("splits on commas outside quotes only", () => {
    expect(splitCsvLine('a,"b,c",,"d ""e"""')).toEqual(["a", "b,c", "", 'd "e"']);
  });
});
