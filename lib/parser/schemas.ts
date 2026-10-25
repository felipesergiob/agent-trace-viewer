import { z } from "zod";

/**
 * Zod schemas for the Claude Code transcript format
 * (~/.claude/projects/<project>/<session>.jsonl).
 *
 * The format is undocumented and changes between versions, so every schema is
 * loose: unknown fields pass through, and only the fields the viewer reads are
 * declared. Anything that fails here is counted and skipped, never thrown.
 */

const nullableString = z.string().nullish();

export const UsageSchema = z.looseObject({
  input_tokens: z.number().nonnegative().optional(),
  output_tokens: z.number().nonnegative().optional(),
  cache_read_input_tokens: z.number().nonnegative().nullish(),
  cache_creation_input_tokens: z.number().nonnegative().nullish(),
  cache_creation: z
    .looseObject({
      ephemeral_5m_input_tokens: z.number().nonnegative().optional(),
      ephemeral_1h_input_tokens: z.number().nonnegative().optional(),
    })
    .nullish(),
});

export const TextBlockSchema = z.looseObject({
  type: z.literal("text"),
  text: z.string(),
});

export const ThinkingBlockSchema = z.looseObject({
  type: z.literal("thinking"),
  thinking: z.string().optional().default(""),
});

export const ToolUseBlockSchema = z.looseObject({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()).optional().default({}),
});

export const ToolResultBlockSchema = z.looseObject({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.unknown().optional(),
  is_error: z.boolean().nullish(),
});

/** Any block with a string `type`; specific block schemas are applied per type. */
export const AnyBlockSchema = z.looseObject({ type: z.string() });

const MessageContentSchema = z.union([z.string(), z.array(z.unknown())]);

const EnvelopeFields = {
  uuid: nullableString,
  parentUuid: nullableString,
  timestamp: nullableString,
  sessionId: nullableString,
  cwd: nullableString,
  gitBranch: nullableString,
  version: nullableString,
  isSidechain: z.boolean().nullish(),
  isMeta: z.boolean().nullish(),
};

export const UserLineSchema = z.looseObject({
  type: z.literal("user"),
  ...EnvelopeFields,
  message: z.looseObject({
    role: z.string().optional(),
    content: MessageContentSchema,
  }),
});

export const AssistantLineSchema = z.looseObject({
  type: z.literal("assistant"),
  ...EnvelopeFields,
  message: z.looseObject({
    id: nullableString,
    model: nullableString,
    role: z.string().optional(),
    content: MessageContentSchema,
    usage: UsageSchema.nullish(),
  }),
});

export const SystemLineSchema = z.looseObject({
  type: z.literal("system"),
  ...EnvelopeFields,
  subtype: nullableString,
  content: z.unknown().optional(),
  level: nullableString,
});

/** Minimal shape every line must have to be considered at all. */
export const AnyLineSchema = z.looseObject({ type: z.string() });

export type UserLine = z.infer<typeof UserLineSchema>;
export type AssistantLine = z.infer<typeof AssistantLineSchema>;
export type SystemLine = z.infer<typeof SystemLineSchema>;
