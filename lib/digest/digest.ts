import type { ParsedSession, TimelineEvent, ToolCallEvent } from "@/lib/parser";
import { computeMetrics, relativeToCwd } from "@/lib/metrics";
import { formatDuration, truncate } from "@/lib/format";
import { redact } from "./redact";

/**
 * Builds the compact text digest that the "Review this run" feature sends to
 * the model. Runs in the browser so the user can inspect the exact payload;
 * the server re-applies redaction before forwarding it.
 */

export const MAX_DIGEST_CHARS = 120_000;

const LIMITS = {
  firstPrompt: 4000,
  prompt: 1500,
  assistantText: 800,
  finalAssistantText: 3000,
  toolInput: 500,
  editSnippet: 300,
  toolResult: 600,
  toolErrorResult: 1200,
  systemNote: 300,
};

export interface Digest {
  text: string;
  /** stepIds[n - 1] is the timeline event id of digest step [n]. */
  stepIds: string[];
  omittedSteps: number;
  redactions: number;
}

function basename(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

function describeToolInput(call: ToolCallEvent, cwd: string | null): string {
  const input = call.input;
  const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : null);
  const path = str("file_path") ?? str("notebook_path");
  const shownPath = path ? relativeToCwd(path, cwd) : null;

  switch (call.name) {
    case "Bash":
      return truncate(str("command") ?? JSON.stringify(input), LIMITS.toolInput);
    case "Edit":
      return [
        `file: ${shownPath ?? "?"}`,
        `old: ${truncate(str("old_string") ?? "", LIMITS.editSnippet)}`,
        `new: ${truncate(str("new_string") ?? "", LIMITS.editSnippet)}`,
      ].join("\n    ");
    case "Write": {
      const content = str("content") ?? "";
      return `file: ${shownPath ?? "?"} (${content.length} chars)\n    ${truncate(content, LIMITS.editSnippet)}`;
    }
    case "Read":
      return `file: ${shownPath ?? JSON.stringify(input)}`;
    default:
      return truncate(JSON.stringify(input), LIMITS.toolInput);
  }
}

function indent(text: string): string {
  return text.replace(/\n/g, "\n    ");
}

function renderStep(
  event: TimelineEvent,
  step: number,
  cwd: string | null,
  isFirstPrompt: boolean,
  isFinalText: boolean,
): string | null {
  switch (event.kind) {
    case "user":
      if (event.isMeta) return null;
      return `[${step}] USER: ${indent(truncate(event.text, isFirstPrompt ? LIMITS.firstPrompt : LIMITS.prompt))}`;
    case "assistant_text":
      return `[${step}] ASSISTANT: ${indent(
        truncate(event.text, isFinalText ? LIMITS.finalAssistantText : LIMITS.assistantText),
      )}`;
    case "thinking":
      return null;
    case "system":
      if (event.level !== "error" && event.level !== "warning") return null;
      return `[${step}] SYSTEM ${event.level}: ${indent(truncate(event.text, LIMITS.systemNote))}`;
    case "tool_call": {
      const head = `[${step}] TOOL ${event.name}: ${indent(describeToolInput(event, cwd))}`;
      if (!event.result) return `${head}\n    -> (no result recorded)`;
      const label = event.result.isError ? "ERROR" : "result";
      const limit = event.result.isError ? LIMITS.toolErrorResult : LIMITS.toolResult;
      const body = event.result.text.trim() === "" ? "(empty)" : truncate(event.result.text.trim(), limit);
      return `${head}\n    -> ${label}: ${indent(body)}`;
    }
  }
}

export function buildDigest(session: ParsedSession, maxChars = MAX_DIGEST_CHARS): Digest {
  const metrics = computeMetrics(session);
  const cwd = session.meta.cwd;

  const firstPromptId = session.events.find((e) => e.kind === "user" && !e.isMeta)?.id;
  const lastTextId = [...session.events].reverse().find((e) => e.kind === "assistant_text")?.id;

  const steps: { id: string; text: string }[] = [];
  for (const event of session.events) {
    const text = renderStep(event, steps.length + 1, cwd, event.id === firstPromptId, event.id === lastTextId);
    if (text !== null) steps.push({ id: event.id, text });
  }

  const header = [
    "# Claude Code session digest (redacted, truncated)",
    `project: ${basename(cwd) ?? "unknown"}`,
    session.meta.gitBranch ? `branch: ${session.meta.gitBranch}` : null,
    `models: ${session.meta.models.join(", ") || "unknown"}`,
    `duration: ${formatDuration(metrics.durationMs)}, turns: ${metrics.turns}, tool calls: ${metrics.toolCalls} (${metrics.toolErrors} errors)`,
    `tools: ${metrics.tools.map((t) => `${t.name} x${t.calls}${t.errors ? ` (${t.errors} failed)` : ""}`).join(", ") || "none"}`,
    `files modified: ${metrics.filesTouched.map((f) => f.displayPath).join(", ") || "none"}`,
    "",
    "## Steps",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  // Fit within budget: keep the beginning (task framing) and the end (final claims).
  let kept = steps;
  let omitted = 0;
  const total = (list: { text: string }[]) => list.reduce((sum, s) => sum + s.text.length + 1, header.length);
  if (total(steps) > maxChars) {
    const headBudget = Math.floor((maxChars - header.length) * 0.4);
    const tailBudget = maxChars - header.length - headBudget - 200;
    const head: typeof steps = [];
    let used = 0;
    for (const s of steps) {
      if (used + s.text.length + 1 > headBudget) break;
      head.push(s);
      used += s.text.length + 1;
    }
    const tail: typeof steps = [];
    used = 0;
    for (let i = steps.length - 1; i >= head.length; i--) {
      const s = steps[i];
      if (used + s.text.length + 1 > tailBudget) break;
      tail.unshift(s);
      used += s.text.length + 1;
    }
    omitted = steps.length - head.length - tail.length;
    kept = [...head, { id: "", text: `[... ${omitted} steps omitted to fit the size limit ...]` }, ...tail];
  }

  const { text, counts } = redact([header, ...kept.map((s) => s.text)].join("\n"));
  return {
    text,
    stepIds: steps.map((s) => s.id),
    omittedSteps: omitted,
    redactions: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}
