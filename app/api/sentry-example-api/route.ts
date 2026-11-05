import * as Sentry from "@sentry/nextjs";
import { connection } from "next/server";
class SentryExampleAPIError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}

// Temporary Sentry diagnostic route; remove this and app/sentry-example-page
// when the test page is no longer needed.
export async function GET() {
  // Opt out of prerendering so the error is thrown at request time
  await connection();
  Sentry.logger.info("Sentry example API called");
  throw new SentryExampleAPIError(
    "This error is raised on the backend called by the example page.",
  );
}
