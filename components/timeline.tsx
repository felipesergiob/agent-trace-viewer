"use client";

import { useState } from "react";
import type { TimelineEvent } from "@/lib/parser";
import { formatClock, formatDuration, pluralize } from "@/lib/format";
import { InlineText } from "./inline-text";
import { ToolCallCard } from "./tool-call-card";
import { AlertIcon, ChevronIcon, InfoIcon, SparkIcon, UserIcon } from "./icons";

const PAGE_SIZE = 200;

interface TimelineProps {
  events: TimelineEvent[];
  gaps: Map<string, number>;
  cwd: string | null;
  totalEvents: number;
  /** Event that must be rendered even if it is past the current page (used by review step links). */
  ensureVisibleId?: string | null;
}

/** Gaps shorter than this are not worth showing. */
const MIN_VISIBLE_GAP_MS = 1000;

function Gutter({ event, gap }: { event: TimelineEvent; gap: number | undefined }) {
  return (
    <div className="hidden w-20 shrink-0 pt-2.5 text-right font-mono text-[11px] leading-4 tabular-nums text-subtle sm:block">
      {event.timestamp && (
        <time dateTime={event.timestamp} title={`${event.timestamp} (UTC)`}>
          {formatClock(event.timestamp)}
        </time>
      )}
      {gap !== undefined && gap >= MIN_VISIBLE_GAP_MS && (
        <div className={gap >= 60_000 ? "text-warn" : ""} title="Time since previous step">
          +{formatDuration(gap)}
        </div>
      )}
    </div>
  );
}

function UserRow({ event }: { event: Extract<TimelineEvent, { kind: "user" }> }) {
  if (event.isMeta) {
    return (
      <details className="group rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
        <summary className="flex items-center gap-2 hover:text-fg">
          <ChevronIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          Injected context ({event.text.length.toLocaleString("en-US")} chars)
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto font-mono whitespace-pre-wrap break-words">{event.text}</pre>
      </details>
    );
  }
  return (
    <div className="rounded-lg border border-line border-l-[3px] border-l-accent bg-panel px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-accent">
        <UserIcon className="h-3.5 w-3.5" /> User
      </div>
      <p className="text-sm leading-6 whitespace-pre-wrap break-words">
        <InlineText text={event.text} />
      </p>
    </div>
  );
}

function AssistantRow({ event }: { event: Extract<TimelineEvent, { kind: "assistant_text" }> }) {
  return (
    <div className="px-1 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
        <SparkIcon className="h-3.5 w-3.5" /> Assistant
        {event.model && <span className="font-mono font-normal text-subtle">{event.model}</span>}
      </div>
      <p className="text-sm leading-6 whitespace-pre-wrap break-words text-fg">
        <InlineText text={event.text} />
      </p>
    </div>
  );
}

function ThinkingRow({ event }: { event: Extract<TimelineEvent, { kind: "thinking" }> }) {
  return (
    <details className="group px-1 text-xs text-muted">
      <summary className="flex items-center gap-1.5 py-1 hover:text-fg">
        <ChevronIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        Thinking
      </summary>
      <p className="mt-1 border-l-2 border-line pl-3 leading-5 whitespace-pre-wrap break-words italic">{event.text}</p>
    </details>
  );
}

function SystemRow({ event }: { event: Extract<TimelineEvent, { kind: "system" }> }) {
  const tone =
    event.level === "error"
      ? "border-danger/40 bg-danger-soft text-danger"
      : event.level === "warning"
        ? "border-warn/40 bg-warn-soft text-warn"
        : "border-line bg-panel-2 text-muted";
  const Icon = event.level === "error" || event.level === "warning" ? AlertIcon : InfoIcon;
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-1.5 text-xs ${tone}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="break-words">
        <span className="font-mono">{event.subtype ?? "system"}</span>
        {event.level && event.level !== "info" ? ` (${event.level})` : ""}: {event.text}
      </span>
    </div>
  );
}

function EventBody({ event, cwd }: { event: TimelineEvent; cwd: string | null }) {
  switch (event.kind) {
    case "user":
      return <UserRow event={event} />;
    case "assistant_text":
      return <AssistantRow event={event} />;
    case "thinking":
      return <ThinkingRow event={event} />;
    case "system":
      return <SystemRow event={event} />;
    case "tool_call":
      return <ToolCallCard call={event} cwd={cwd} />;
  }
}

export function Timeline({ events, gaps, cwd, totalEvents, ensureVisibleId }: TimelineProps) {
  const [pageLimit, setLimit] = useState(PAGE_SIZE);
  const targetIndex = ensureVisibleId ? events.findIndex((event) => event.id === ensureVisibleId) : -1;
  const limit = Math.max(pageLimit, targetIndex + 1);
  const visible = events.slice(0, limit);

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
        {totalEvents === 0 ? "This session has no displayable events." : "No events match the current filters."}
      </p>
    );
  }

  return (
    <ol className="space-y-2" aria-label="Session timeline">
      {visible.map((event, index) => {
        const showTurnHeader = event.turn >= 0 && (index === 0 || visible[index - 1].turn !== event.turn);
        return (
          <li key={event.id} className="scroll-mt-24">
            {showTurnHeader && (
              <h3 className="mt-6 mb-2 flex items-center gap-3 text-xs font-medium tracking-wide text-subtle uppercase first:mt-0 sm:pl-[5.75rem]">
                Turn {event.turn + 1}
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
              </h3>
            )}
            <div className="flex gap-3">
              <Gutter event={event} gap={gaps.get(event.id)} />
              <div id={event.id} className="min-w-0 flex-1 rounded-lg" tabIndex={-1}>
                <EventBody event={event} cwd={cwd} />
              </div>
            </div>
          </li>
        );
      })}
      {events.length > limit && (
        <li className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setLimit(limit + PAGE_SIZE)}
            className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            Show {Math.min(PAGE_SIZE, events.length - limit)} more ({pluralize(events.length - limit, "event")} hidden)
          </button>
        </li>
      )}
    </ol>
  );
}
