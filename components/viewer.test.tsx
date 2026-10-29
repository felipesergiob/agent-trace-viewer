// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTranscript } from "@/lib/parser";
import { readSample } from "@/test/helpers";
import { Viewer } from "./viewer";

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = handler(String(input), init);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const disabledStatus = () => ({ enabled: false, model: "claude-sonnet-5-5" });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderSample(name: string) {
  const session = parseTranscript(readSample(name));
  render(<Viewer initialSession={{ name: `${name}.jsonl`, session }} />);
  return session;
}

describe("Viewer", () => {
  it("shows the summary, parse warning and timeline for a session", async () => {
    mockFetch(disabledStatus);
    const session = renderSample("error-and-retry");
    const callCount = session.events.filter((e) => e.kind === "tool_call").length;

    expect(screen.getByText("error-and-retry.jsonl")).toBeInTheDocument();
    expect(screen.getByText(/1 line skipped/)).toBeInTheDocument();
    expect(screen.getAllByTestId("tool-call")).toHaveLength(callCount);
    expect(screen.getAllByRole("table", { name: /Diff with/ }).length).toBeGreaterThan(0);
    await screen.findByText(/Disabled: set ANTHROPIC_API_KEY/);
  });

  it("filters to failed tool calls and by tool name", async () => {
    mockFetch(disabledStatus);
    const user = userEvent.setup();
    const session = renderSample("error-and-retry");

    await user.click(screen.getByRole("button", { name: /Errors only/ }));
    const errorCards = screen.getAllByTestId("tool-call");
    expect(errorCards).toHaveLength(3);
    for (const card of errorCards) expect(within(card).getByText("error")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    const toolGroup = screen.getByRole("group", { name: "Filter by tool" });
    await user.click(within(toolGroup).getByRole("button", { name: "Write" }));
    expect(screen.getAllByTestId("tool-call")).toHaveLength(2);
    expect(screen.getByText(`2 of ${session.events.length} events`)).toBeInTheDocument();
  });

  it("disables the review button without an API key", async () => {
    mockFetch(disabledStatus);
    renderSample("fix-failing-test");
    const button = screen.getByRole("button", { name: "Review this run" });
    await screen.findByText(/Disabled: set ANTHROPIC_API_KEY/);
    expect(button).toBeDisabled();
  });

  it("previews the digest, sends it and renders the structured review", async () => {
    const review = {
      summary: "Added rate limiting.",
      task_completed: "partial",
      completion_rationale: "Never ran tests [9].",
      unverified_claims: [{ claim: "All tests pass", why_unverified: "No test run.", steps: [9] }],
      skipped_steps: [],
      risky_actions: [{ action: "Deleted package-lock.json", severity: "medium", steps: [4], note: "Not requested." }],
      follow_ups: [],
    };
    const fetchMock = mockFetch((_url, init) =>
      init?.method === "POST"
        ? { review, model: "claude-sonnet-5-5", usage: { inputTokens: 3000, outputTokens: 400 } }
        : { enabled: true, model: "claude-sonnet-5-5" },
    );
    const user = userEvent.setup();
    renderSample("unverified-success");

    const start = screen.getByRole("button", { name: "Review this run" });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    expect(screen.getByText("Show exactly what will be sent")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send to Claude" }));

    expect(await screen.findByText("Partially completed")).toBeInTheDocument();
    expect(screen.getByText("“All tests pass”")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Jump to step 9" }).length).toBeGreaterThan(0);

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const sent = JSON.parse(String(post?.[1]?.body)) as { digest: string };
    expect(sent.digest).toContain("[1] USER: Add rate limiting");
    expect(sent.digest).not.toContain("/home/dev");

    await user.click(screen.getAllByRole("button", { name: "Jump to step 9" })[0]);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

describe("Empty state", () => {
  it("opens a dropped or chosen file", async () => {
    mockFetch(disabledStatus);
    const user = userEvent.setup();
    render(<Viewer />);

    expect(screen.getByRole("button", { name: /Fix a failing test/ })).toBeInTheDocument();
    const file = new File([readSample("fix-failing-test")], "my-session.jsonl", { type: "application/x-ndjson" });
    await user.upload(screen.getByLabelText("Session transcript file"), file);

    expect(await screen.findByText("my-session.jsonl")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Session timeline" })).toBeInTheDocument();
  });

  it("reports a file with no readable lines", async () => {
    mockFetch(disabledStatus);
    const user = userEvent.setup();
    render(<Viewer />);
    await user.upload(screen.getByLabelText("Session transcript file"), new File(["not json\n{"], "bad.jsonl"));
    expect(await screen.findByRole("alert")).toHaveTextContent("bad.jsonl has no readable transcript lines (2 malformed)");
  });
});
