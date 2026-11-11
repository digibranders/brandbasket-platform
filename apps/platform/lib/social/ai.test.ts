import { describe, expect, it } from "vitest";
import { GENERAL_AI_ERROR, jobIsActive, jobLine, readBatches, readFacts, readJob, readJobs, readPosters, wordsForCode } from "./ai";

const job = { id: "job_1", kind: "write", state: "running", step: 2, createdAt: "2026-11-11T10:00:00Z" };

describe("jobs", () => {
  it("reads a started job and whether it was new", () => {
    expect(readJob({ job, created: true })).toEqual({ job, created: true });
    expect(readJob({ job, created: false })?.created).toBe(false);
    expect(readJob({ job: { id: 1 } })).toBeNull();
    expect(readJob(null)).toBeNull();
  });

  it("keeps the jobs that read as jobs and drops the rest", () => {
    expect(readJobs({ jobs: [job, { nope: true }, { ...job, id: "job_2", state: "done" }] }).map((j) => j.id)).toEqual(["job_1", "job_2"]);
    expect(readJobs({})).toEqual([]);
  });

  it("says in plain words where a job is, and knows when to keep asking", () => {
    expect(jobLine({ kind: "write", state: "running", step: 1 })).toBe("Reading your website");
    expect(jobLine({ kind: "write", state: "running", step: 2 })).toBe("Writing your posts");
    expect(jobLine({ kind: "draw", state: "running", step: undefined })).toBe("Drawing your pictures");
    expect(jobLine({ kind: "write", state: "queued", step: undefined })).toBe("Waiting to start.");
    expect(jobLine({ kind: "write", state: "done", step: undefined })).toMatch(/ready to look at/);
    expect(jobLine({ kind: "draw", state: "failed", step: undefined })).toMatch(/could not be drawn/);
    expect(jobIsActive({ state: "queued" })).toBe(true);
    expect(jobIsActive({ state: "running" })).toBe(true);
    expect(jobIsActive({ state: "done" })).toBe(false);
    expect(jobIsActive({ state: "failed" })).toBe(false);
  });
});

describe("facts", () => {
  const body = {
    builtAt: "2026-11-11T10:00:00Z",
    profile: { name: "Om Sweets", tone: ["warm", "plain words"] },
    facts: [
      { id: "f1", text: "Free delivery above Rs 999", sourceUrl: "https://omsweets.in/delivery", sourceQuote: "Free delivery", state: "suggested", held: false },
      { id: "f2", text: "Winner of an award", state: "suggested", held: true },
      { id: 3 },
    ],
    counts: { suggested: 2 },
  };

  it("reads the facts, the name and the tone, and skips an entry it cannot read", () => {
    const facts = readFacts(body);
    expect(facts?.name).toBe("Om Sweets");
    expect(facts?.tone).toEqual(["warm", "plain words"]);
    expect(facts?.facts.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(facts?.facts[1]?.held).toBe(true);
  });

  it("accepts a tone that is one sentence, and no profile at all", () => {
    expect(readFacts({ ...body, profile: { tone: "warm and plain" } })?.tone).toEqual(["warm and plain"]);
    expect(readFacts({ facts: [] })).toEqual({ builtAt: null, name: null, tone: [], facts: [] });
    expect(readFacts("nope")).toBeNull();
  });
});

describe("written posts", () => {
  const body = {
    batches: [
      {
        id: "week-05",
        createdAt: "2026-11-11T10:00:00Z",
        networks: ["instagram", "linkedin", "twitter"],
        posts: [
          { id: "p1", headline: "Diwali boxes", caption: "Main words", captions: { instagram: { text: "Short" }, linkedin: "Longer words" }, state: "pending", advice: "weak headline" },
          { id: "p2", headline: "Delivery", caption: "Main two", state: "kept", edited: true },
          { bad: true },
        ],
      },
      { id: 4 },
    ],
  };

  it("reads each network's words, falling back to the main caption, and skips what it cannot read", () => {
    const [batch] = readBatches(body);
    expect(readBatches(body)).toHaveLength(1);
    expect(batch?.networks).toEqual(["instagram", "linkedin"]);
    expect(batch?.posts).toHaveLength(2);
    expect(batch?.posts[0]?.captions).toEqual({ instagram: "Short", linkedin: "Longer words" });
    expect(batch?.posts[0]?.advice).toBe("weak headline");
    expect(batch?.posts[1]).toMatchObject({ captions: { instagram: "Main two", linkedin: "Main two" }, edited: true, advice: null, state: "kept" });
  });

  it("reads each network's caption rule, and leaves out one it cannot read", () => {
    const [batch] = readBatches({ ...body, networkRules: { instagram: { maxCaption: 600, recommendedMin: 100, recommendedMax: 300, maxHashtags: 5 }, linkedin: { maxCaption: "long" }, facebook: { maxCaption: 600 } } });
    expect(batch?.rules.instagram).toEqual({ maxCaption: 600, recommendedMin: 100, recommendedMax: 300, maxHashtags: 5 });
    expect(batch?.rules.linkedin).toBeUndefined();
    expect(batch?.rules.facebook).toEqual({ maxCaption: 600, recommendedMin: null, recommendedMax: null, maxHashtags: null });
    expect(readBatches(body)[0]?.rules).toEqual({});
  });

  it("reads nothing from an answer that is not batches", () => {
    expect(readBatches({})).toEqual([]);
    expect(readBatches(null)).toEqual([]);
  });
});

describe("pictures", () => {
  const poster = { id: "v1", batchId: "week-05", postId: "p1", network: "instagram", shape: "square", width: 1024, height: 1024, headline: "Diwali boxes", caption: "Short", versionNumber: 1, status: "pending", canRedraw: true, redrawsLeft: 1, createdAt: "2026-11-11T10:00:00Z" };

  it("reads the pictures and the reasons, and drops a picture for a network it does not know", () => {
    const read = readPosters({ posters: [poster, { ...poster, id: "v2", network: "myspace" }, { ...poster, id: "v3", status: "blocked", notice: "Did not pass" }], reasons: ["weak_copy", 3, "style"] });
    expect(read.posters.map((p) => p.id)).toEqual(["v1", "v3"]);
    expect(read.posters[1]?.notice).toBe("Did not pass");
    expect(read.reasons).toEqual(["weak_copy", "style"]);
  });
});

describe("the customer's words for an error", () => {
  it("has its own sentence for each code the customer can meet, and a general one for the rest", () => {
    expect(wordsForCode("SITE_MISMATCH")).toMatch(/first/);
    expect(wordsForCode("JOB_LIMIT_REACHED")).toMatch(/tomorrow/);
    expect(wordsForCode("BATCH_LOCKED")).toMatch(/final/);
    expect(wordsForCode("SOMETHING_NEW")).toBe(GENERAL_AI_ERROR);
    expect(wordsForCode(null)).toBe(GENERAL_AI_ERROR);
  });

  it("never uses a dash in the copy", () => {
    for (const code of ["INVALID_SITE", "SITE_MISMATCH", "INVALID_NETWORKS", "JOB_LIMIT_REACHED", "DRAW_LIMIT_REACHED", "NOTHING_KEPT", "BATCH_LOCKED", "WORDS_NOT_ACCEPTED", "FACT_HELD", "POSTER_SUPERSEDED", "POSTER_BLOCKED", "REDRAW_LIMIT_REACHED", "ENGINE_UNAVAILABLE", "SERVICE_UNAVAILABLE"]) {
      expect(wordsForCode(code)).not.toMatch(/[–—]/);
    }
    expect(jobLine({ kind: "write", state: "failed", step: undefined })).not.toMatch(/[–—]/);
  });
});

describe("which pictures are the same drawing", () => {
  const base = { id: "v1", batchId: "b", postId: "p", network: "facebook", shape: "square", width: 1, height: 1, headline: "H", caption: "C", versionNumber: 1, status: "pending", canRedraw: true, redrawsLeft: 1, createdAt: "x" };

  it("reads which other networks share a picture, and works without the field", () => {
    expect(readPosters({ posters: [{ ...base, sharedWith: ["instagram", "google"] }] }).posters[0]?.sharedWith).toEqual(["instagram", "google"]);
    expect(readPosters({ posters: [base] }).posters[0]?.sharedWith).toBeUndefined();
  });

  it("drops a picture whose sharing is not a list of networks, rather than showing a wrong hint", () => {
    expect(readPosters({ posters: [{ ...base, sharedWith: ["tiktok"] }] }).posters).toEqual([]);
  });
});
