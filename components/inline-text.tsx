import { Fragment } from "react";

/**
 * Renders plain text with `inline code` spans. Deliberately not a Markdown
 * renderer: transcripts are untrusted, and plain text keeps them inert.
 */
export function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="rounded bg-panel-2 px-1 py-px font-mono text-[0.85em] text-fg">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
