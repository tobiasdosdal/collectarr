/**
 * Jellyfin Server API Client
 * Handles direct communication with Jellyfin server REST API
 */

import { BaseApiClient, type HttpError, type TestConnectionResult } from '../../shared/http/index.js';
import { createLogger } from '../../utils/runtime-logger.js';

export interface JellyfinServerInfo {
  ServerName: string;
  Version: string;
  Id: string;
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  Path?: string;
  ProviderIds?: {
    Imdb?: string;
    Tmdb?: string;
    Tvdb?: string;
  };
  ImageTags?: {
    Primary?: string;
    Backdrop?: string;
  };
}

export interface JellyfinCollection {
  Id: string;
  Name: string;
  Type: string;
}

export interface JellyfinSearchResult {
  Items: JellyfinItem[];
  TotalRecordCount: number;
}

export interface JellyfinTestConnectionResult extends TestConnectionResult {
  id?: string;
}

interface SearchParams {
  searchTerm?: string;
  includeItemTypes?: string;
  years?: string;
  recursive?: boolean;
  limit?: number;
  fields?: string;
}

interface FindByProviderParams {
  imdbId?: string | null;
  tmdbId?: string | null;
  tvdbId?: string | null;
  title?: string;
  year?: number | null;
  mediaType?: string;
}

class JellyfinClient extends BaseApiClient {
  private readonly log = createLogger('jellyfin.client');

  constructor(serverUrl: string, apiKey: string) {
    super(
      serverUrl,
      apiKey,
      'Jellyfin',
      {
        apiKeyHeaderName: 'X-MediaBrowser-Token',
      }
    );
  }

  async testConnection(): Promise<JellyfinTestConnectionResult> {
    const result = await super.testConnection();
    const info = await this.getServerInfo();
    return {
      ...result,
      id: info.Id,
    };
  }

  async getSystemStatus(): Promise<{ appName: string; instanceName: string; version: string }> {
    const info = await this.request<JellyfinServerInfo>('/System/Info');
    return {
      appName: info.ServerName,
      instanceName: info.ServerName,
      version: info.Version,
    };
  }

  async getServerInfo(): Promise<JellyfinServerInfo> {
    return this.request<JellyfinServerInfo>('/System/Info');
  }

  async getLibraries(): Promise<unknown[]> {
    return this.request<unknown[]>('/Library/VirtualFolders');
  }

  async searchItems(params: SearchParams = {}): Promise<JellyfinSearchResult> {
    const queryParams = new URLSearchParams();

    if (params.searchTerm) queryParams.set('SearchTerm', params.searchTerm);
    if (params.includeItemTypes) queryParams.set('IncludeItemTypes', params.includeItemTypes);
    if (params.years) queryParams.set('Years', params.years);
    if (params.recursive !== false) queryParams.set('Recursive', 'true');
    if (params.limit) queryParams.set('Limit', params.limit.toString());
    if (params.fields) queryParams.set('Fields', params.fields);

    const endpoint = `/Items?${queryParams.toString()}`;
    return this.request<JellyfinSearchResult>(endpoint);
  }

  async findItemByAnyProviderId(params: FindByProviderParams): Promise<JellyfinItem | null> {
    const { imdbId, tmdbId, tvdbId, title, year, mediaType } = params;

    if (!title) {
      return null;
    }

    const itemType = mediaType === 'MOVIE' ? 'Movie' : 'Series';
    const result = await this.searchItems({
      searchTerm: title,
      includeItemTypes: itemType,
      years: year?.toString(),
      limit: 20,
      fields: 'ProviderIds,ProductionYear',
    });

    const items = result.Items || [];
    const expectedType = itemType.toLowerCase();

    if (imdbId || tmdbId || tvdbId) {
      const matched = items.find(item => {
        const providerIds = item.ProviderIds || {};
        const imdbMatch = imdbId && providerIds.Imdb?.toLowerCase() === imdbId.toLowerCase();
        const tmdbMatch = tmdbId && providerIds.Tmdb?.toString() === tmdbId.toString();
        const tvdbMatch = tvdbId && providerIds.Tvdb?.toString() === tvdbId.toString();
        return Boolean(imdbMatch || tmdbMatch || tvdbMatch);
      });

      if (matched) {
        return matched;
      }
    }

    for (const item of items) {
      const titleMatch = item.Name?.toLowerCase() === title.toLowerCase();
      const yearMatch = !year || item.ProductionYear === year;
      const typeMatch = item.Type?.toLowerCase() === expectedType;
      if (titleMatch && yearMatch && typeMatch) {
        return item;
      }
    }

    return null;
  }

  async getCollections(): Promise<JellyfinItem[]> {
    const result = await this.request<JellyfinSearchResult>('/Items?IncludeItemTypes=BoxSet&Recursive=true&Fields=ProviderIds');
    return result.Items || [];
  }

  async getCollectionByName(name: string): Promise<JellyfinItem | undefined> {
    const collections = await this.getCollections();
    return collections.find(c => c.Name?.toLowerCase() === name.toLowerCase());
  }

  async createCollection(name: string, itemIds: string[] = []): Promise<{ Id: string }> {
    const params = new URLSearchParams();
    params.set('Name', name);
    params.set('IsLocked', 'false');
    if (itemIds.length > 0) {
      params.set('Ids', itemIds.join(','));
    }

    return this.request<{ Id: string }>(`/Collections?${params.toString()}`, {
      method: 'POST',
    });
  }

  async addItemsToCollection(collectionId: string, itemIds: string[]): Promise<void> {
    if (!itemIds || itemIds.length === 0) return;

    await this.request(`/Collections/${collectionId}/Items?Ids=${itemIds.join(',')}`, {
      method: 'POST',
    });
  }

  async removeItemsFromCollection(collectionId: string, itemIds: string[]): Promise<void> {
    if (!itemIds || itemIds.length === 0) return;

    await this.request(`/Collections/${collectionId}/Items?Ids=${itemIds.join(',')}`, {
      method: 'DELETE',
    });
  }

  async getCollectionItems(collectionId: string): Promise<JellyfinItem[]> {
    const result = await this.request<JellyfinSearchResult>(`/Items?ParentId=${collectionId}&Fields=ProviderIds`);
    return result.Items || [];
  }

  async deleteCollection(collectionId: string): Promise<void> {
    await this.request(`/Items/${collectionId}`, {
      method: 'DELETE',
    });
  }

  async updateCollectionMetadata(collectionId: string, metadata: Partial<JellyfinItem>): Promise<void> {
    const item = await this.request<JellyfinItem>(`/Items/${collectionId}`);

    const updated = {
      ...item,
      ...metadata,
    };

    await this.request(`/Items/${collectionId}`, {
      method: 'POST',
      body: JSON.stringify(updated),
    });
  }

  async uploadItemImage(itemId: string, imageType: string, imageData: Buffer, mimeType: string): Promise<boolean> {
    const url = new URL(`${this.baseUrl}/Items/${itemId}/Images/${imageType}`);

    this.log.debug('Uploading image', {
      itemId,
      imageType,
      sizeBytes: imageData.length,
      mimeType,
      url: url.toString(),
    });

    try {
      const base64Data = imageData.toString('base64');

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: this.buildHeaders({
          'Content-Type': mimeType,
        }),
        body: base64Data,
      });

      this.log.debug('Image upload response', {
        itemId,
        imageType,
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const responseText = await response.text();
        this.log.error('Image upload failed', {
          itemId,
          imageType,
          status: response.status,
          statusText: response.statusText,
          responseBody: responseText.slice(0, 500),
        });
        const error = new Error(`Failed to upload image: ${response.status} ${response.statusText} - ${responseText}`) as HttpError;
        error.status = response.status;
        throw error;
      }

      return true;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to upload image to Jellyfin server at ${this.baseUrl}`) as HttpError;
        networkError.code = (error as NodeJS.ErrnoException).code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      throw error;
    }
  }

  async deleteItemImage(itemId: string, imageType: string): Promise<void> {
    await this.request(`/Items/${itemId}/Images/${imageType}`, {
      method: 'DELETE',
    });
  }
}

export function createJellyfinClient(serverUrl: string | undefined, apiKey: string | undefined): JellyfinClient | null {
  if (!serverUrl || !apiKey) {
    return null;
  }
  return new JellyfinClient(serverUrl, apiKey);
}

export default JellyfinClient;
