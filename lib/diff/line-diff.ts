export type DiffLine =
  | { type: "context"; text: string; oldNumber: number; newNumber: number }
  | { type: "removed"; text: string; oldNumber: number }
  | { type: "added"; text: string; newNumber: number };

/** Above this many cells the LCS table is skipped and the diff degrades to remove-all/add-all. */
const MAX_LCS_CELLS = 250_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Line-level diff between two strings using a longest-common-subsequence
 * table. Edit tool snippets are small, so O(n*m) is fine; very large inputs
 * fall back to a plain replace view.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const result: DiffLine[] = [];

  if (a.length * b.length > MAX_LCS_CELLS) {
    a.forEach((text, i) => result.push({ type: "removed", text, oldNumber: i + 1 }));
    b.forEach((text, j) => result.push({ type: "added", text, newNumber: j + 1 }));
    return result;
  }

  // lcs[i][j] = LCS length of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: "context", text: a[i], oldNumber: i + 1, newNumber: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: "removed", text: a[i], oldNumber: i + 1 });
      i++;
    } else {
      result.push({ type: "added", text: b[j], newNumber: j + 1 });
      j++;
    }
  }
  while (i < a.length) {
    result.push({ type: "removed", text: a[i], oldNumber: i + 1 });
    i++;
  }
  while (j < b.length) {
    result.push({ type: "added", text: b[j], newNumber: j + 1 });
    j++;
  }
  return result;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "added") added++;
    else if (line.type === "removed") removed++;
  }
  return { added, removed };
}
