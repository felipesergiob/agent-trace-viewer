/**
 * Best-effort secret and PII redaction applied before any session content is
 * sent off the machine. Pattern-based, so it reduces risk rather than
 * guaranteeing anything; the UI shows the exact redacted payload before sending.
 */

interface Rule {
  name: string;
  pattern: RegExp;
  replace: string | ((...match: string[]) => string);
}

const RULES: Rule[] = [
  {
    name: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: "[REDACTED_PRIVATE_KEY]",
  },
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{8,}/g, replace: "[REDACTED_API_KEY]" },
  { name: "generic-sk-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replace: "[REDACTED_API_KEY]" },
  { name: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, replace: "[REDACTED_TOKEN]" },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, replace: "[REDACTED_AWS_KEY]" },
  { name: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, replace: "[REDACTED_TOKEN]" },
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    replace: "[REDACTED_JWT]",
  },
  {
    name: "bearer",
    pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}=*/g,
    replace: (_match, scheme) => `${scheme} [REDACTED]`,
  },
  {
    name: "url-credentials",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi,
    replace: (_match, scheme) => `${scheme}[REDACTED]@`,
  },
  {
    // ENV_STYLE_SECRET=value or ENV_STYLE_SECRET: value (uppercase names only, to spare prose like "max_tokens: 10")
    name: "env-assignment",
    pattern:
      /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?)[A-Z0-9_]*)(\s*[=:]\s*)(["']?)[^\s"'`]{4,}\3/g,
    replace: (_match, name, sep, quote) => `${name}${sep}${quote}[REDACTED]${quote}`,
  },
  {
    // "password": "...", "apiKey": "..." in JSON / object literals
    name: "json-secret-field",
    pattern:
      /(["']?)(password|passwd|secret|client_secret|api_?key|access_?token|refresh_?token|auth_?token|token)\1(\s*:\s*)(["'])(?:(?!\4).){4,}\4/gi,
    replace: (_match, q, key, sep, quote) => `${q}${key}${q}${sep}${quote}[REDACTED]${quote}`,
  },
  {
    name: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    replace: "[EMAIL]",
  },
  {
    // /Users/jane/... or /home/jane/... -> ~/...
    name: "home-path",
    pattern: /\/(?:Users|home)\/[^/\s"'`]+/g,
    replace: "~",
  },
  { name: "windows-home-path", pattern: /\b[A-Z]:\\Users\\[^\\\s"'`]+/g, replace: "~" },
];

export interface RedactionResult {
  text: string;
  /** Number of replacements made, by rule name. */
  counts: Record<string, number>;
}

export function redact(input: string): RedactionResult {
  const counts: Record<string, number> = {};
  let text = input;
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (...args: unknown[]) => {
      counts[rule.name] = (counts[rule.name] ?? 0) + 1;
      if (typeof rule.replace === "string") return rule.replace;
      // String.replace passes (match, ...groups, offset, input); groups are strings or undefined.
      const strings = args.filter((arg): arg is string => typeof arg === "string");
      return rule.replace(...strings);
    });
  }
  return { text, counts };
}

export function redactText(input: string): string {
  return redact(input).text;
}
