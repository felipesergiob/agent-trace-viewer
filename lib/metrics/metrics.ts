import type { ParsedSession, TimelineEvent, TokenUsage, ToolCallEvent } from "@/lib/parser";
import { costOf, priceFor } from "./pricing";

export interface ToolStat {
  name: string;
  calls: number;
  errors: number;
}

export interface FileTouch {
  path: string;
  /** Path relative to the session cwd when it lives under it. */
  displayPath: string;
  edits: number;
  writes: number;
  failed: number;
}

export interface ModelCost {
  model: string;
  usage: TokenUsage;
  /** null when the model is not in the price table. */
  usd: number | null;
}

export interface SessionMetrics {
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  turns: number;
  assistantMessages: number;
  toolCalls: number;
  toolErrors: number;
  /** Tool calls that never received a result (interrupted or truncated session). */
  unansweredToolCalls: number;
  tools: ToolStat[];
  filesTouched: FileTouch[];
  /** null when no assistant message carried a `usage` field. */
  usage: TokenUsage | null;
  cost: {
    totalUsd: number;
    byModel: ModelCost[];
    unpricedModels: string[];
  } | null;
}

const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "NotebookEdit"]);
const WRITE_TOOLS = new Set(["Write"]);

export function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWrite5mTokens: a.cacheWrite5mTokens + b.cacheWrite5mTokens,
    cacheWrite1hTokens: a.cacheWrite1hTokens + b.cacheWrite1hTokens,
  };
}

export function totalInputTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens + usage.cacheReadTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens
  );
}

/** Returns the file path a file-modifying tool call targets, if any. */
export function fileTargetOf(call: ToolCallEvent): string | null {
  if (!EDIT_TOOLS.has(call.name) && !WRITE_TOOLS.has(call.name)) return null;
  const path = call.input.file_path ?? call.input.notebook_path;
  return typeof path === "string" && path !== "" ? path : null;
}

export function relativeToCwd(path: string, cwd: string | null): string {
  if (!cwd) return path;
  const prefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function timeRange(events: TimelineEvent[], session: ParsedSession) {
  let min: number | null = null;
  let max: number | null = null;
  const consider = (timestamp: string | null) => {
    if (!timestamp) return;
    const ms = Date.parse(timestamp);
    if (Number.isNaN(ms)) return;
    if (min === null || ms < min) min = ms;
    if (max === null || ms > max) max = ms;
  };
  for (const event of events) {
    consider(event.timestamp);
    if (event.kind === "tool_call") consider(event.result?.timestamp ?? null);
  }
  for (const message of session.assistantMessages) consider(message.timestamp);
  return { min, max } as { min: number | null; max: number | null };
}

export function computeMetrics(session: ParsedSession): SessionMetrics {
  const { events } = session;
  const toolStats = new Map<string, ToolStat>();
  const files = new Map<string, FileTouch>();
  let toolCalls = 0;
  let toolErrors = 0;
  let unanswered = 0;
  let turns = 0;

  for (const event of events) {
    if (event.kind === "user" && !event.isMeta) turns += 1;
    if (event.kind !== "tool_call") continue;

    toolCalls += 1;
    const failed = event.result?.isError === true;
    if (failed) toolErrors += 1;
    if (!event.result) unanswered += 1;

    const stat = toolStats.get(event.name) ?? { name: event.name, calls: 0, errors: 0 };
    stat.calls += 1;
    if (failed) stat.errors += 1;
    toolStats.set(event.name, stat);

    const path = fileTargetOf(event);
    if (path) {
      const touch = files.get(path) ?? {
        path,
        displayPath: relativeToCwd(path, session.meta.cwd),
        edits: 0,
        writes: 0,
        failed: 0,
      };
      if (WRITE_TOOLS.has(event.name)) touch.writes += 1;
      else touch.edits += 1;
      if (failed) touch.failed += 1;
      files.set(path, touch);
    }
  }

  const { min, max } = timeRange(events, session);

  const usageByModel = new Map<string, TokenUsage>();
  let sawUsage = false;
  for (const message of session.assistantMessages) {
    if (!message.usage) continue;
    sawUsage = true;
    const model = message.model ?? "unknown";
    usageByModel.set(model, addUsage(usageByModel.get(model) ?? emptyUsage(), message.usage));
  }

  let usage: TokenUsage | null = null;
  let cost: SessionMetrics["cost"] = null;
  if (sawUsage) {
    usage = [...usageByModel.values()].reduce(addUsage, emptyUsage());
    const byModel: ModelCost[] = [...usageByModel.entries()].map(([model, modelUsage]) => {
      const price = priceFor(model);
      return { model, usage: modelUsage, usd: price ? costOf(modelUsage, price) : null };
    });
    cost = {
      totalUsd: byModel.reduce((sum, entry) => sum + (entry.usd ?? 0), 0),
      byModel,
      unpricedModels: byModel
        .filter((entry) => entry.usd === null && totalInputTokens(entry.usage) + entry.usage.outputTokens > 0)
        .map((entry) => entry.model),
    };
  }

  return {
    startedAt: min === null ? null : new Date(min).toISOString(),
    endedAt: max === null ? null : new Date(max).toISOString(),
    durationMs: min === null || max === null ? null : max - min,
    turns,
    assistantMessages: session.assistantMessages.length,
    toolCalls,
    toolErrors,
    unansweredToolCalls: unanswered,
    tools: [...toolStats.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
    filesTouched: [...files.values()].sort(
      (a, b) => b.edits + b.writes - (a.edits + a.writes) || a.displayPath.localeCompare(b.displayPath),
    ),
    usage,
    cost,
  };
}

/** Milliseconds since the previous timestamped event, keyed by event id. */
export function gapsBetweenEvents(events: TimelineEvent[]): Map<string, number> {
  const gaps = new Map<string, number>();
  let previous: number | null = null;
  for (const event of events) {
    if (!event.timestamp) continue;
    const ms = Date.parse(event.timestamp);
    if (Number.isNaN(ms)) continue;
    if (previous !== null) gaps.set(event.id, Math.max(0, ms - previous));
    previous = ms;
  }
  return gaps;
}
