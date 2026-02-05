/**
 * API Client for ACdb Backend
 */

interface RequestOptions extends RequestInit {
  body?: string;
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  data: T;
}

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

class ApiClient {
  private baseUrl: string;
  private token: string | null;

  constructor() {
    this.baseUrl = API_URL;
    this.token = localStorage.getItem('token');
  }

  setToken(token: string | null): void {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      ...options.headers,
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (response.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return null as any;
    }

    return response.json() as Promise<T>;
  }

  // Auth endpoints
  async register(email: string, password: string): Promise<any> {
    const data: any = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async login(email: string, password: string): Promise<any> {
    const data: any = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async getMe(): Promise<any> {
    return this.request('/auth/me');
  }

  async getSetupStatus(): Promise<any> {
    return this.request('/auth/setup/status');
  }

  async setupAdmin(email: string, password: string): Promise<any> {
    const data: any = await this.request('/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async regenerateApiKey(): Promise<any> {
    return this.request('/auth/api-key/regenerate', { method: 'POST' });
  }

  async getTraktAuthUrl(): Promise<any> {
    return this.request('/auth/trakt/authorize');
  }

  async disconnectTrakt(): Promise<any> {
    return this.request('/auth/trakt/disconnect', { method: 'POST' });
  }

  async connectMdblist(apiKey: string): Promise<any> {
    return this.request('/auth/mdblist/connect', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async disconnectMdblist(): Promise<any> {
    return this.request('/auth/mdblist/disconnect', { method: 'POST' });
  }

  async testMdblistConnection(apiKey: string): Promise<{ success: boolean; message?: string }> {
    return this.request('/settings/mdblist/test', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async connectTmdb(apiKey: string): Promise<any> {
    return this.request('/settings/tmdb', {
      method: 'PUT',
      body: JSON.stringify({ apiKey }),
    });
  }

  async disconnectTmdb(): Promise<any> {
    return this.request('/settings/tmdb', { method: 'DELETE' });
  }

  async testTmdbConnection(apiKey: string): Promise<{ success: boolean; message?: string }> {
    return this.request('/settings/tmdb/test', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async getSettings(): Promise<{
    traktConnected: boolean;
    mdblistConnected: boolean;
    tmdbConnected: boolean;
    tmdbApiKeyMasked: string | null;
  }> {
    return this.request('/settings');
  }

  async regenerateCollectionPosters(includeCustom = false): Promise<{ success: boolean; generated: number; failed: number; skipped: number }> {
    return this.request('/settings/posters/regenerate', {
      method: 'POST',
      body: JSON.stringify({ includeCustom }),
    });
  }

  // Collections
  async getCollections(): Promise<any> {
    return this.request('/collections');
  }

  async getCollection(id: string): Promise<any> {
    return this.request(`/collections/${id}`);
  }

  async createCollection(data: Record<string, any>): Promise<any> {
    return this.request('/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCollection(id: string, data: Record<string, any>): Promise<any> {
    return this.request(`/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCollection(id: string): Promise<any> {
    return this.request(`/collections/${id}`, { method: 'DELETE' });
  }

  async refreshCollection(id: string): Promise<any> {
    return this.request(`/collections/${id}/refresh`, { method: 'POST' });
  }

  async addCollectionItem(collectionId: string, item: Record<string, any>): Promise<any> {
    return this.request(`/collections/${collectionId}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async removeCollectionItem(collectionId: string, itemId: string): Promise<any> {
    return this.request(`/collections/${collectionId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  async getCollectionStats(collectionId: string): Promise<any> {
    return this.request(`/collections/${collectionId}/stats`);
  }

  async getMissingItems(collectionId: string): Promise<any> {
    return this.request(`/collections/${collectionId}/missing`);
  }

  async uploadCollectionPoster(collectionId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl}/collections/${collectionId}/poster`;
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async deleteCollectionPoster(collectionId: string): Promise<any> {
    return this.request(`/collections/${collectionId}/poster`, { method: 'DELETE' });
  }

  // Users
  async getProfile(): Promise<any> {
    return this.request('/users/profile');
  }

  // Admin: List all users
  async getUsers(): Promise<any> {
    return this.request('/users/list');
  }

  // Admin: Create user
  async createUser(email: string, password: string, isAdmin = false): Promise<any> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, isAdmin }),
    });
  }

  // Admin: Update user (or user updating themselves)
  async updateUser(id: string, data: { email?: string; password?: string; isAdmin?: boolean }): Promise<any> {
    return this.request(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Admin: Delete user
  async deleteUser(id: string): Promise<any> {
    return this.request(`/users/${id}`, { method: 'DELETE' });
  }

  // Change own password (requires current password)
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<any> {
    return this.request(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, password: newPassword }),
    });
  }

  // Emby Servers
  async getEmbyServers(): Promise<any> {
    return this.request('/emby/servers');
  }

  async addEmbyServer(data: Record<string, any>): Promise<any> {
    return this.request('/emby/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async testEmbyConnection(url: string, apiKey: string): Promise<any> {
    return this.request('/emby/servers/test', {
      method: 'POST',
      body: JSON.stringify({ url, apiKey }),
    });
  }

  async getEmbyServer(id: string): Promise<any> {
    return this.request(`/emby/servers/${id}`);
  }

  async updateEmbyServer(id: string, data: Record<string, any>): Promise<any> {
    return this.request(`/emby/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteEmbyServer(id: string): Promise<any> {
    return this.request(`/emby/servers/${id}`, { method: 'DELETE' });
  }

  async getEmbyServerLibraries(serverId: string): Promise<any> {
    return this.request(`/emby/servers/${serverId}/libraries`);
  }

  async getEmbyServerCollections(serverId: string): Promise<any> {
    return this.request(`/emby/servers/${serverId}/collections`);
  }

  async searchEmbyServer(serverId: string, query: Record<string, any>): Promise<any> {
    return this.request(`/emby/servers/${serverId}/search`, {
      method: 'POST',
      body: JSON.stringify(query),
    });
  }

  // Emby Sync
  async syncToEmby(): Promise<any> {
    return this.request('/emby/sync', { method: 'POST' });
  }

  async syncCollectionToEmby(collectionId: string): Promise<any> {
    return this.request(`/emby/sync/collection/${collectionId}`, { method: 'POST' });
  }

  async syncToEmbyServer(serverId: string): Promise<any> {
    return this.request(`/emby/sync/server/${serverId}`, { method: 'POST' });
  }

  async getSyncLogs(limit = 50, collectionId?: string, embyServerId?: string): Promise<any> {
    let url = `/emby/sync/logs?limit=${limit}`;
    if (collectionId) url += `&collectionId=${collectionId}`;
    if (embyServerId) url += `&embyServerId=${embyServerId}`;
    return this.request(url);
  }

  async removeCollectionFromEmby(serverId: string, collectionName: string): Promise<any> {
    return this.request(`/emby/servers/${serverId}/remove-collection`, {
      method: 'POST',
      body: JSON.stringify({ collectionName }),
    });
  }

  // Sources - MDBList
  async searchMdblistLists(query: string): Promise<any> {
    return this.request(`/sources/mdblist/search?q=${encodeURIComponent(query)}`);
  }

  async getTopMdblistLists(): Promise<any> {
    return this.request('/sources/mdblist/top');
  }

  async getMdblistListItems(listId: string): Promise<any> {
    return this.request(`/sources/mdblist/lists/${listId}/items`);
  }

  // Sources - Trakt
  async getTraktLists(): Promise<any> {
    return this.request('/sources/trakt/lists');
  }

  async getTraktWatchlist(): Promise<any> {
    return this.request('/sources/trakt/watchlist');
  }

  async getTraktCollection(type = 'movies'): Promise<any> {
    return this.request(`/sources/trakt/collection?type=${type}`);
  }

  async getPopularTraktLists(): Promise<any> {
    return this.request('/sources/trakt/popular-lists');
  }

  async searchTraktLists(query: string): Promise<any> {
    return this.request(`/sources/trakt/search-lists?q=${encodeURIComponent(query)}`);
  }

  async getTrendingMovies(): Promise<any> {
    return this.request('/sources/trakt/trending/movies');
  }

  async getTrendingShows(): Promise<any> {
    return this.request('/sources/trakt/trending/shows');
  }

  // Jobs
  async getJobsStatus(): Promise<any> {
    return this.request('/jobs/status');
  }

  async runJob(jobName: string): Promise<any> {
    return this.request(`/jobs/${jobName}/run`, { method: 'POST' });
  }

  // Radarr Servers
  async getRadarrServers(): Promise<any> {
    return this.request('/radarr/servers');
  }

  async addRadarrServer(data: Record<string, any>): Promise<any> {
    return this.request('/radarr/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async testRadarrConnection(url: string, apiKey: string): Promise<any> {
    return this.request('/radarr/servers/test', {
      method: 'POST',
      body: JSON.stringify({ url, apiKey }),
    });
  }

  async getRadarrServer(id: string): Promise<any> {
    return this.request(`/radarr/servers/${id}`);
  }

  async updateRadarrServer(id: string, data: Record<string, any>): Promise<any> {
    return this.request(`/radarr/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteRadarrServer(id: string): Promise<any> {
    return this.request(`/radarr/servers/${id}`, { method: 'DELETE' });
  }

  async getRadarrProfiles(serverId: string): Promise<any> {
    return this.request(`/radarr/servers/${serverId}/profiles`);
  }

  async getRadarrRootFolders(serverId: string): Promise<any> {
    return this.request(`/radarr/servers/${serverId}/rootfolders`);
  }

  async lookupRadarrMovie(serverId: string, params: { term?: string; tmdbId?: string }): Promise<any> {
    const query = new URLSearchParams();
    if (params.term) query.set('term', params.term);
    if (params.tmdbId) query.set('tmdbId', params.tmdbId);
    return this.request(`/radarr/servers/${serverId}/lookup?${query.toString()}`);
  }

  async addToRadarr(serverId: string, movie: Record<string, any>): Promise<any> {
    return this.request(`/radarr/servers/${serverId}/add`, {
      method: 'POST',
      body: JSON.stringify(movie),
    });
  }

  async checkMovieInRadarr(serverId: string, tmdbId: number): Promise<any> {
    return this.request(`/radarr/servers/${serverId}/movies/${tmdbId}`);
  }

  async getRadarrMovies(serverId: string): Promise<any> {
    return this.request(`/radarr/servers/${serverId}/movies`);
  }

  // Sonarr Servers
  async getSonarrServers(): Promise<any> {
    return this.request('/sonarr/servers');
  }

  async addSonarrServer(data: Record<string, any>): Promise<any> {
    return this.request('/sonarr/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async testSonarrConnection(url: string, apiKey: string): Promise<any> {
    return this.request('/sonarr/servers/test', {
      method: 'POST',
      body: JSON.stringify({ url, apiKey }),
    });
  }

  async getSonarrServer(id: string): Promise<any> {
    return this.request(`/sonarr/servers/${id}`);
  }

  async updateSonarrServer(id: string, data: Record<string, any>): Promise<any> {
    return this.request(`/sonarr/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSonarrServer(id: string): Promise<any> {
    return this.request(`/sonarr/servers/${id}`, { method: 'DELETE' });
  }

  async getSonarrProfiles(serverId: string): Promise<any> {
    return this.request(`/sonarr/servers/${serverId}/profiles`);
  }

  async getSonarrRootFolders(serverId: string): Promise<any> {
    return this.request(`/sonarr/servers/${serverId}/rootfolders`);
  }

  async lookupSonarrSeries(serverId: string, params: { term?: string; tvdbId?: string }): Promise<any> {
    const query = new URLSearchParams();
    if (params.term) query.set('term', params.term);
    if (params.tvdbId) query.set('tvdbId', params.tvdbId);
    return this.request(`/sonarr/servers/${serverId}/lookup?${query.toString()}`);
  }

  async addToSonarr(serverId: string, series: Record<string, any>): Promise<any> {
    return this.request(`/sonarr/servers/${serverId}/add`, {
      method: 'POST',
      body: JSON.stringify(series),
    });
  }

  async checkSeriesInSonarr(serverId: string, tvdbId: number): Promise<any> {
    return this.request(`/sonarr/servers/${serverId}/series/${tvdbId}`);
  }

  async getSonarrSeries(serverId: string): Promise<any> {
    return this.request(`/sonarr/servers/${serverId}/series`);
  }

  logout(): void {
    this.setToken(null);
  }

  // Onboarding
  async getOnboardingStatus(): Promise<{
    completed: boolean;
    dismissed: boolean;
    steps: Record<string, boolean>;
  }> {
    return this.request('/users/onboarding/status');
  }

  async completeOnboardingStep(stepId: string): Promise<{
    success: boolean;
    allCompleted: boolean;
  }> {
    return this.request('/users/onboarding/step', {
      method: 'POST',
      body: JSON.stringify({ stepId }),
    });
  }

  async dismissOnboarding(): Promise<{ success: boolean }> {
    return this.request('/users/onboarding/dismiss', {
      method: 'POST',
    });
  }

  async resetOnboarding(): Promise<{ success: boolean }> {
    return this.request('/users/onboarding/reset', {
      method: 'POST',
    });
  }

  // Sample Collections
  async getSampleCollections(): Promise<any> {
    return this.request('/samples');
  }

  async getSampleCollection(sampleId: string): Promise<any> {
    return this.request(`/samples/${sampleId}`);
  }

  async applySampleCollection(sampleId: string): Promise<any> {
    return this.request(`/samples/${sampleId}/apply`, { method: 'POST' });
  }
}

export const api = new ApiClient();
export default api;
