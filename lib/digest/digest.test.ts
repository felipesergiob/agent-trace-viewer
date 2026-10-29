import { describe, expect, it } from "vitest";
import { parseTranscript } from "@/lib/parser";
import { line, readSample, text, toolUse } from "@/test/helpers";
import { buildDigest } from "./digest";
import { redact } from "./redact";

describe("redact", () => {
  it.each([
    ["key sk-ant-api03-abcdefghijklmnop", "key [REDACTED_API_KEY]"],
    ["token ghp_abcdefghijklmnopqrstuvwxyz0123", "token [REDACTED_TOKEN]"],
    ["AKIAABCDEFGHIJKLMNOP", "[REDACTED_AWS_KEY]"],
    ["Authorization: Bearer abc.def.ghijklmnopqrst", "Authorization: Bearer [REDACTED]"],
    ["postgres://admin:hunter22@db.internal:5432/app", "postgres://[REDACTED]@db.internal:5432/app"],
    ["DATABASE_PASSWORD=supersecret", "DATABASE_PASSWORD=[REDACTED]"],
    ['export STRIPE_SECRET_KEY="sk_live_123456"', 'export STRIPE_SECRET_KEY="[REDACTED]"'],
    ['{"password": "letmein!"}', '{"password": "[REDACTED]"}'],
    ["mail jane.doe@example.com now", "mail [EMAIL] now"],
    ["/Users/jane/projects/app/src/a.ts", "~/projects/app/src/a.ts"],
    ["/home/dev/work/x", "~/work/x"],
  ])("redacts %s", (input, expected) => {
    expect(redact(input).text).toBe(expected);
  });

  it("leaves ordinary text alone", () => {
    const input = "max_tokens: 16000, the token count was 1200, see src/auth/token.ts";
    expect(redact(input).text).toBe(input);
  });

  it("redacts private key blocks", () => {
    const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----";
    expect(redact(`before ${key} after`).text).toBe("before [REDACTED_PRIVATE_KEY] after");
  });

  it("counts replacements by rule", () => {
    expect(redact("a@b.co c@d.io").counts).toEqual({ email: 2 });
  });
});

describe("buildDigest", () => {
  it("numbers steps and maps them back to event ids", () => {
    const session = parseTranscript(
      [
        line.user("Fix it"),
        line.assistant([text("On it"), toolUse("t1", "Bash", { command: "npm test" })]),
        line.toolResult("t1", "1 failed", { isError: true }),
      ].join("\n"),
    );
    const digest = buildDigest(session);
    expect(digest.text).toContain("[1] USER: Fix it");
    expect(digest.text).toContain("[2] ASSISTANT: On it");
    expect(digest.text).toContain("[3] TOOL Bash: npm test\n    -> ERROR: 1 failed");
    expect(digest.stepIds).toEqual(session.events.map((e) => e.id));
  });

  it("excludes injected context and thinking", () => {
    const session = parseTranscript(
      [
        line.user("<system-reminder>secret context</system-reminder>"),
        line.assistant([{ type: "thinking", thinking: "private reasoning" }]),
        line.user("Real prompt"),
      ].join("\n"),
    );
    const digest = buildDigest(session);
    expect(digest.text).not.toContain("secret context");
    expect(digest.text).not.toContain("private reasoning");
    expect(digest.stepIds).toHaveLength(1);
  });

  it("redacts secrets and home directories in the output", () => {
    const session = parseTranscript(
      [
        line.user("Use key sk-ant-api03-aaaaaaaaaaaaaaaa"),
        line.assistant([toolUse("t1", "Read", { file_path: "/Users/someone/app/.env" })]),
        line.toolResult("t1", "API_TOKEN=abcd1234efgh"),
      ].join("\n"),
    );
    const digest = buildDigest(session);
    expect(digest.text).not.toMatch(/sk-ant-api03|abcd1234efgh|someone/);
    expect(digest.redactions).toBeGreaterThanOrEqual(3);
  });

  it("keeps the start and end of long sessions within the size limit", () => {
    const lines = [line.user("The original task")];
    for (let i = 0; i < 400; i++) {
      lines.push(line.assistant([toolUse(`t${i}`, "Bash", { command: `echo ${"x".repeat(300)} ${i}` })]));
      lines.push(line.toolResult(`t${i}`, "y".repeat(500)));
    }
    lines.push(line.assistant([text("All done, tests pass.")]));
    const digest = buildDigest(parseTranscript(lines.join("\n")), 20_000);

    expect(digest.text.length).toBeLessThanOrEqual(20_500);
    expect(digest.text).toContain("The original task");
    expect(digest.text).toContain("All done, tests pass.");
    expect(digest.omittedSteps).toBeGreaterThan(0);
    expect(digest.text).toMatch(/\[\.\.\. \d+ steps omitted/);
  });

  it("builds a digest for a bundled sample without leaking the cwd", () => {
    const digest = buildDigest(parseTranscript(readSample("unverified-success")));
    expect(digest.text).toContain("project: tasklane-api");
    expect(digest.text).toContain("All tests pass");
    expect(digest.text).not.toContain("/home/dev");
  });
});
