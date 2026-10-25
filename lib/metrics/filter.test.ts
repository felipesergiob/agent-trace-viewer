import { describe, expect, it } from "vitest";
import { parseTranscript } from "@/lib/parser";
import { line, text, toolUse } from "@/test/helpers";
import { EMPTY_FILTER, filterEvents, isFilterActive } from "./filter";

const { events } = parseTranscript(
  [
    line.user("Please fix the parser"),
    line.assistant([text("Looking at it"), toolUse("t1", "Bash", { command: "npm test" }), toolUse("t2", "Read", { file_path: "/src/parser.ts" })]),
    line.toolResult("t1", "FAIL parser.test.ts", { isError: true }),
    line.toolResult("t2", "export function parse() {}"),
    JSON.stringify({ type: "system", content: "API Error: overloaded", level: "error", timestamp: "2026-01-01T00:00:03.000Z" }),
  ].join("\n"),
);

const kinds = (list: typeof events) => list.map((e) => (e.kind === "tool_call" ? e.name : e.kind));

describe("filterEvents", () => {
  it("returns everything with the empty filter", () => {
    expect(filterEvents(events, EMPTY_FILTER)).toHaveLength(events.length);
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
  });

  it("filters by tool name", () => {
    expect(kinds(filterEvents(events, { ...EMPTY_FILTER, tools: ["Read"] }))).toEqual(["Read"]);
    expect(kinds(filterEvents(events, { ...EMPTY_FILTER, tools: ["Read", "Bash"] }))).toEqual(["Bash", "Read"]);
  });

  it("shows only failed tool calls and error system events with errorsOnly", () => {
    expect(kinds(filterEvents(events, { ...EMPTY_FILTER, errorsOnly: true }))).toEqual(["Bash", "system"]);
  });

  it("searches text, tool input and tool output case-insensitively", () => {
    expect(kinds(filterEvents(events, { ...EMPTY_FILTER, query: "PARSER" }))).toEqual(["user", "Bash", "Read"]);
    expect(kinds(filterEvents(events, { ...EMPTY_FILTER, query: "export function" }))).toEqual(["Read"]);
    expect(kinds(filterEvents(events, { ...EMPTY_FILTER, query: "   " }))).toHaveLength(events.length);
  });

  it("combines filters with AND", () => {
    expect(filterEvents(events, { tools: ["Read"], errorsOnly: true, query: "" })).toEqual([]);
  });
});
