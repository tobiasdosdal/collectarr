/**
 * HTTP Module Exports
 * Re-exports all HTTP-related types and classes
 */

export type {
  HttpError,
  TestConnectionResult,
  RequestOptions,
} from './http-error.js';

export {
  createHttpError,
  createNetworkError,
} from './http-error.js';

export type { BaseApiClientOptions } from './base-client.js';

export { BaseApiClient } from './base-client.js';
