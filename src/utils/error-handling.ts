import type { HttpError } from '../shared/http/http-error.js';

export function handleNetworkError(error: unknown, serviceName: string, baseUrl: string): never {
  if (error instanceof TypeError && (error as Error).message.includes('fetch')) {
    const networkError = new Error(
      `Network error: Failed to connect to ${serviceName} server at ${baseUrl}`
    ) as HttpError;
    networkError.code = (error as NodeJS.ErrnoException).code || 'NETWORK_ERROR';
    networkError.originalError = error as Error;
    throw networkError;
  }
  throw error;
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && (error as Error).message.includes('fetch')) {
    return true;
  }
  
  const nodeError = error as NodeJS.ErrnoException;
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'];
  
  return nodeError.code !== undefined && retryableCodes.includes(nodeError.code);
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function getErrorStatus(error: unknown): number | undefined {
  const httpError = error as HttpError;
  return httpError.status;
}

export function logError(
  error: unknown,
  context: string,
  logger: { error: (msg: string) => void } | { warn: (msg: string) => void }
): void {
  const message = formatErrorMessage(error);
  const logFn = 'error' in logger ? logger.error : logger.warn;
  logFn(`[${context}] ${message}`);
}

export function withErrorHandling<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  errorHandler: (error: unknown) => T | Promise<T>
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      return await errorHandler(error);
    }
  };
}

export type SuccessResult<T> = {
  success: true;
  data: T;
};

export type ErrorResult<E = Error> = {
  success: false;
  error: E;
};

export type Result<T, E = Error> = SuccessResult<T> | ErrorResult<E>;

export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
