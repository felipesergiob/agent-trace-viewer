import type { TokenUsage } from "@/lib/parser";

/**
 * List prices in USD per million tokens. Used only for an estimate shown in
 * the UI; update when prices change. Cache writes are priced as multiples of
 * the input price (1.25x for 5-minute TTL, 2x for 1-hour TTL).
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
}

export const PRICES_AS_OF = "2026-10";

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

const CACHE_WRITE_5M_MULTIPLIER = 1.25;
const CACHE_WRITE_1H_MULTIPLIER = 2;

/**
 * Maps provider-specific or dated ids to the base model id:
 * `us.anthropic.claude-opus-4-6`, `claude-sonnet-4-5-20250929`, `claude-opus-4-6[1m]`.
 */
export function normalizeModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/^(?:[a-z]{2}\.)?anthropic\./, "")
    .replace(/\[[^\]]*\]$/, "")
    .replace(/-v\d+(?::\d+)?$/, "")
    .replace(/[-@]\d{8}$/, "");
}

export function priceFor(model: string): ModelPrice | null {
  return MODEL_PRICES[normalizeModelId(model)] ?? null;
}

export function costOf(usage: TokenUsage, price: ModelPrice): number {
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.inputTokens * perToken(price.input) +
    usage.outputTokens * perToken(price.output) +
    usage.cacheReadTokens * perToken(price.cacheRead) +
    usage.cacheWrite5mTokens * perToken(price.input * CACHE_WRITE_5M_MULTIPLIER) +
    usage.cacheWrite1hTokens * perToken(price.input * CACHE_WRITE_1H_MULTIPLIER)
  );
}
