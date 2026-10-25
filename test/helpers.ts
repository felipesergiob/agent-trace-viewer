import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readSample(name: string): string {
  return readFileSync(join(process.cwd(), "public", "samples", `${name}.jsonl`), "utf8");
}

let counter = 0;

const envelope = (timestamp: string) => ({
  uuid: `uuid-${++counter}`,
  parentUuid: null,
  timestamp,
  sessionId: "test-session",
  cwd: "/work/demo",
  gitBranch: "main",
  version: "2.0.0",
  isSidechain: false,
});

export const line = {
  user: (text: string, timestamp = "2026-01-01T00:00:00.000Z", extra: Record<string, unknown> = {}) =>
    JSON.stringify({ type: "user", ...envelope(timestamp), message: { role: "user", content: text }, ...extra }),

  assistant: (
    blocks: unknown[],
    opts: { id?: string; model?: string; usage?: Record<string, unknown>; timestamp?: string } = {},
  ) =>
    JSON.stringify({
      type: "assistant",
      ...envelope(opts.timestamp ?? "2026-01-01T00:00:01.000Z"),
      message: {
        id: opts.id ?? `msg-${++counter}`,
        model: opts.model ?? "claude-sonnet-5-5",
        role: "assistant",
        content: blocks,
        ...(opts.usage ? { usage: opts.usage } : {}),
      },
    }),

  toolResult: (toolUseId: string, content: unknown, opts: { isError?: boolean; timestamp?: string } = {}) =>
    JSON.stringify({
      type: "user",
      ...envelope(opts.timestamp ?? "2026-01-01T00:00:02.000Z"),
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content, is_error: opts.isError ?? false }],
      },
    }),
};

export const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({
  type: "tool_use",
  id,
  name,
  input,
});

export const text = (value: string) => ({ type: "text", text: value });
