"use client";

import { useState } from "react";
import type { ToolCallEvent } from "@/lib/parser";
import { relativeToCwd } from "@/lib/metrics";
import { formatDuration, pluralize } from "@/lib/format";
import { EditDiff } from "./edit-diff";
import { AlertIcon, CheckIcon, ChevronIcon, ClockIcon, FileIcon, TerminalIcon } from "./icons";

const OUTPUT_PREVIEW_CHARS = 12_000;

function str(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === "string" ? value : null;
}

/** One-line description of what the call does, shown in the card header. */
export function summarizeToolCall(call: ToolCallEvent, cwd: string | null): string {
  const { input } = call;
  const path = str(input, "file_path") ?? str(input, "notebook_path") ?? str(input, "path");
  switch (call.name) {
    case "Bash":
      return str(input, "description") ?? str(input, "command") ?? "";
    case "Read":
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
      return path ? relativeToCwd(path, cwd) : "";
    case "Grep":
    case "Glob":
      return str(input, "pattern") ?? "";
    case "WebFetch":
      return str(input, "url") ?? "";
    case "WebSearch":
      return str(input, "query") ?? "";
    case "Agent":
    case "Task":
      return str(input, "description") ?? "";
    default: {
      const first = Object.values(input).find((value) => typeof value === "string");
      return typeof first === "string" ? first : "";
    }
  }
}

function CodeBlock({ children, className = "" }: { children: string; className?: string }) {
  return (
    <pre
      className={`max-h-80 overflow-auto rounded-md border border-line bg-panel-2 px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap break-words ${className}`}
    >
      {children}
    </pre>
  );
}

function ToolInput({ call, cwd }: { call: ToolCallEvent; cwd: string | null }) {
  const { input } = call;

  if (call.name === "Bash" && str(input, "command") !== null) {
    return <CodeBlock>{`$ ${str(input, "command")}`}</CodeBlock>;
  }

  if (call.name === "Edit" && str(input, "old_string") !== null && str(input, "new_string") !== null) {
    const path = str(input, "file_path");
    return (
      <EditDiff
        oldText={str(input, "old_string") ?? ""}
        newText={str(input, "new_string") ?? ""}
        label={`${path ? relativeToCwd(path, cwd) : "edit"}${input.replace_all === true ? " (replace all)" : ""}`}
      />
    );
  }

  if (call.name === "MultiEdit" && Array.isArray(input.edits)) {
    return (
      <div className="space-y-2">
        {input.edits.map((edit, i) => {
          const e = (edit ?? {}) as Record<string, unknown>;
          return (
            <EditDiff
              key={i}
              oldText={typeof e.old_string === "string" ? e.old_string : ""}
              newText={typeof e.new_string === "string" ? e.new_string : ""}
              label={`edit ${i + 1} of ${input.edits instanceof Array ? input.edits.length : 0}`}
            />
          );
        })}
      </div>
    );
  }

  if (call.name === "Write" && str(input, "content") !== null) {
    const content = str(input, "content") ?? "";
    return (
      <details className="group rounded-md border border-line">
        <summary className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-fg">
          <ChevronIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          File content · {pluralize(content.split("\n").length, "line")}
        </summary>
        <CodeBlock className="rounded-none border-0 border-t">{content}</CodeBlock>
      </details>
    );
  }

  if (call.name === "Read") {
    const extra = [
      typeof input.offset === "number" ? `offset ${input.offset}` : null,
      typeof input.limit === "number" ? `limit ${input.limit}` : null,
    ].filter(Boolean);
    return extra.length ? <p className="font-mono text-xs text-muted">{extra.join(", ")}</p> : null;
  }

  if (Object.keys(input).length === 0) return null;
  return <CodeBlock>{JSON.stringify(input, null, 2)}</CodeBlock>;
}

function ToolOutput({ call }: { call: ToolCallEvent }) {
  const [showAll, setShowAll] = useState(false);
  const result = call.result;
  if (!result) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-warn">
        <ClockIcon className="h-3.5 w-3.5" /> No result recorded (interrupted or session ended).
      </p>
    );
  }

  const text = result.text;
  const lines = text === "" ? 0 : text.split("\n").length;
  const long = text.length > OUTPUT_PREVIEW_CHARS;
  const shown = long && !showAll ? text.slice(0, OUTPUT_PREVIEW_CHARS) : text;

  return (
    <details className="group" open={result.isError}>
      <summary
        className={`flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:text-fg ${result.isError ? "text-danger" : "text-muted"}`}
      >
        <ChevronIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        {result.isError ? "Error output" : "Output"} · {lines === 0 ? "empty" : pluralize(lines, "line")}
      </summary>
      <div className="mt-1.5">
        {text === "" ? (
          <p className="px-1 text-xs text-subtle">(no output)</p>
        ) : (
          <CodeBlock className={result.isError ? "border-danger/40 bg-danger-soft" : ""}>{shown}</CodeBlock>
        )}
        {long && (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="mt-1 text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {showAll ? "Show less" : `Show all ${text.length.toLocaleString("en-US")} characters`}
          </button>
        )}
      </div>
    </details>
  );
}

export function ToolCallCard({ call, cwd }: { call: ToolCallEvent; cwd: string | null }) {
  const isError = call.result?.isError === true;
  const pending = call.result === null;
  const summary = summarizeToolCall(call, cwd);
  const isFileTool = ["Read", "Edit", "MultiEdit", "Write", "NotebookEdit"].includes(call.name);

  return (
    <div
      className={`rounded-lg border bg-panel ${isError ? "border-danger/50" : "border-line"}`}
      data-testid="tool-call"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        {isFileTool ? (
          <FileIcon className="h-3.5 w-3.5 shrink-0 text-subtle" />
        ) : (
          <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-subtle" />
        )}
        <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-xs font-medium text-fg">{call.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={summary}>
          {summary}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-subtle">
          {call.durationMs !== null && <span title="Time until the result was recorded">{formatDuration(call.durationMs)}</span>}
          {isError ? (
            <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.5 font-medium text-danger">
              <AlertIcon className="h-3 w-3" /> error
            </span>
          ) : pending ? (
            <span className="inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 py-0.5 font-medium text-warn">
              <ClockIcon className="h-3 w-3" /> no result
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckIcon className="h-3 w-3" />
              <span className="sr-only">succeeded</span>
            </span>
          )}
        </span>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <ToolInput call={call} cwd={cwd} />
        <ToolOutput call={call} />
      </div>
    </div>
  );
}
