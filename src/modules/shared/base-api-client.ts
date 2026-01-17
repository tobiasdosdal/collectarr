/**
 * Base API Client
 * Shared functionality for Emby/Sonarr/Radarr API clients
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

export abstract class BaseApiClient {
  protected baseUrl: string;
  protected apiKey: string;
  protected serviceName: string;
  protected apiKeyHeaderName?: string;
  protected apiVersion?: string;

  constructor(
    serverUrl: string,
    apiKey: string,
    serviceName: string,
    options: {
      apiKeyHeaderName?: string;
      apiVersion?: string;
    } = {}
  ) {
    this.baseUrl = serverUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.serviceName = serviceName;
    this.apiKeyHeaderName = options.apiKeyHeaderName;
    this.apiVersion = options.apiVersion;
  }

  /**
   * Build full URL for API endpoint
   */
  protected buildUrl(endpoint: string): string {
    const versionPath = this.apiVersion ? `/api/${this.apiVersion}` : '';
    return `${this.baseUrl}${versionPath}${endpoint}`;
  }

  /**
   * Build headers for API request
   */
  protected buildHeaders(baseHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...baseHeaders,
    };

    if (this.apiKeyHeaderName) {
      headers[this.apiKeyHeaderName] = this.apiKey;
    }

    return headers;
  }

  /**
   * Add API key as query parameter (for services that use query params instead of headers)
   */
  protected buildUrlWithApiKey(endpoint: string): string {
    const url = new URL(this.buildUrl(endpoint));
    url.searchParams.set('api_key', this.apiKey);
    return url.toString();
  }

  /**
   * Core HTTP request method with error handling
   */
  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = this.apiKeyHeaderName
      ? this.buildUrl(endpoint)
      : this.buildUrlWithApiKey(endpoint);

    try {
      const headers = this.apiKeyHeaderName
        ? this.buildHeaders(options.headers as Record<string, string>)
        : {};

      console.log(`[${this.serviceName}] Request: ${url}, headers:`, JSON.stringify(headers));

      const response = await fetch(url.toString(), {
        ...options,
        headers: {
          ...headers,
          ...(options.headers as Record<string, string> || {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `${this.serviceName} API error: ${response.status} ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorText);
          if ((errorJson as any).message) {
            errorMessage = (errorJson as any).message;
          }
        } catch {
          // Use default error message
        }

        const error = new Error(errorMessage) as HttpError;
        error.status = response.status;
        error.response = response;
        throw error;
      }

      const text = await response.text();
      return text ? JSON.parse(text) as T : (null as T);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(
          `Network error: Failed to connect to ${this.serviceName} server at ${this.baseUrl}`
        ) as HttpError;
        networkError.code = (error as NodeJS.ErrnoException).code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      throw error;
    }
  }

  /**
   * Generic GET request
   */
  protected async get<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * Generic POST request
   */
  protected async post<T>(
    endpoint: string,
    data: unknown,
    options: RequestInit = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Generic PUT request
   */
  protected async put<T>(
    endpoint: string,
    data: unknown,
    options: RequestInit = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Generic DELETE request
   */
  protected async delete<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Test connection to the API server
   * Subclasses should implement getSystemStatus() method
   */
  abstract getSystemStatus(): Promise<{ appName: string; instanceName?: string; version: string }>;

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const status = await this.getSystemStatus();
      return {
        success: true,
        serverName: status.instanceName || status.appName,
        version: status.version,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}
