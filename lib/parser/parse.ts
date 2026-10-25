import type { z } from "zod";
import {
  AnyBlockSchema,
  AnyLineSchema,
  AssistantLineSchema,
  SystemLineSchema,
  TextBlockSchema,
  ThinkingBlockSchema,
  ToolResultBlockSchema,
  ToolUseBlockSchema,
  UsageSchema,
  UserLineSchema,
} from "./schemas";
import type {
  AssistantMessage,
  ParsedSession,
  SessionMeta,
  TimelineEvent,
  TokenUsage,
  ToolCallEvent,
} from "./types";

/** Prefixes Claude Code uses for injected (non-typed) user content. */
const META_PREFIXES = [
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<local-command-stdout>",
  "<local-command-stderr>",
  "<system-reminder>",
  "Caveat: ",
];

/** Model id Claude Code writes for locally generated (non-API) messages. */
const SYNTHETIC_MODEL = "<synthetic>";

export function isMetaText(text: string): boolean {
  const trimmed = text.trimStart();
  return META_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function toMillis(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : ms;
}

function describeZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Schema validation failed";
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `Schema validation failed at ${path}: ${issue.message}`;
}

/** Flattens a tool_result `content` value (string, block array, or other) to text. */
export function toolResultText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const parsed = AnyBlockSchema.safeParse(block);
        if (!parsed.success) return typeof block === "string" ? block : JSON.stringify(block);
        if (parsed.data.type === "text" && typeof parsed.data.text === "string") {
          return parsed.data.text;
        }
        if (parsed.data.type === "image") return "[image]";
        return JSON.stringify(block);
      })
      .join("\n");
  }
  return JSON.stringify(content);
}

function toUsage(raw: z.infer<typeof UsageSchema>): TokenUsage {
  const cacheCreationTotal = raw.cache_creation_input_tokens ?? 0;
  const oneHour = raw.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return {
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    cacheReadTokens: raw.cache_read_input_tokens ?? 0,
    cacheWrite1hTokens: Math.min(oneHour, cacheCreationTotal),
    cacheWrite5mTokens: Math.max(0, cacheCreationTotal - oneHour),
  };
}

function maxUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: Math.max(a.inputTokens, b.inputTokens),
    outputTokens: Math.max(a.outputTokens, b.outputTokens),
    cacheReadTokens: Math.max(a.cacheReadTokens, b.cacheReadTokens),
    cacheWrite5mTokens: Math.max(a.cacheWrite5mTokens, b.cacheWrite5mTokens),
    cacheWrite1hTokens: Math.max(a.cacheWrite1hTokens, b.cacheWrite1hTokens),
  };
}

/**
 * Parses a Claude Code session transcript. Pure and total: it never throws on
 * bad input. Malformed lines are skipped and reported in `stats.skipped`.
 */
export function parseTranscript(source: string): ParsedSession {
  const events: TimelineEvent[] = [];
  const messages = new Map<string, AssistantMessage>();
  const pendingCalls = new Map<string, ToolCallEvent>();
  const meta: SessionMeta = {
    sessionId: null,
    cwd: null,
    gitBranch: null,
    version: null,
    models: [],
  };
  const stats: ParsedSession["stats"] = {
    totalLines: 0,
    parsedLines: 0,
    skipped: [],
    ignoredByType: {},
    orphanToolResults: 0,
  };

  let turn = -1;
  let anonymousMessageCounter = 0;

  const ignore = (type: string) => {
    stats.ignoredByType[type] = (stats.ignoredByType[type] ?? 0) + 1;
  };

  const rawLines = source.split(/\r?\n/);
  rawLines.forEach((rawLine, line) => {
    if (rawLine.trim() === "") return;
    stats.totalLines += 1;

    let json: unknown;
    try {
      json = JSON.parse(rawLine);
    } catch {
      stats.skipped.push({ line, reason: "Invalid JSON" });
      return;
    }

    const base = AnyLineSchema.safeParse(json);
    if (!base.success) {
      stats.skipped.push({ line, reason: "Not an object with a string `type` field" });
      return;
    }

    const envelope = base.data;
    for (const key of ["sessionId", "cwd", "gitBranch", "version"] as const) {
      const value = envelope[key];
      if (meta[key] === null && typeof value === "string" && value !== "") {
        meta[key] = value;
      }
    }

    switch (envelope.type) {
      case "user": {
        const parsed = UserLineSchema.safeParse(json);
        if (!parsed.success) {
          stats.skipped.push({ line, reason: describeZodError(parsed.error) });
          return;
        }
        stats.parsedLines += 1;
        const { data } = parsed;
        const timestamp = data.timestamp ?? null;
        const content = data.message.content;

        const textParts: string[] = [];
        if (typeof content === "string") {
          textParts.push(content);
        } else {
          content.forEach((rawBlock) => {
            const block = AnyBlockSchema.safeParse(rawBlock);
            if (!block.success) {
              ignore("block:invalid");
              return;
            }
            if (block.data.type === "text") {
              const text = TextBlockSchema.safeParse(rawBlock);
              if (text.success) textParts.push(text.data.text);
              else ignore("block:invalid");
            } else if (block.data.type === "image") {
              textParts.push("[image]");
            } else if (block.data.type === "tool_result") {
              const result = ToolResultBlockSchema.safeParse(rawBlock);
              if (!result.success) {
                ignore("block:invalid");
                return;
              }
              const call = pendingCalls.get(result.data.tool_use_id);
              if (!call) {
                stats.orphanToolResults += 1;
                return;
              }
              pendingCalls.delete(result.data.tool_use_id);
              call.result = {
                timestamp,
                text: toolResultText(result.data.content),
                isError: result.data.is_error === true,
              };
              const start = toMillis(call.timestamp);
              const end = toMillis(timestamp);
              call.durationMs = start !== null && end !== null ? Math.max(0, end - start) : null;
            } else {
              ignore(`block:${block.data.type}`);
            }
          });
        }

        const text = textParts.join("\n").trim();
        if (text === "") return;
        const isMeta = data.isMeta === true || isMetaText(text);
        if (!isMeta) turn += 1;
        events.push({
          kind: "user",
          id: `L${line}`,
          line,
          timestamp,
          turn,
          text,
          isMeta,
        });
        return;
      }

      case "assistant": {
        const parsed = AssistantLineSchema.safeParse(json);
        if (!parsed.success) {
          stats.skipped.push({ line, reason: describeZodError(parsed.error) });
          return;
        }
        stats.parsedLines += 1;
        const { data } = parsed;
        const timestamp = data.timestamp ?? null;
        const model = data.message.model ?? null;
        const messageId = data.message.id ?? `anonymous-${anonymousMessageCounter++}`;

        const usage = data.message.usage ? toUsage(data.message.usage) : null;
        const existing = messages.get(messageId);
        if (existing) {
          if (usage) existing.usage = existing.usage ? maxUsage(existing.usage, usage) : usage;
        } else {
          messages.set(messageId, { messageId, model, usage, timestamp });
        }

        const content = data.message.content;
        if (typeof content === "string") {
          if (content.trim() !== "") {
            events.push({
              kind: "assistant_text",
              id: `L${line}`,
              line,
              timestamp,
              turn,
              text: content,
              model,
              messageId,
            });
          }
          return;
        }

        content.forEach((rawBlock, blockIndex) => {
          const id = `L${line}-${blockIndex}`;
          const block = AnyBlockSchema.safeParse(rawBlock);
          if (!block.success) {
            ignore("block:invalid");
            return;
          }
          switch (block.data.type) {
            case "text": {
              const text = TextBlockSchema.safeParse(rawBlock);
              if (!text.success) return ignore("block:invalid");
              if (text.data.text.trim() === "") return;
              events.push({
                kind: "assistant_text",
                id,
                line,
                timestamp,
                turn,
                text: text.data.text,
                model,
                messageId,
              });
              return;
            }
            case "thinking": {
              const thinking = ThinkingBlockSchema.safeParse(rawBlock);
              if (!thinking.success) return ignore("block:invalid");
              // Recent models return empty thinking text by default; nothing to show.
              if (thinking.data.thinking.trim() === "") return;
              events.push({
                kind: "thinking",
                id,
                line,
                timestamp,
                turn,
                text: thinking.data.thinking,
                messageId,
              });
              return;
            }
            case "tool_use": {
              const toolUse = ToolUseBlockSchema.safeParse(rawBlock);
              if (!toolUse.success) return ignore("block:invalid");
              const call: ToolCallEvent = {
                kind: "tool_call",
                id,
                line,
                timestamp,
                turn,
                toolUseId: toolUse.data.id,
                name: toolUse.data.name,
                input: toolUse.data.input,
                messageId,
                result: null,
                durationMs: null,
              };
              pendingCalls.set(call.toolUseId, call);
              events.push(call);
              return;
            }
            default:
              ignore(`block:${block.data.type}`);
          }
        });
        return;
      }

      case "system": {
        const parsed = SystemLineSchema.safeParse(json);
        if (!parsed.success) {
          stats.skipped.push({ line, reason: describeZodError(parsed.error) });
          return;
        }
        stats.parsedLines += 1;
        const { data } = parsed;
        const text =
          typeof data.content === "string"
            ? data.content
            : data.content == null
              ? ""
              : JSON.stringify(data.content);
        if (text.trim() === "") return;
        events.push({
          kind: "system",
          id: `L${line}`,
          line,
          timestamp: data.timestamp ?? null,
          turn,
          subtype: data.subtype ?? null,
          text,
          level: data.level ?? null,
        });
        return;
      }

      default:
        stats.parsedLines += 1;
        ignore(envelope.type);
    }
  });

  const assistantMessages = [...messages.values()];
  meta.models = [
    ...new Set(
      assistantMessages
        .map((message) => message.model)
        .filter((model): model is string => model !== null && model !== SYNTHETIC_MODEL),
    ),
  ];

  return { meta, events, assistantMessages, stats };
}
