"use client";

import type { ReactNode } from "react";
import type { SessionMetrics } from "@/lib/metrics";
import { PRICES_AS_OF, totalInputTokens } from "@/lib/metrics";
import { formatDuration, formatTokens, formatUsd, pluralize } from "@/lib/format";
import { ToolChart } from "./tool-chart";

interface SummaryPanelProps {
  metrics: SessionMetrics;
  selectedTools: string[];
  onToggleTool: (name: string) => void;
  onShowErrors: () => void;
}

function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: "danger"; hint?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2" title={hint}>
      <dt className="text-[11px] font-medium tracking-wide text-subtle uppercase">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${tone === "danger" ? "text-danger" : "text-fg"}`}>
        {value}
      </dd>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-line pt-4" aria-label={title}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SummaryPanel({ metrics, selectedTools, onToggleTool, onShowErrors }: SummaryPanelProps) {
  const { usage, cost } = metrics;
  const totalTokens = usage ? totalInputTokens(usage) + usage.outputTokens : null;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
        <Stat label="Duration" value={formatDuration(metrics.durationMs)} hint="First to last timestamp" />
        <Stat label="Turns" value={metrics.turns} hint="User prompts, excluding injected context" />
        <Stat label="Tool calls" value={metrics.toolCalls} />
        <Stat
          label="Errors"
          value={
            metrics.toolErrors > 0 ? (
              <button
                type="button"
                onClick={onShowErrors}
                className="underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-accent"
              >
                {metrics.toolErrors}
              </button>
            ) : (
              0
            )
          }
          tone={metrics.toolErrors > 0 ? "danger" : undefined}
          hint="Tool results marked is_error"
        />
        <Stat label="Tokens" value={totalTokens === null ? "–" : formatTokens(totalTokens)} hint="Input incl. cache + output" />
        <Stat
          label="Est. cost"
          value={cost ? formatUsd(cost.totalUsd) : "–"}
          hint={`List prices as of ${PRICES_AS_OF}`}
        />
      </dl>

      <Section title="Tool calls" aside={selectedTools.length > 0 && <span className="text-xs text-accent">filtering</span>}>
        <ToolChart tools={metrics.tools} selected={selectedTools} onToggle={onToggleTool} />
        {metrics.unansweredToolCalls > 0 && (
          <p className="mt-2 text-xs text-warn">{pluralize(metrics.unansweredToolCalls, "call")} without a result.</p>
        )}
      </Section>

      <Section title="Files touched" aside={<span className="text-xs text-subtle">{metrics.filesTouched.length}</span>}>
        {metrics.filesTouched.length === 0 ? (
          <p className="text-sm text-muted">No Edit or Write calls.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {metrics.filesTouched.map((file) => (
              <li key={file.path} className="flex items-center justify-between gap-2" title={file.path}>
                <span className="min-w-0 truncate font-mono text-fg">{file.displayPath}</span>
                <span className="flex shrink-0 gap-1.5 tabular-nums text-subtle">
                  {file.edits > 0 && <span>{pluralize(file.edits, "edit")}</span>}
                  {file.writes > 0 && <span>{pluralize(file.writes, "write")}</span>}
                  {file.failed > 0 && <span className="text-danger">{file.failed} failed</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tokens">
        {!usage || !cost ? (
          <p className="text-sm text-muted">No usage fields in this transcript.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
              <dt className="text-muted">Input</dt>
              <dd className="text-right font-mono">{formatTokens(usage.inputTokens)}</dd>
              <dt className="text-muted">Cache read</dt>
              <dd className="text-right font-mono">{formatTokens(usage.cacheReadTokens)}</dd>
              <dt className="text-muted">Cache write</dt>
              <dd className="text-right font-mono">{formatTokens(usage.cacheWrite5mTokens + usage.cacheWrite1hTokens)}</dd>
              <dt className="text-muted">Output</dt>
              <dd className="text-right font-mono">{formatTokens(usage.outputTokens)}</dd>
            </dl>
            <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
              {cost.byModel.map((entry) => (
                <li key={entry.model} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-muted">{entry.model}</span>
                  <span className="font-mono tabular-nums">{entry.usd === null ? "no price" : formatUsd(entry.usd)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-4 text-subtle">
              {metrics.assistantMessages} API responses, deduplicated by message id. Estimate at list prices as of{" "}
              {PRICES_AS_OF}
              {cost.unpricedModels.length > 0 ? `; excludes ${cost.unpricedModels.join(", ")}` : ""}.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
