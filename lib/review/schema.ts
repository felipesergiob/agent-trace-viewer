import { z } from "zod";

/**
 * Structured review returned by the model. Used both as the structured-output
 * format sent to the API and to validate the response before it reaches the UI.
 * Shared by server and client (types only on the client).
 */
export const ReviewSchema = z.object({
  summary: z.string().describe("One or two sentences: what was asked and what the agent did."),
  task_completed: z
    .enum(["yes", "partial", "no", "unclear"])
    .describe("Whether the user's request was actually completed, based on evidence in the digest."),
  completion_rationale: z.string().describe("Why, citing step numbers like [12]."),
  unverified_claims: z
    .array(
      z.object({
        claim: z.string().describe("A claim the agent made, quoted or closely paraphrased."),
        why_unverified: z.string().describe("What evidence is missing or contradicts it."),
        steps: z.array(z.number().int()).describe("Digest step numbers involved."),
      }),
    )
    .describe("Claims of success or correctness not backed by a tool result in the digest."),
  skipped_steps: z
    .array(
      z.object({
        step: z.string().describe("A step a careful engineer would have taken."),
        why_it_matters: z.string(),
      }),
    )
    .describe("Verification or process steps the agent skipped."),
  risky_actions: z
    .array(
      z.object({
        action: z.string(),
        severity: z.enum(["low", "medium", "high"]),
        steps: z.array(z.number().int()),
        note: z.string(),
      }),
    )
    .describe("Destructive, irreversible, security-sensitive or out-of-scope actions."),
  follow_ups: z.array(z.string()).describe("Concrete things a reviewer should check or ask for next."),
});

export type Review = z.infer<typeof ReviewSchema>;

export const ReviewRequestSchema = z.object({
  digest: z.string().min(1).max(200_000),
});

export const ReviewResponseSchema = z.object({
  review: ReviewSchema,
  model: z.string(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
});

export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;

export const ReviewStatusSchema = z.object({
  enabled: z.boolean(),
  model: z.string(),
});

export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});
