import { describe, expect, it } from "vitest";
import {
  firstUnanswered,
  intakeServicesOf,
  INTAKE_QUESTIONS,
  NO_ANSWERS,
  questionAfter,
  questionBefore,
  questionPosition,
  summaryRows,
  unansweredCount,
  visibleQuestions,
  type IntakeAnswers,
} from "./questions";

const fields = (services: Parameters<typeof visibleQuestions>[0], answers: IntakeAnswers = NO_ANSWERS) => visibleQuestions(services, answers).map((question) => question.field);
const clinic: IntakeAnswers = { ...NO_ANSWERS, businessType: "clinic" };

describe("which questions are asked", () => {
  it("asks only the common ones for the first services, until the kind of business is known", () => {
    expect(fields([])).toEqual(["businessType", "primaryGoal"]);
  });

  it("asks the kind of practice once the business has a kind with options, and not for 'something else'", () => {
    expect(fields([], clinic)).toEqual(["businessType", "businessSubtype", "primaryGoal"]);
    expect(fields([], { ...NO_ANSWERS, businessType: "other" })).toEqual(["businessType", "primaryGoal"]);
  });

  it("asks the website questions only when the website was chosen", () => {
    expect(fields(["website"])).toEqual(["businessType", "primaryGoal", "websiteState", "primaryAction", "designDirection"]);
    expect(fields(["social"])).toEqual(["businessType", "primaryGoal", "socialChannels"]);
    expect(fields(["search"])).toEqual(["businessType", "primaryGoal", "searchScope"]);
  });

  it("asks for the current website's address only when there is one", () => {
    expect(fields(["website"], { ...NO_ANSWERS, websiteState: "no_site" })).not.toContain("existingWebsiteUrl");
    expect(fields(["website"], { ...NO_ANSWERS, websiteState: "replace" })).toContain("existingWebsiteUrl");
    expect(fields(["website"], { ...NO_ANSWERS, websiteState: "improve" })).toContain("existingWebsiteUrl");
  });

  it("merges a bundle into one list with each question once, in a fixed order", () => {
    const all = fields(["website", "social", "search"], { ...clinic, websiteState: "improve" });
    expect(all).toEqual(["businessType", "businessSubtype", "primaryGoal", "websiteState", "existingWebsiteUrl", "primaryAction", "designDirection", "socialChannels", "searchScope"]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("gives every single and multi question an honest way out or a recommendation, apart from the list of kinds and the look", () => {
    for (const question of INTAKE_QUESTIONS.filter((entry) => entry.kind !== "url" && entry.field !== "businessType" && entry.field !== "businessSubtype")) {
      const values = question.options(clinic).map((option) => option.value);
      expect(values.some((value) => ["unsure", "recommend", "let_us_decide"].includes(value)), question.field).toBe(true);
    }
  });
});

describe("where the customer is", () => {
  const services = ["website"] as const;

  it("finds the first question without an answer, and ignores the optional address", () => {
    expect(firstUnanswered(services, NO_ANSWERS)?.field).toBe("businessType");
    const answered = { ...NO_ANSWERS, businessType: "salon", businessSubtype: "hair_salon", primaryGoal: "be_found", websiteState: "replace" };
    expect(firstUnanswered(services, answered)?.field).toBe("primaryAction");
    expect(unansweredCount(services, answered)).toBe(2);
    expect(firstUnanswered(services, { ...answered, primaryAction: "call", designDirection: "warm_friendly" })).toBeNull();
  });

  it("steps forward and back through the questions asked, and ends at the summary", () => {
    expect(questionAfter(services, NO_ANSWERS, "businessType")?.field).toBe("primaryGoal");
    expect(questionAfter(services, NO_ANSWERS, "designDirection")).toBeNull();
    expect(questionBefore(services, NO_ANSWERS, "primaryGoal")?.field).toBe("businessType");
    expect(questionBefore(services, NO_ANSWERS, "businessType")).toBeNull();
  });

  it("says 'Question n of total', counting only the questions that apply", () => {
    expect(questionPosition(services, NO_ANSWERS, "primaryAction")).toEqual({ number: 4, total: 5 });
    expect(questionPosition(["website", "search"], clinic, "searchScope")).toEqual({ number: 7, total: 7 });
  });
});

describe("summaryRows", () => {
  it("words each answer, and leaves a question not answered empty", () => {
    const rows = summaryRows(["social"], { ...clinic, businessSubtype: "dental", socialChannels: ["instagram", "facebook"] });
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ["Business", "Clinic, dental or medical practice"],
      ["Kind of business", "Dental"],
      ["Main priority", null],
      ["Social focus", "Instagram, Facebook"],
    ]);
  });
});

describe("intakeServicesOf", () => {
  it("names the intake's services for the catalogue ids a basket holds, and drops what it does not know", () => {
    expect(intakeServicesOf(["managed-website", "local-seo-aeo", "gold-plating"])).toEqual(["website", "search"]);
    expect(intakeServicesOf([])).toEqual([]);
  });
});
