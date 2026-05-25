import { Result } from "better-result";
import { TaggedError } from "better-result";

export class TimeoutError extends TaggedError("Timeout")<{
	message: string;
	timeoutMs: number;
}>() {}

export class RetryExhaustedError extends TaggedError("RetryExhausted")<{
	message: string;
	attempts: number;
	lastError: unknown;
}>() {}

export interface RetryOptions {
	/** Maximum number of attempts (including the first try). Default: 3 */
	attempts?: number;
	/** Timeout per attempt in milliseconds. Default: 10_000 */
	timeoutMs?: number;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Execute an async operation with retries and per-attempt timeouts.
 * Returns a Result — never throws.
 *
 * On timeout, the attempt is aborted via AbortSignal and retried.
 * On error, the attempt is retried.
 * After all retries exhausted, returns Err(RetryExhaustedError).
 *
 * @param fn - The async operation. Receives an AbortSignal for timeout support.
 * @param opts - Retry and timeout configuration.
 */
export async function withRetry<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	opts?: RetryOptions,
): Promise<Result<T, TimeoutError | RetryExhaustedError>> {
	const maxAttempts = opts?.attempts ?? DEFAULT_ATTEMPTS;
	const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const result = await withTimeout(fn, timeoutMs);
			if (result.isOk()) return Result.ok(result.value);
			// Timeout — record and retry
			lastError = result.error;
		} catch (err) {
			lastError = err;
		}
		// Don't wait between retries — Workers are short-lived, retry immediately
	}

	return Result.err(
		new RetryExhaustedError({
			message: `Operation failed after ${maxAttempts} attempts`,
			attempts: maxAttempts,
			lastError,
		}),
	);
}

/**
 * Execute an async operation with a timeout.
 * Returns Result.ok(value) on success, Result.err(TimeoutError) on timeout.
 */
async function withTimeout<T>(
	fn: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
): Promise<Result<T, TimeoutError>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const result = await fn(controller.signal);
		return Result.ok(result);
	} catch (err) {
		if (controller.signal.aborted) {
			return Result.err(
				new TimeoutError({
					message: `Operation timed out after ${timeoutMs}ms`,
					timeoutMs,
				}),
			);
		}
		throw err; // Re-throw non-timeout errors for retry handling
	} finally {
		clearTimeout(timer);
	}
}
