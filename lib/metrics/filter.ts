import type { TimelineEvent } from "@/lib/parser";

export interface TimelineFilter {
  /** Tool names to show. Empty means no tool filter. */
  tools: string[];
  errorsOnly: boolean;
  query: string;
}

export const EMPTY_FILTER: TimelineFilter = { tools: [], errorsOnly: false, query: "" };

export function isFilterActive(filter: TimelineFilter): boolean {
  return filter.tools.length > 0 || filter.errorsOnly || filter.query.trim() !== "";
}

function searchableText(event: TimelineEvent): string {
  switch (event.kind) {
    case "tool_call":
      return [event.name, JSON.stringify(event.input), event.result?.text ?? ""].join("\n");
    case "system":
      return [event.subtype ?? "", event.text].join("\n");
    default:
      return event.text;
  }
}

function isError(event: TimelineEvent): boolean {
  if (event.kind === "tool_call") return event.result?.isError === true;
  if (event.kind === "system") return event.level === "error";
  return false;
}

/** Applies all active filters (AND). Pure; returns a new array. */
export function filterEvents(events: TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
  const tools = new Set(filter.tools);
  const query = filter.query.trim().toLowerCase();

  return events.filter((event) => {
    if (tools.size > 0 && !(event.kind === "tool_call" && tools.has(event.name))) return false;
    if (filter.errorsOnly && !isError(event)) return false;
    if (query !== "" && !searchableText(event).toLowerCase().includes(query)) return false;
    return true;
  });
}
