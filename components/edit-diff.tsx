import { diffLines, diffStats } from "@/lib/diff/line-diff";

interface EditDiffProps {
  oldText: string;
  newText: string;
  label?: string;
}

const ROW_STYLES = {
  context: "text-muted",
  removed: "bg-diff-del text-fg",
  added: "bg-diff-add text-fg",
} as const;

const SIGN = { context: " ", removed: "-", added: "+" } as const;

export function EditDiff({ oldText, newText, label }: EditDiffProps) {
  const lines = diffLines(oldText, newText);
  const { added, removed } = diffStats(lines);

  return (
    <figure className="overflow-hidden rounded-md border border-line">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line bg-panel-2 px-3 py-1.5 text-xs text-muted">
        <span className="truncate font-mono">{label ?? "old_string → new_string"}</span>
        <span className="shrink-0 font-mono tabular-nums">
          <span className="text-success">+{added}</span> <span className="text-danger">−{removed}</span>
        </span>
      </figcaption>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <caption className="sr-only">
            Diff with {added} added and {removed} removed lines
          </caption>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className={ROW_STYLES[line.type]}>
                <td className="w-8 select-none border-r border-line px-2 text-right text-subtle tabular-nums">
                  {line.type === "added" ? "" : line.oldNumber}
                </td>
                <td className="w-8 select-none border-r border-line px-2 text-right text-subtle tabular-nums">
                  {line.type === "removed" ? "" : line.newNumber}
                </td>
                <td
                  className={`w-5 select-none pl-2 ${line.type === "added" ? "text-success" : line.type === "removed" ? "text-danger" : ""}`}
                >
                  <span aria-label={line.type === "context" ? undefined : line.type}>{SIGN[line.type]}</span>
                </td>
                <td className="whitespace-pre pr-3">{line.text || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
