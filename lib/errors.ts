/** Errors with a user-facing message and an HTTP status. */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "bad_request",
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(`${what} not found`, 404, "not_found");
export const forbidden = (msg = "You do not have permission to do that") => new AppError(msg, 403, "forbidden");
export const unauthorized = () => new AppError("Please sign in", 401, "unauthorized");

/** Short, human-readable explanation of any thrown value. */
export function explainError(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) {
    const m = err.message;
    if (/ECONNREFUSED/.test(m)) return "The service refused the connection (is it running?)";
    if (/ENOTFOUND|EAI_AGAIN/.test(m)) return "The address could not be resolved (offline or wrong URL?)";
    if (/timed? ?out|AbortError|aborted/i.test(m)) return "The operation timed out";
    return m;
  }
  return String(err);
}
