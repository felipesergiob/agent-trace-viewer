import "server-only";

export const DEFAULT_REVIEW_MODEL = "claude-sonnet-5-5";

export interface ReviewConfig {
  enabled: boolean;
  model: string;
  /** Server-side refusal fallback (`fallbacks: "default"`). Disable with ANTHROPIC_FALLBACKS=off. */
  fallbacks: boolean;
  effort: "low" | "medium" | "high" | "xhigh" | "max" | null;
}

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export function getReviewConfig(env: NodeJS.ProcessEnv = process.env): ReviewConfig {
  const effort = env.ANTHROPIC_EFFORT?.trim();
  return {
    enabled: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_REVIEW_MODEL,
    fallbacks: env.ANTHROPIC_FALLBACKS?.trim().toLowerCase() !== "off",
    effort: effort && EFFORTS.has(effort) ? (effort as ReviewConfig["effort"]) : null,
  };
}
