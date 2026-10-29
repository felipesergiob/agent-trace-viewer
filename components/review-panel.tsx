"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ParsedSession } from "@/lib/parser";
import { buildDigest } from "@/lib/digest";
import {
  ReviewErrorSchema,
  ReviewResponseSchema,
  ReviewStatusSchema,
  type Review,
  type ReviewResponse,
  type ReviewStatus,
} from "@/lib/review/schema";
import { pluralize } from "@/lib/format";
import { AlertIcon, CheckIcon, ChevronIcon, SparkIcon } from "./icons";

type Phase =
  | { name: "idle" }
  | { name: "preview" }
  | { name: "loading" }
  | { name: "done"; result: ReviewResponse }
  | { name: "error"; message: string };

interface ReviewPanelProps {
  session: ParsedSession;
  onJump: (eventId: string) => void;
}

const VERDICT: Record<Review["task_completed"], { label: string; className: string }> = {
  yes: { label: "Completed", className: "bg-success-soft text-success border-success/40" },
  partial: { label: "Partially completed", className: "bg-warn-soft text-warn border-warn/40" },
  no: { label: "Not completed", className: "bg-danger-soft text-danger border-danger/40" },
  unclear: { label: "Unclear", className: "bg-panel-2 text-muted border-line" },
};

const SEVERITY: Record<"low" | "medium" | "high", string> = {
  low: "text-muted",
  medium: "text-warn",
  high: "text-danger",
};

const button =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

function useReviewStatus(): ReviewStatus | "loading" | "unavailable" {
  const [status, setStatus] = useState<ReviewStatus | "loading" | "unavailable">("loading");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/review", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: unknown) => {
        const parsed = ReviewStatusSchema.safeParse(json);
        if (!cancelled) setStatus(parsed.success ? parsed.data : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

function StepRefs({ steps, stepIds, onJump }: { steps: number[]; stepIds: string[]; onJump: (id: string) => void }) {
  const valid = steps.filter((n) => stepIds[n - 1]);
  if (valid.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1">
      {valid.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onJump(stepIds[n - 1])}
          className="rounded bg-panel-2 px-1 font-mono text-[11px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`Jump to step ${n}`}
        >
          [{n}]
        </button>
      ))}
    </span>
  );
}

/** Turns "[12]" references in free text into jump links. */
function TextWithRefs({ text, stepIds, onJump }: { text: string; stepIds: string[]; onJump: (id: string) => void }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        return match && stepIds[Number(match[1]) - 1] ? (
          <StepRefs key={i} steps={[Number(match[1])]} stepIds={stepIds} onJump={onJump} />
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function ReviewList({ title, empty, children, count }: { title: string; empty: string; children: React.ReactNode; count: number }) {
  return (
    <section>
      <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">
        {title} <span className="font-normal text-subtle">({count})</span>
      </h4>
      {count === 0 ? <p className="mt-1 text-sm text-subtle">{empty}</p> : <ul className="mt-1.5 space-y-2 text-sm">{children}</ul>}
    </section>
  );
}

function ReviewResult({ result, stepIds, onJump }: { result: ReviewResponse; stepIds: string[]; onJump: (id: string) => void }) {
  const { review } = result;
  const verdict = VERDICT[review.task_completed];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${verdict.className}`}>
          {review.task_completed === "yes" ? <CheckIcon className="h-3 w-3" /> : <AlertIcon className="h-3 w-3" />}
          {verdict.label}
        </span>
        <span className="font-mono text-xs text-subtle">{result.model}</span>
      </div>
      <p className="text-sm leading-6">{review.summary}</p>
      <p className="text-sm leading-6 text-muted">
        <TextWithRefs text={review.completion_rationale} stepIds={stepIds} onJump={onJump} />
      </p>

      <ReviewList title="Unverified claims" empty="None found." count={review.unverified_claims.length}>
        {review.unverified_claims.map((item, i) => (
          <li key={i} className="border-l-2 border-warn/60 pl-3">
            <p className="font-medium">“{item.claim}”</p>
            <p className="text-muted">
              <TextWithRefs text={item.why_unverified} stepIds={stepIds} onJump={onJump} />
              <StepRefs steps={item.steps} stepIds={stepIds} onJump={onJump} />
            </p>
          </li>
        ))}
      </ReviewList>

      <ReviewList title="Skipped steps" empty="None found." count={review.skipped_steps.length}>
        {review.skipped_steps.map((item, i) => (
          <li key={i} className="border-l-2 border-line-strong pl-3">
            <p className="font-medium">{item.step}</p>
            <p className="text-muted">
              <TextWithRefs text={item.why_it_matters} stepIds={stepIds} onJump={onJump} />
            </p>
          </li>
        ))}
      </ReviewList>

      <ReviewList title="Risky actions" empty="None found." count={review.risky_actions.length}>
        {review.risky_actions.map((item, i) => (
          <li key={i} className="border-l-2 border-danger/50 pl-3">
            <p className="font-medium">
              <span className={`mr-1.5 font-mono text-xs uppercase ${SEVERITY[item.severity]}`}>{item.severity}</span>
              {item.action}
              <StepRefs steps={item.steps} stepIds={stepIds} onJump={onJump} />
            </p>
            <p className="text-muted">
              <TextWithRefs text={item.note} stepIds={stepIds} onJump={onJump} />
            </p>
          </li>
        ))}
      </ReviewList>

      {review.follow_ups.length > 0 && (
        <ReviewList title="Follow-ups" empty="" count={review.follow_ups.length}>
          {review.follow_ups.map((item, i) => (
            <li key={i} className="list-inside list-disc text-muted">
              <TextWithRefs text={item} stepIds={stepIds} onJump={onJump} />
            </li>
          ))}
        </ReviewList>
      )}

      <p className="text-[11px] text-subtle">
        Generated by a model from a truncated digest. Treat it as a starting point for review, not a verdict.
        {result.usage ? ` ${result.usage.inputTokens.toLocaleString("en-US")} input / ${result.usage.outputTokens.toLocaleString("en-US")} output tokens.` : ""}
      </p>
    </div>
  );
}

export function ReviewPanel({ session, onJump }: ReviewPanelProps) {
  const status = useReviewStatus();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const digest = useMemo(() => buildDigest(session), [session]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const enabled = typeof status === "object" && status.enabled;
  const model = typeof status === "object" ? status.model : null;

  const send = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: "loading" });
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest: digest.text }),
        signal: controller.signal,
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err = ReviewErrorSchema.safeParse(json);
        setPhase({ name: "error", message: err.success ? err.data.message : `Request failed (${res.status}).` });
        return;
      }
      const parsed = ReviewResponseSchema.safeParse(json);
      setPhase(
        parsed.success
          ? { name: "done", result: parsed.data }
          : { name: "error", message: "The server returned a review in an unexpected format." },
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({ name: "error", message: error instanceof Error ? error.message : "Request failed." });
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase({ name: "idle" });
  };

  const sizeKb = (digest.text.length / 1024).toFixed(1);

  return (
    <section className="rounded-lg border border-line bg-panel" aria-labelledby="review-heading" aria-busy={phase.name === "loading"}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <SparkIcon className="h-4 w-4 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 id="review-heading" className="text-sm font-semibold">
            Review this run
          </h2>
          <p id="review-help" className="text-xs text-muted">
            {status === "loading"
              ? "Checking whether reviews are configured…"
              : enabled
                ? `Sends a redacted ${sizeKb} KB digest to ${model} and returns a structured review.`
                : status === "unavailable"
                  ? "Review endpoint unreachable. Reviews need the Next.js server (npm run dev or npm start)."
                  : "Disabled: set ANTHROPIC_API_KEY in .env.local and restart the server to enable reviews."}
          </p>
        </div>
        {phase.name === "idle" || phase.name === "done" || phase.name === "error" ? (
          <button
            type="button"
            className={`${button} border border-line bg-panel-2 text-fg hover:border-accent`}
            disabled={!enabled}
            aria-describedby="review-help"
            onClick={() => setPhase({ name: "preview" })}
          >
            {phase.name === "idle" ? "Review this run" : "Run again"}
          </button>
        ) : null}
      </div>

      {phase.name === "preview" && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <p className="text-xs text-muted">
            {pluralize(digest.stepIds.length, "step")}, {sizeKb} KB, {pluralize(digest.redactions, "redaction")}
            {digest.omittedSteps > 0 ? `, ${pluralize(digest.omittedSteps, "step")} omitted to fit the size limit` : ""}.
            Thinking blocks and injected context are not included. Nothing else from the session is sent.
          </p>
          <details className="group rounded-md border border-line">
            <summary className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-fg">
              <ChevronIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              Show exactly what will be sent
            </summary>
            <pre className="max-h-96 overflow-auto border-t border-line bg-panel-2 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap break-words">
              {digest.text}
            </pre>
          </details>
          <div className="flex gap-2">
            <button type="button" className={`${button} bg-accent text-white dark:text-[#0b0b0d]`} onClick={send}>
              Send to Claude
            </button>
            <button type="button" className={`${button} text-muted hover:text-fg`} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase.name === "loading" && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted" role="status">
          <span>Reviewing with {model}… this can take up to a minute.</span>
          <button type="button" className={`${button} text-muted hover:text-fg`} onClick={cancel}>
            Cancel
          </button>
        </div>
      )}

      {phase.name === "error" && (
        <p role="alert" className="border-t border-line px-4 py-3 text-sm text-danger">
          {phase.message}
        </p>
      )}

      {phase.name === "done" && (
        <div className="border-t border-line px-4 py-4">
          <ReviewResult result={phase.result} stepIds={digest.stepIds} onJump={onJump} />
        </div>
      )}
    </section>
  );
}
