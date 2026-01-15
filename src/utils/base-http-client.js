export class BaseHttpClient {
  constructor(baseUrl, defaultHeaders = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
  }

  async request(endpoint, options = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    try {
      const response = await fetch(url.toString(), {
        headers: { ...this.defaultHeaders, ...options.headers },
        ...options,
      });

      if (!response.ok) {
        const error = new Error(`API error: ${response.status}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }

      return response.json();
    } catch (error) {
      // Handle network errors (fetch failures, DNS errors, timeouts, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to connect to ${this.baseUrl}`);
        networkError.code = error.code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      // Re-throw other errors (including API errors)
      throw error;
    }
  }

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}
