/**
 * Retry Utility
 * Provides retry logic with exponential backoff for external API calls
 */

/**
 * Default retry configuration
 */
const DEFAULT_OPTIONS = {
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

/**
 * Sleep for a specified duration
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryable(error, options) {
  // Check for network errors
  if (error.code && options.retryableErrors.includes(error.code)) {
    return true;
  }

  // Check for HTTP status codes
  if (error.status && options.retryableStatusCodes.includes(error.status)) {
    return true;
  }

  // Check for rate limiting
  if (error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
    return true;
  }

  return false;
}

/**
 * Calculate delay for next retry with exponential backoff
 */
function calculateDelay(attempt, options) {
  const delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, options.maxDelayMs);
}

/**
 * Execute a function with retry logic
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise} - Result of the function
 */
export async function withRetry(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < opts.maxRetries && isRetryable(error, opts)) {
        const delay = calculateDelay(attempt, opts);

        if (opts.onRetry) {
          opts.onRetry(error, attempt + 1, delay);
        }

        await sleep(delay);
        continue;
      }

      // Not retryable or max retries exceeded
      throw error;
    }
  }

  throw lastError;
}

/**
 * Create a retryable wrapper for a class method
 */
export function retryable(options = {}) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async acquire() {
    const now = Date.now();

    // Remove old requests outside the window
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      // Wait until we can make another request
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 10;

      if (waitTime > 0) {
        await sleep(waitTime);
      }

      // Recursively try again
      return this.acquire();
    }

    this.requests.push(now);
  }

  /**
   * Execute a function with rate limiting
   */
  async execute(fn) {
    await this.acquire();
    return fn();
  }
}

export default { withRetry, retryable, RateLimiter };
