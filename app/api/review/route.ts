import { connection } from "next/server";
import { getReviewConfig } from "@/lib/review/config";
import { ReviewError, runReview } from "@/lib/review/run-review";
import { ReviewRequestSchema, type ReviewStatus } from "@/lib/review/schema";

/** Reports whether reviews are available. Evaluated per request so env changes apply without a rebuild. */
export async function GET() {
  await connection();
  const { enabled, model } = getReviewConfig();
  const status: ReviewStatus = { enabled, model };
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const config = getReviewConfig();
  if (!config.enabled) {
    return Response.json(
      { error: "not_configured", message: "Set ANTHROPIC_API_KEY on the server to enable reviews." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Body must be JSON." }, { status: 400 });
  }

  const parsed = ReviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "bad_request", message: "Expected { digest: string } under 200,000 characters." },
      { status: 400 },
    );
  }

  try {
    const result = await runReview(parsed.data.digest, config);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ReviewError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    console.error("review failed", error);
    return Response.json({ error: "internal", message: "Review failed unexpectedly." }, { status: 500 });
  }
}
