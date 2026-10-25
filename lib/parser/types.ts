/**
 * Domain model produced by the parser. UI and metrics depend only on these
 * types, never on the raw JSONL shape.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Cache writes with a 5-minute TTL (or unspecified TTL). */
  cacheWrite5mTokens: number;
  /** Cache writes with a 1-hour TTL. */
  cacheWrite1hTokens: number;
}

/** One API response. Claude Code writes one JSONL line per content block, so
 * several lines can share a message id; usage is recorded once per message. */
export interface AssistantMessage {
  messageId: string;
  model: string | null;
  usage: TokenUsage | null;
  timestamp: string | null;
}

export interface ToolResult {
  timestamp: string | null;
  text: string;
  isError: boolean;
}

interface BaseEvent {
  /** Stable id for React keys and anchors. */
  id: string;
  /** Zero-based line number in the source file. */
  line: number;
  timestamp: string | null;
  /** Index of the turn (user prompt) this event belongs to; -1 before the first prompt. */
  turn: number;
}

export interface UserPromptEvent extends BaseEvent {
  kind: "user";
  text: string;
  /** Injected context (slash command output, skill text, reminders) rather than a typed prompt. */
  isMeta: boolean;
}

export interface AssistantTextEvent extends BaseEvent {
  kind: "assistant_text";
  text: string;
  model: string | null;
  messageId: string | null;
}

export interface ThinkingEvent extends BaseEvent {
  kind: "thinking";
  text: string;
  messageId: string | null;
}

export interface ToolCallEvent extends BaseEvent {
  kind: "tool_call";
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  messageId: string | null;
  /** Filled in when the matching tool_result line is found. */
  result: ToolResult | null;
  /** Time between the call and its result, if both timestamps exist. */
  durationMs: number | null;
}

export interface SystemEvent extends BaseEvent {
  kind: "system";
  subtype: string | null;
  text: string;
  level: string | null;
}

export type TimelineEvent =
  | UserPromptEvent
  | AssistantTextEvent
  | ThinkingEvent
  | ToolCallEvent
  | SystemEvent;

export type EventKind = TimelineEvent["kind"];

export interface SkippedLine {
  line: number;
  reason: string;
}

export interface ParseStats {
  totalLines: number;
  parsedLines: number;
  /** Lines that were not valid JSON or failed schema validation. */
  skipped: SkippedLine[];
  /** Well-formed lines of types the viewer does not display, by type. */
  ignoredByType: Record<string, number>;
  /** tool_result blocks whose tool_use was never seen. */
  orphanToolResults: number;
}

export interface SessionMeta {
  sessionId: string | null;
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  models: string[];
}

export interface ParsedSession {
  meta: SessionMeta;
  events: TimelineEvent[];
  assistantMessages: AssistantMessage[];
  stats: ParseStats;
}
