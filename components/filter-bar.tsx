"use client";

import type { TimelineFilter } from "@/lib/metrics";
import { isFilterActive } from "@/lib/metrics";
import { AlertIcon, SearchIcon, XIcon } from "./icons";

interface FilterBarProps {
  filter: TimelineFilter;
  toolNames: string[];
  onChange: (filter: TimelineFilter) => void;
  shown: number;
  total: number;
}

const chip =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-accent";

export function FilterBar({ filter, toolNames, onChange, shown, total }: FilterBarProps) {
  const toggleTool = (name: string) =>
    onChange({
      ...filter,
      tools: filter.tools.includes(name) ? filter.tools.filter((t) => t !== name) : [...filter.tools, name],
    });

  return (
    <div className="space-y-2" role="search" aria-label="Filter timeline">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search events</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={filter.query}
            onChange={(e) => onChange({ ...filter, query: e.target.value })}
            placeholder="Search prompts, commands, output…"
            className="h-8 w-full rounded-md border border-line bg-panel pr-2 pl-8 text-sm placeholder:text-subtle focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="button"
          aria-pressed={filter.errorsOnly}
          onClick={() => onChange({ ...filter, errorsOnly: !filter.errorsOnly })}
          className={`${chip} h-8 ${filter.errorsOnly ? "border-danger/50 bg-danger-soft text-danger" : "border-line bg-panel text-muted hover:text-fg"}`}
        >
          <AlertIcon className="h-3.5 w-3.5" /> Errors only
        </button>
        {isFilterActive(filter) && (
          <button
            type="button"
            onClick={() => onChange({ tools: [], errorsOnly: false, query: "" })}
            className={`${chip} h-8 border-transparent text-muted hover:text-fg`}
          >
            <XIcon className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
      {toolNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tool">
          {toolNames.map((name) => {
            const active = filter.tools.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTool(name)}
                className={`${chip} font-mono ${active ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-muted hover:text-fg"}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-subtle" aria-live="polite">
        {isFilterActive(filter) ? `${shown} of ${total} events` : `${total} events`}
      </p>
    </div>
  );
}
