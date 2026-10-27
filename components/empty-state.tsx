"use client";

import { useRef, useState } from "react";
import { SAMPLES } from "@/lib/samples";
import { FileIcon, UploadIcon } from "./icons";

interface EmptyStateProps {
  onFile: (file: File) => void;
  onSample: (id: string) => void;
  loading: boolean;
  error: string | null;
}

export function EmptyState({ onFile, onSample, loading, error }: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Inspect a Claude Code session</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Load a transcript from{" "}
        <code className="rounded bg-panel-2 px-1 font-mono text-xs">~/.claude/projects/&lt;project&gt;/&lt;session&gt;.jsonl</code>{" "}
        to see prompts, tool calls, results and edits as a timeline. The file is parsed in your browser and is not
        uploaded.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={`mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-panel"
        }`}
      >
        <UploadIcon className="h-6 w-6 text-subtle" />
        <p className="mt-3 text-sm font-medium">Drop a .jsonl file here</p>
        <p className="mt-1 text-xs text-muted">or</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="mt-3 rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 dark:text-[#0b0b0d]"
        >
          {loading ? "Loading…" : "Choose file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".jsonl,.json,.txt,application/x-ndjson,application/json,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-label="Session transcript file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <h2 className="mt-10 text-xs font-semibold tracking-wide text-muted uppercase">Or open a sample session</h2>
      <p className="mt-1 text-xs text-subtle">Synthetic sessions on a fictional todo API.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {SAMPLES.map((sample) => (
          <li key={sample.id}>
            <button
              type="button"
              onClick={() => onSample(sample.id)}
              disabled={loading}
              className="flex h-full w-full flex-col items-start rounded-lg border border-line bg-panel p-3 text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <FileIcon className="h-3.5 w-3.5 text-subtle" />
                {sample.title}
              </span>
              <span className="mt-1 text-xs leading-5 text-muted">{sample.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
