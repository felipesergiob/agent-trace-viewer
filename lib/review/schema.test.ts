import { describe, expect, it } from "vitest";
import { ReviewRequestSchema, ReviewSchema } from "./schema";

const valid = {
  summary: "Asked to add rate limiting; added middleware.",
  task_completed: "partial",
  completion_rationale: "Middleware added [5] but tests never ran.",
  unverified_claims: [{ claim: "All tests pass", why_unverified: "No test command was run.", steps: [9] }],
  skipped_steps: [{ step: "Run the test suite", why_it_matters: "The user asked for it." }],
  risky_actions: [{ action: "Deleted package-lock.json", severity: "medium", steps: [3], note: "Not requested." }],
  follow_ups: ["Run npm test"],
};

describe("ReviewSchema", () => {
  it("accepts a well-formed review", () => {
    expect(ReviewSchema.parse(valid)).toEqual(valid);
  });

  it("rejects unknown verdicts and severities", () => {
    expect(ReviewSchema.safeParse({ ...valid, task_completed: "maybe" }).success).toBe(false);
    expect(
      ReviewSchema.safeParse({ ...valid, risky_actions: [{ ...valid.risky_actions[0], severity: "critical" }] }).success,
    ).toBe(false);
  });

  it("rejects missing fields and non-integer step refs", () => {
    expect(ReviewSchema.safeParse({ ...valid, summary: undefined }).success).toBe(false);
    expect(
      ReviewSchema.safeParse({ ...valid, unverified_claims: [{ ...valid.unverified_claims[0], steps: [1.5] }] }).success,
    ).toBe(false);
  });
});

describe("ReviewRequestSchema", () => {
  it("bounds digest size", () => {
    expect(ReviewRequestSchema.safeParse({ digest: "" }).success).toBe(false);
    expect(ReviewRequestSchema.safeParse({ digest: "x".repeat(200_001) }).success).toBe(false);
    expect(ReviewRequestSchema.safeParse({ digest: "ok" }).success).toBe(true);
  });
});
