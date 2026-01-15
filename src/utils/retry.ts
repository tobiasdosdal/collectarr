/**
 * Retry Utility
 * Provides retry logic with exponential backoff for external API calls
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  retryableStatusCodes?: number[];
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

interface RetryableError extends Error {
  code?: string;
  status?: number;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
  ],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: RetryableError, options: Required<Omit<RetryOptions, 'onRetry'>>): boolean {
  if (error.code && options.retryableErrors.includes(error.code)) {
    return true;
  }

  if (error.status && options.retryableStatusCodes.includes(error.status)) {
    return true;
  }

  if (error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
    return true;
  }

  return false;
}

function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'onRetry'>>): number {
  const delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, options.maxDelayMs);
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < opts.maxRetries && isRetryable(error as RetryableError, opts)) {
        const delay = calculateDelay(attempt, opts);

        if (options.onRetry) {
          options.onRetry(error as Error, attempt + 1, delay);
        }

        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export function retryable(options: RetryOptions = {}) {
  return function <T>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: unknown[]) => Promise<T>>
  ): TypedPropertyDescriptor<(...args: unknown[]) => Promise<T>> {
    const originalMethod = descriptor.value;

    if (originalMethod) {
      descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<T> {
        return withRetry(() => originalMethod.apply(this, args), options);
      };
    }

    return descriptor;
  };
}

export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private requests: number[] = [];

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();

    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      if (oldestRequest !== undefined) {
        const waitTime = this.windowMs - (now - oldestRequest) + 10;

        if (waitTime > 0) {
          await sleep(waitTime);
        }
      }

      return this.acquire();
    }

    this.requests.push(now);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    return fn();
  }
}

export default { withRetry, retryable, RateLimiter };
