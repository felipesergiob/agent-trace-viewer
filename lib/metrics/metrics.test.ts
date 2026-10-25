import { describe, expect, it } from "vitest";
import { parseTranscript } from "@/lib/parser";
import { line, readSample, text, toolUse } from "@/test/helpers";
import { computeMetrics, fileTargetOf, gapsBetweenEvents, relativeToCwd } from "./metrics";
import { costOf, normalizeModelId, priceFor } from "./pricing";

describe("computeMetrics", () => {
  const source = [
    line.user("go", "2026-01-01T00:00:00.000Z"),
    line.assistant(
      [
        toolUse("t1", "Edit", { file_path: "/work/demo/src/a.ts", old_string: "a", new_string: "b" }),
        toolUse("t2", "Edit", { file_path: "/work/demo/src/a.ts", old_string: "x", new_string: "y" }),
        toolUse("t3", "Write", { file_path: "/elsewhere/b.ts", content: "" }),
        toolUse("t4", "Bash", { command: "npm test" }),
        toolUse("t5", "Bash", { command: "npm run lint" }),
      ],
      {
        id: "m1",
        model: "claude-sonnet-5-5",
        timestamp: "2026-01-01T00:00:01.000Z",
        usage: { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    ),
    line.toolResult("t1", "ok"),
    line.toolResult("t2", "String to replace not found", { isError: true }),
    line.toolResult("t3", "ok"),
    line.toolResult("t4", "failed", { isError: true, timestamp: "2026-01-01T00:01:30.000Z" }),
    line.user("again", "2026-01-01T00:02:00.000Z"),
  ].join("\n");

  const metrics = computeMetrics(parseTranscript(source));

  it("counts turns, calls, errors and unanswered calls", () => {
    expect(metrics.turns).toBe(2);
    expect(metrics.toolCalls).toBe(5);
    expect(metrics.toolErrors).toBe(2);
    expect(metrics.unansweredToolCalls).toBe(1);
  });

  it("groups tool calls by name, most used first", () => {
    expect(metrics.tools).toEqual([
      { name: "Bash", calls: 2, errors: 1 },
      { name: "Edit", calls: 2, errors: 1 },
      { name: "Write", calls: 1, errors: 0 },
    ]);
  });

  it("lists files touched with paths relative to cwd", () => {
    expect(metrics.filesTouched).toEqual([
      { path: "/work/demo/src/a.ts", displayPath: "src/a.ts", edits: 2, writes: 0, failed: 1 },
      { path: "/elsewhere/b.ts", displayPath: "/elsewhere/b.ts", edits: 0, writes: 1, failed: 0 },
    ]);
  });

  it("measures duration from first to last timestamp", () => {
    expect(metrics.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(metrics.durationMs).toBe(120_000);
  });

  it("estimates cost from usage and the price table", () => {
    // claude-sonnet-5-5: $2/M input, $10/M output
    expect(metrics.cost?.totalUsd).toBeCloseTo(2 + 1, 6);
    expect(metrics.cost?.unpricedModels).toEqual([]);
  });

  it("returns null usage and cost when no message has usage", () => {
    const m = computeMetrics(parseTranscript(line.assistant([text("hi")])));
    expect(m.usage).toBeNull();
    expect(m.cost).toBeNull();
  });

  it("reports models missing from the price table", () => {
    const m = computeMetrics(
      parseTranscript(line.assistant([text("hi")], { model: "some-other-model", usage: { input_tokens: 10, output_tokens: 1 } })),
    );
    expect(m.cost?.unpricedModels).toEqual(["some-other-model"]);
    expect(m.cost?.totalUsd).toBe(0);
  });

  it("computes metrics for every bundled sample", () => {
    for (const name of ["fix-failing-test", "error-and-retry", "unverified-success"]) {
      const m = computeMetrics(parseTranscript(readSample(name)));
      expect(m.durationMs).toBeGreaterThan(0);
      expect(m.usage?.outputTokens).toBeGreaterThan(0);
      expect(m.filesTouched.length).toBeGreaterThan(0);
    }
  });
});

describe("pricing", () => {
  it("normalizes provider and dated model ids", () => {
    expect(normalizeModelId("us.anthropic.claude-opus-4-6")).toBe("claude-opus-4-6");
    expect(normalizeModelId("claude-sonnet-4-5-20250929")).toBe("claude-sonnet-4-5");
    expect(normalizeModelId("claude-opus-4-6[1m]")).toBe("claude-opus-4-6");
    expect(normalizeModelId("anthropic.claude-haiku-4-5-20251001-v1:0")).toBe("claude-haiku-4-5");
  });

  it("does not confuse claude-opus-5 with claude-opus-5-5", () => {
    expect(priceFor("claude-opus-5")?.input).toBe(5);
    expect(priceFor("claude-opus-5-5")?.input).toBe(4);
    expect(priceFor("gpt-x")).toBeNull();
  });

  it("prices cache writes by TTL", () => {
    const price = { input: 4, output: 20, cacheRead: 0.2 };
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWrite5mTokens: 1_000_000,
      cacheWrite1hTokens: 1_000_000,
    };
    expect(costOf(usage, price)).toBeCloseTo(0.2 + 5 + 8, 6);
  });
});

describe("helpers", () => {
  it("fileTargetOf ignores non-file tools", () => {
    const [read] = parseTranscript(line.assistant([toolUse("t", "Read", { file_path: "/a" })])).events;
    expect(read.kind === "tool_call" && fileTargetOf(read)).toBeNull();
  });

  it("relativeToCwd only strips a real directory prefix", () => {
    expect(relativeToCwd("/work/demo/a.ts", "/work/demo")).toBe("a.ts");
    expect(relativeToCwd("/work/demo-2/a.ts", "/work/demo")).toBe("/work/demo-2/a.ts");
    expect(relativeToCwd("/a.ts", null)).toBe("/a.ts");
  });

  it("gapsBetweenEvents measures time since the previous timestamped event", () => {
    const events = parseTranscript(
      [line.user("a", "2026-01-01T00:00:00.000Z"), line.user("b", "2026-01-01T00:00:05.000Z")].join("\n"),
    ).events;
    const gaps = gapsBetweenEvents(events);
    expect(gaps.get(events[0].id)).toBeUndefined();
    expect(gaps.get(events[1].id)).toBe(5000);
  });
});
