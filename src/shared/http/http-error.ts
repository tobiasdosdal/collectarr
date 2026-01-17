/**
 * HTTP Error Interface
 * Single source of truth for HTTP error handling across the application
 */

export interface HttpError extends Error {
  status?: number;
  code?: string;
  originalError?: Error;
  response?: Response;
}

export interface TestConnectionResult {
  success: boolean;
  serverName?: string;
  version?: string;
  error?: string;
}

export interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

/**
 * Create an HttpError from a Response object
 */
export function createHttpError(message: string, status?: number, response?: Response): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  error.response = response;
  return error;
}

/**
 * Create a network error
 */
export function createNetworkError(message: string, code?: string, originalError?: Error): HttpError {
  const error = new Error(message) as HttpError;
  error.code = code || 'NETWORK_ERROR';
  error.originalError = originalError;
  return error;
}
