"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { parseTranscript, type ParsedSession } from "@/lib/parser";
import { computeMetrics, EMPTY_FILTER, filterEvents, gapsBetweenEvents, type TimelineFilter } from "@/lib/metrics";
import { findSample } from "@/lib/samples";
import { EmptyState } from "./empty-state";
import { FilterBar } from "./filter-bar";
import { ParseWarnings } from "./parse-warnings";
import { ReviewPanel } from "./review-panel";
import { SummaryPanel } from "./summary-panel";
import { ThemeToggle } from "./theme-toggle";
import { Timeline } from "./timeline";
import { UploadIcon } from "./icons";

const MAX_FILE_BYTES = 200 * 1024 * 1024;

interface LoadedSession {
  name: string;
  session: ParsedSession;
}

function setSampleParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("sample", id);
  else url.searchParams.delete("sample");
  window.history.replaceState(null, "", url);
}

export function Viewer({ initialSession }: { initialSession?: LoadedSession } = {}) {
  const [loaded, setLoaded] = useState<LoadedSession | null>(initialSession ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>(EMPTY_FILTER);
  const [jump, setJump] = useState<{ id: string; nonce: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showText = useCallback((name: string, text: string) => {
    const session = parseTranscript(text);
    if (session.stats.parsedLines === 0) {
      setError(
        session.stats.totalLines === 0
          ? `${name} is empty.`
          : `${name} has no readable transcript lines (${session.stats.skipped.length} malformed).`,
      );
      setLoading(false);
      return;
    }
    setLoaded({ name, session });
    setFilter(EMPTY_FILTER);
    setJump(null);
    setError(null);
    setLoading(false);
    window.scrollTo({ top: 0 });
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name} is larger than 200 MB.`);
        return;
      }
      setLoading(true);
      try {
        const text = await file.text();
        setSampleParam(null);
        showText(file.name, text);
      } catch {
        setError(`Could not read ${file.name}.`);
        setLoading(false);
      }
    },
    [showText],
  );

  const openSample = useCallback(
    async (id: string) => {
      const sample = findSample(id);
      if (!sample) return;
      setLoading(true);
      try {
        const res = await fetch(sample.path);
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        setSampleParam(id);
        showText(`${sample.id}.jsonl`, text);
      } catch {
        setError(`Could not load sample "${sample.title}".`);
        setLoading(false);
      }
    },
    [showText],
  );

  // Support links like /?sample=error-and-retry.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("sample");
    if (!id || !findSample(id)) return;
    let cancelled = false;
    const sample = findSample(id)!;
    fetch(sample.path)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((text) => {
        if (!cancelled) showText(`${sample.id}.jsonl`, text);
      })
      .catch(() => {
        if (!cancelled) setError(`Could not load sample "${sample.title}".`);
      });
    return () => {
      cancelled = true;
    };
  }, [showText]);

  // Scroll to and highlight a review step reference.
  useEffect(() => {
    if (!jump) return;
    const element = document.getElementById(jump.id);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus({ preventScroll: true });
    element.classList.remove("flash-target");
    void element.offsetWidth; // restart the animation
    element.classList.add("flash-target");
  }, [jump]);

  const session = loaded?.session ?? null;
  const metrics = useMemo(() => (session ? computeMetrics(session) : null), [session]);
  const gaps = useMemo(() => (session ? gapsBetweenEvents(session.events) : new Map<string, number>()), [session]);
  const deferredQuery = useDeferredValue(filter.query);
  const visibleEvents = useMemo(
    () => (session ? filterEvents(session.events, { ...filter, query: deferredQuery }) : []),
    [session, filter, deferredQuery],
  );

  const jumpTo = (id: string) => {
    if (!visibleEvents.some((event) => event.id === id)) setFilter(EMPTY_FILTER);
    setJump({ id, nonce: Date.now() });
  };

  const toggleTool = (name: string) =>
    setFilter((current) => ({
      ...current,
      tools: current.tools.includes(name) ? current.tools.filter((t) => t !== name) : [...current.tools, name],
    }));

  return (
    <div
      className="flex min-h-screen flex-col"
      onDragOver={(e) => {
        if (!loaded) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!loaded) return;
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void openFile(file);
      }}
    >
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => {
              setLoaded(null);
              setSampleParam(null);
            }}
            className="flex items-center gap-2 rounded font-mono text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="agent-trace-viewer home"
          >
            <span className="grid h-6 w-6 place-items-center rounded bg-accent text-[11px] text-white dark:text-[#0b0b0d]" aria-hidden="true">
              ⟩_
            </span>
            <span className="hidden sm:inline">agent-trace-viewer</span>
          </button>
          {loaded && (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
              <span className="text-line-strong" aria-hidden="true">/</span>
              <span className="truncate font-mono text-fg" title={loaded.name}>
                {loaded.name}
              </span>
              {loaded.session.meta.gitBranch && (
                <span className="hidden truncate rounded border border-line px-1.5 py-0.5 font-mono md:inline">
                  {loaded.session.meta.gitBranch}
                </span>
              )}
              {loaded.session.meta.models.map((model) => (
                <span key={model} className="hidden rounded border border-line px-1.5 py-0.5 font-mono lg:inline">
                  {model}
                </span>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {loaded && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs text-muted hover:bg-panel-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <UploadIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Open file</span>
                  <span className="sr-only sm:hidden">Open file</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jsonl,.json,.txt,application/x-ndjson,application/json,text/plain"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Session transcript file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void openFile(file);
                    e.target.value = "";
                  }}
                />
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {!loaded || !metrics ? (
        <main className="flex-1">
          <EmptyState onFile={openFile} onSample={openSample} loading={loading} error={error} />
        </main>
      ) : (
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-8">
          <aside className="mb-6 lg:sticky lg:top-[4.75rem] lg:mb-0 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1" aria-label="Session summary">
            <SummaryPanel
              metrics={metrics}
              selectedTools={filter.tools}
              onToggleTool={toggleTool}
              onShowErrors={() => setFilter({ ...EMPTY_FILTER, errorsOnly: true })}
            />
          </aside>
          <div className="min-w-0 space-y-4">
            {error && (
              <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <ParseWarnings stats={loaded.session.stats} />
            <ReviewPanel key={loaded.name + loaded.session.stats.totalLines} session={loaded.session} onJump={jumpTo} />
            <div className="sticky top-14 z-10 -mx-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
              <FilterBar
                filter={filter}
                toolNames={metrics.tools.map((tool) => tool.name)}
                onChange={setFilter}
                shown={visibleEvents.length}
                total={loaded.session.events.length}
              />
            </div>
            <Timeline
              key={loaded.name}
              events={visibleEvents}
              gaps={gaps}
              cwd={loaded.session.meta.cwd}
              totalEvents={loaded.session.events.length}
              ensureVisibleId={jump?.id ?? null}
            />
          </div>
        </main>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-bg/80 backdrop-blur-sm" aria-hidden="true">
          <p className="rounded-xl border-2 border-dashed border-accent bg-panel px-8 py-6 text-sm font-medium">
            Drop to open this transcript
          </p>
        </div>
      )}

      <footer className="border-t border-line px-4 py-3 text-center text-[11px] text-subtle">
        Transcripts are parsed in the browser. Only the review feature sends data to a server, and only after you confirm.
      </footer>
    </div>
  );
}
