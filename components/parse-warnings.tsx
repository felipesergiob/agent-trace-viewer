import type { ParseStats } from "@/lib/parser";
import { pluralize } from "@/lib/format";
import { AlertIcon, ChevronIcon } from "./icons";

export function ParseWarnings({ stats }: { stats: ParseStats }) {
  const { skipped, orphanToolResults } = stats;
  if (skipped.length === 0 && orphanToolResults === 0) return null;

  const parts = [
    skipped.length > 0 ? `${pluralize(skipped.length, "line")} skipped` : null,
    orphanToolResults > 0 ? `${pluralize(orphanToolResults, "tool result")} without a matching call` : null,
  ].filter(Boolean);

  return (
    <details className="group rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn" role="status">
      <summary className="flex items-center gap-2">
        <AlertIcon className="h-3.5 w-3.5 shrink-0" />
        <span>
          {parts.join(", ")} of {stats.totalLines}. The rest of the session is shown.
        </span>
        {skipped.length > 0 && (
          <ChevronIcon className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
        )}
      </summary>
      {skipped.length > 0 && (
        <ul className="mt-2 space-y-0.5 font-mono">
          {skipped.slice(0, 50).map((entry) => (
            <li key={entry.line}>
              line {entry.line + 1}: {entry.reason}
            </li>
          ))}
          {skipped.length > 50 && <li>… and {skipped.length - 50} more</li>}
        </ul>
      )}
    </details>
  );
}
