import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "./line-diff";

describe("diffLines", () => {
  it("marks unchanged, removed and added lines", () => {
    const lines = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(lines.map((l) => `${l.type[0]}:${l.text}`)).toEqual(["c:a", "r:b", "a:B", "c:c", "a:d"]);
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 });
  });

  it("numbers lines on each side", () => {
    const lines = diffLines("x\ny", "y");
    expect(lines).toEqual([
      { type: "removed", text: "x", oldNumber: 1 },
      { type: "context", text: "y", oldNumber: 2, newNumber: 1 },
    ]);
  });

  it("handles empty sides", () => {
    expect(diffLines("", "new")).toEqual([{ type: "added", text: "new", newNumber: 1 }]);
    expect(diffLines("old", "")).toEqual([{ type: "removed", text: "old", oldNumber: 1 }]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("normalizes CRLF", () => {
    expect(diffStats(diffLines("a\r\nb", "a\nb"))).toEqual({ added: 0, removed: 0 });
  });

  it("falls back to replace-all for very large inputs", () => {
    const big = Array.from({ length: 600 }, (_, i) => `line ${i}`).join("\n");
    const lines = diffLines(big, `${big}\nextra`);
    expect(diffStats(lines)).toEqual({ added: 601, removed: 600 });
  });
});
