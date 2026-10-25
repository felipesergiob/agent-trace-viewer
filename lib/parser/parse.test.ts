import { describe, expect, it } from "vitest";
import { line, readSample, text, toolUse } from "@/test/helpers";
import { isMetaText, parseTranscript, toolResultText } from "./parse";
import type { ToolCallEvent } from "./types";

const toolCalls = (events: ReturnType<typeof parseTranscript>["events"]) =>
  events.filter((e): e is ToolCallEvent => e.kind === "tool_call");

describe("parseTranscript", () => {
  it("returns an empty session for empty input", () => {
    const session = parseTranscript("");
    expect(session.events).toEqual([]);
    expect(session.stats).toMatchObject({ totalLines: 0, parsedLines: 0, skipped: [] });
  });

  it("parses a user prompt, assistant text and a paired tool call", () => {
    const source = [
      line.user("Fix the bug", "2026-01-01T00:00:00.000Z"),
      line.assistant([text("Running tests.")], { id: "m1", timestamp: "2026-01-01T00:00:01.000Z" }),
      line.assistant([toolUse("t1", "Bash", { command: "npm test" })], {
        id: "m1",
        timestamp: "2026-01-01T00:00:01.500Z",
      }),
      line.toolResult("t1", "1 failed", { isError: true, timestamp: "2026-01-01T00:00:04.000Z" }),
    ].join("\n");

    const session = parseTranscript(source);
    expect(session.events.map((e) => e.kind)).toEqual(["user", "assistant_text", "tool_call"]);

    const [call] = toolCalls(session.events);
    expect(call.name).toBe("Bash");
    expect(call.input).toEqual({ command: "npm test" });
    expect(call.result).toEqual({ timestamp: "2026-01-01T00:00:04.000Z", text: "1 failed", isError: true });
    expect(call.durationMs).toBe(2500);
    expect(session.meta).toMatchObject({ sessionId: "test-session", cwd: "/work/demo", gitBranch: "main" });
  });

  it("records usage once per message id even when blocks span several lines", () => {
    const usage = { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 };
    const source = [
      line.assistant([text("a")], { id: "same", usage }),
      line.assistant([toolUse("t1", "Read", { file_path: "/x" })], { id: "same", usage }),
      line.assistant([text("b")], { id: "other", usage }),
    ].join("\n");

    const session = parseTranscript(source);
    expect(session.assistantMessages).toHaveLength(2);
    expect(session.assistantMessages[0].usage).toEqual({
      inputTokens: 10,
      outputTokens: 50,
      cacheReadTokens: 1000,
      cacheWrite5mTokens: 200,
      cacheWrite1hTokens: 0,
    });
  });

  it("splits cache writes by TTL when the breakdown is present", () => {
    const source = line.assistant([text("a")], {
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 300,
        cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
      },
    });
    const usage = parseTranscript(source).assistantMessages[0].usage;
    expect(usage).toMatchObject({ cacheWrite5mTokens: 100, cacheWrite1hTokens: 200 });
  });

  it("numbers turns by real prompts and marks injected context as meta", () => {
    const source = [
      line.user("first"),
      line.user("<command-name>/clear</command-name>"),
      line.user("skill text", undefined, { isMeta: true }),
      line.user("second"),
    ].join("\n");
    const events = parseTranscript(source).events;
    expect(events.map((e) => (e.kind === "user" ? [e.isMeta, e.turn] : null))).toEqual([
      [false, 0],
      [true, 0],
      [true, 0],
      [false, 1],
    ]);
  });

  it("flattens array tool_result content and counts orphan results", () => {
    const source = [
      line.assistant([toolUse("t1", "Read", { file_path: "/a.png" })]),
      line.toolResult("t1", [text("line one"), { type: "image", source: {} }]),
      line.toolResult("missing", "nobody asked"),
    ].join("\n");
    const session = parseTranscript(source);
    expect(toolCalls(session.events)[0].result?.text).toBe("line one\n[image]");
    expect(session.stats.orphanToolResults).toBe(1);
  });

  it("leaves a call without a result as pending", () => {
    const session = parseTranscript(line.assistant([toolUse("t1", "Bash", { command: "sleep 100" })]));
    expect(toolCalls(session.events)[0]).toMatchObject({ result: null, durationMs: null });
  });

  it("skips empty thinking blocks and keeps non-empty ones", () => {
    const source = [
      line.assistant([{ type: "thinking", thinking: "", signature: "x" }]),
      line.assistant([{ type: "thinking", thinking: "Consider the cache.", signature: "x" }]),
    ].join("\n");
    const events = parseTranscript(source).events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "thinking", text: "Consider the cache." });
  });

  it("tolerates unknown fields, unknown line types and unknown block types", () => {
    const source = [
      JSON.stringify({ type: "file-history-snapshot", messageId: "x", snapshot: {} }),
      JSON.stringify({ type: "some-future-type", payload: [1, 2, 3] }),
      line.assistant([{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }, text("ok")]),
      JSON.stringify({
        ...JSON.parse(line.user("hello")),
        brandNewField: { nested: true },
      }),
    ].join("\n");

    const session = parseTranscript(source);
    expect(session.stats.skipped).toEqual([]);
    expect(session.stats.ignoredByType).toEqual({
      "file-history-snapshot": 1,
      "some-future-type": 1,
      "block:server_tool_use": 1,
    });
    expect(session.events.map((e) => e.kind)).toEqual(["assistant_text", "user"]);
  });

  it("skips malformed lines with their line numbers and keeps going", () => {
    const source = [
      line.user("before"),
      "{not json",
      "42",
      '"a string"',
      JSON.stringify({ no: "type" }),
      JSON.stringify({ type: "assistant" }),
      JSON.stringify({ type: "user", message: { content: 7 } }),
      '{"type":"assistant","message":{"id":"trunc',
      line.user("after"),
    ].join("\n");

    const session = parseTranscript(source);
    expect(session.events.map((e) => (e.kind === "user" ? e.text : e.kind))).toEqual(["before", "after"]);
    expect(session.stats.totalLines).toBe(9);
    expect(session.stats.parsedLines).toBe(2);
    expect(session.stats.skipped.map((s) => s.line)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(session.stats.skipped[0].reason).toBe("Invalid JSON");
    expect(session.stats.skipped[4].reason).toMatch(/message/);
  });

  it("ignores invalid blocks inside an otherwise valid line", () => {
    const source = line.assistant([
      { type: "tool_use", id: "t1" }, // missing name
      "not a block",
      text("still shown"),
    ]);
    const session = parseTranscript(source);
    expect(session.events).toHaveLength(1);
    expect(session.stats.ignoredByType["block:invalid"]).toBe(2);
  });

  it("handles CRLF line endings and blank lines", () => {
    const source = `\r\n${line.user("a")}\r\n\r\n${line.user("b")}\r\n`;
    const session = parseTranscript(source);
    expect(session.events).toHaveLength(2);
    expect(session.stats.totalLines).toBe(2);
  });

  it("never throws on arbitrary input", () => {
    const inputs = [
      "\u0000\u0001\u0002",
      "[]\n{}\nnull\ntrue",
      '{"type":null}',
      '{"type":"assistant","message":{"content":[null,1,{"type":5}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result"}]}}',
      '{"type":"system","content":{"deep":[1,2]}}',
      "x".repeat(10_000),
    ];
    for (const input of inputs) {
      expect(() => parseTranscript(input)).not.toThrow();
    }
  });

  it("excludes the synthetic model id from the model list", () => {
    const source = [
      line.assistant([text("a")], { model: "claude-opus-5-5" }),
      line.assistant([text("No response requested.")], { model: "<synthetic>" }),
    ].join("\n");
    expect(parseTranscript(source).meta.models).toEqual(["claude-opus-5-5"]);
  });
});

describe("bundled samples", () => {
  it.each(["fix-failing-test", "error-and-retry", "unverified-success"])("%s parses with every tool call answered", (name) => {
    const session = parseTranscript(readSample(name));
    const calls = toolCalls(session.events);
    expect(calls.length).toBeGreaterThan(3);
    expect(calls.every((call) => call.result !== null)).toBe(true);
    expect(session.stats.orphanToolResults).toBe(0);
  });

  it("error-and-retry reports its one truncated line", () => {
    const session = parseTranscript(readSample("error-and-retry"));
    expect(session.stats.skipped).toHaveLength(1);
    expect(session.stats.skipped[0].reason).toBe("Invalid JSON");
  });
});

describe("helpers", () => {
  it("isMetaText recognizes injected prefixes", () => {
    expect(isMetaText("<local-command-stdout>ok</local-command-stdout>")).toBe(true);
    expect(isMetaText("please fix <command-name>")).toBe(false);
  });

  it("toolResultText handles null, objects and strings", () => {
    expect(toolResultText(undefined)).toBe("");
    expect(toolResultText("x")).toBe("x");
    expect(toolResultText({ a: 1 })).toBe('{"a":1}');
  });
});
