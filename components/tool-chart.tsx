"use client";

import type { ToolStat } from "@/lib/metrics";
import { AlertIcon } from "./icons";

interface ToolChartProps {
  tools: ToolStat[];
  selected: string[];
  onToggle: (name: string) => void;
}

/**
 * Horizontal bar chart of tool calls by tool. Single series, so one hue and
 * direct value labels instead of a legend. Each row is a toggle for the tool filter.
 */
export function ToolChart({ tools, selected, onToggle }: ToolChartProps) {
  if (tools.length === 0) return <p className="text-sm text-muted">No tool calls.</p>;
  const max = Math.max(...tools.map((tool) => tool.calls));

  return (
    <ul className="space-y-0.5" aria-label="Tool calls by tool. Select a tool to filter the timeline.">
      {tools.map((tool) => {
        const active = selected.includes(tool.name);
        const dimmed = selected.length > 0 && !active;
        const width = `${Math.max(4, (tool.calls / max) * 100)}%`;
        const label = `${tool.name}: ${tool.calls} ${tool.calls === 1 ? "call" : "calls"}${tool.errors ? `, ${tool.errors} failed` : ""}`;
        return (
          <li key={tool.name}>
            <button
              type="button"
              onClick={() => onToggle(tool.name)}
              aria-pressed={active}
              title={label}
              className={`group grid w-full grid-cols-[6.5rem_1fr_auto] items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-accent ${active ? "bg-accent-soft" : ""}`}
            >
              <span className={`truncate font-mono ${dimmed ? "text-subtle" : "text-fg"}`}>{tool.name}</span>
              <span className="relative h-2" aria-hidden="true">
                <span
                  className={`absolute inset-y-0 left-0 rounded-r-[4px] ${dimmed ? "bg-line-strong" : "bg-accent"}`}
                  style={{ width }}
                />
              </span>
              <span className="flex items-center gap-1.5 tabular-nums text-muted">
                {tool.calls}
                {tool.errors > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-danger">
                    <AlertIcon className="h-3 w-3" />
                    {tool.errors}
                  </span>
                )}
              </span>
              <span className="sr-only">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
