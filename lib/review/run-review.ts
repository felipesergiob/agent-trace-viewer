import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { redactText } from "@/lib/digest/redact";
import type { ReviewConfig } from "./config";
import { buildReviewUserMessage, REVIEW_SYSTEM_PROMPT } from "./prompt";
import { ReviewSchema, type ReviewResponse } from "./schema";

export class ReviewError extends Error {
  constructor(
    readonly code:
      | "not_configured"
      | "auth"
      | "rate_limited"
      | "refused"
      | "truncated"
      | "invalid_output"
      | "upstream",
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

/**
 * Sends a redacted session digest to the Claude API and returns a validated
 * structured review. Redaction is re-applied here even though the client
 * already redacted, so the server never forwards unredacted text.
 */
export async function runReview(digest: string, config: ReviewConfig): Promise<ReviewResponse> {
  if (!config.enabled) {
    throw new ReviewError("not_configured", 503, "ANTHROPIC_API_KEY is not set on the server.");
  }

  const client = new Anthropic({ timeout: 120_000, maxRetries: 2 });

  let response;
  try {
    response = await client.beta.messages.parse({
      model: config.model,
      max_tokens: 16000,
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildReviewUserMessage(redactText(digest)) }],
      output_config: {
        format: betaZodOutputFormat(ReviewSchema),
        ...(config.effort ? { effort: config.effort } : {}),
      },
      ...(config.fallbacks
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new ReviewError("auth", 502, "The Claude API rejected the API key.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ReviewError("rate_limited", 429, "Rate limited by the Claude API. Try again shortly.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new ReviewError("upstream", 502, `The Claude API rejected the request: ${error.message}`);
    }
    if (error instanceof Anthropic.APIError) {
      throw new ReviewError("upstream", 502, `Claude API error${error.status ? ` ${error.status}` : ""}.`);
    }
    // The SDK throws a plain AnthropicError when the output fails schema parsing.
    if (error instanceof Anthropic.AnthropicError) {
      throw new ReviewError("invalid_output", 502, "The model returned output that did not match the review schema.");
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new ReviewError("refused", 422, "The model declined to review this session.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ReviewError("truncated", 502, "The review was cut off before it finished.");
  }

  const validated = ReviewSchema.safeParse(response.parsed_output);
  if (!validated.success) {
    throw new ReviewError("invalid_output", 502, "The model returned output that did not match the review schema.");
  }

  return {
    review: validated.data,
    model: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
