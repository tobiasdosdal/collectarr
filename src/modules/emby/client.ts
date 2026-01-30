/**
 * Emby Server API Client
 * Handles direct communication with Emby server REST API
 */

import { BaseApiClient, type HttpError, type TestConnectionResult } from '../../shared/http/index.js';

export interface EmbyServerInfo {
  ServerName: string;
  Version: string;
  Id: string;
}

export interface EmbyItem {
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

export interface EmbyCollection {
  Id: string;
  Name: string;
  Type: string;
}

export interface EmbySearchResult {
  Items: EmbyItem[];
  TotalRecordCount: number;
}

export interface EmbyTestConnectionResult extends TestConnectionResult {
  id?: string;
}

interface SearchParams {
  searchTerm?: string;
  includeItemTypes?: string;
  years?: string;
  recursive?: boolean;
  limit?: number;
  fields?: string;
  anyProviderIdEquals?: string;
}

interface FindByProviderParams {
  imdbId?: string | null;
  tmdbId?: string | null;
  tvdbId?: string | null;
  title?: string;
  year?: number | null;
  mediaType?: string;
}

class EmbyClient extends BaseApiClient {
  constructor(serverUrl: string, apiKey: string) {
    super(
      serverUrl,
      apiKey,
      'Emby',
      {
        apiKeyHeaderName: undefined,
      }
    );
  }

  async testConnection(): Promise<EmbyTestConnectionResult> {
    const result = await super.testConnection();
    const info = await this.getServerInfo();
    return {
      ...result,
      id: info.Id,
    };
  }

  async getSystemStatus(): Promise<{ appName: string; instanceName: string; version: string }> {
    const info = await this.request<EmbyServerInfo>('/System/Info');
    return {
      appName: info.ServerName,
      instanceName: info.ServerName,
      version: info.Version,
    };
  }

  async getServerInfo(): Promise<EmbyServerInfo> {
    return this.request<EmbyServerInfo>('/System/Info');
  }

  async getLibraries(): Promise<unknown[]> {
    return this.request<unknown[]>('/Library/VirtualFolders');
  }

  async searchItems(params: SearchParams = {}): Promise<EmbySearchResult> {
    const queryParams = new URLSearchParams();

    if (params.searchTerm) queryParams.set('SearchTerm', params.searchTerm);
    if (params.includeItemTypes) queryParams.set('IncludeItemTypes', params.includeItemTypes);
    if (params.years) queryParams.set('Years', params.years);
    if (params.recursive !== false) queryParams.set('Recursive', 'true');
    if (params.limit) queryParams.set('Limit', params.limit.toString());
    if (params.fields) queryParams.set('Fields', params.fields);
    if (params.anyProviderIdEquals) {
      queryParams.set('AnyProviderIdEquals', params.anyProviderIdEquals);
    }

    const endpoint = `/Items?${queryParams.toString()}`;
    return this.request<EmbySearchResult>(endpoint);
  }

  async findItemByProviderId(providerId: string, providerName = 'Imdb'): Promise<EmbyItem | null> {
    const result = await this.searchItems({
      anyProviderIdEquals: `${providerName}.${providerId}`,
      fields: 'ProviderIds,Path',
      recursive: true,
    });

    return result.Items?.[0] || null;
  }

  async findItemByAnyProviderId(params: FindByProviderParams): Promise<EmbyItem | null> {
    const { imdbId, tmdbId, tvdbId, title, year, mediaType } = params;

    if (imdbId) {
      const item = await this.findItemByProviderId(imdbId, 'Imdb');
      if (item) return item;
    }

    if (tmdbId) {
      const item = await this.findItemByProviderId(tmdbId, 'Tmdb');
      if (item) return item;
    }

    if (tvdbId) {
      const item = await this.findItemByProviderId(tvdbId, 'Tvdb');
      if (item) return item;
    }

    if (title) {
      const itemType = mediaType === 'MOVIE' ? 'Movie' : 'Series';
      const result = await this.searchItems({
        searchTerm: title,
        includeItemTypes: itemType,
        years: year?.toString(),
        limit: 10,
        fields: 'ProviderIds,ProductionYear',
      });

      const items = result.Items || [];
      const expectedType = itemType.toLowerCase();
      for (const item of items) {
        const titleMatch = item.Name?.toLowerCase() === title.toLowerCase();
        const yearMatch = !year || item.ProductionYear === year;
        const typeMatch = item.Type?.toLowerCase() === expectedType;
        if (titleMatch && yearMatch && typeMatch) {
          return item;
        }
      }
    }

    return null;
  }

  async getCollections(): Promise<EmbyItem[]> {
    const result = await this.request<EmbySearchResult>('/Items?IncludeItemTypes=BoxSet&Recursive=true&Fields=ProviderIds');
    return result.Items || [];
  }

  async getCollectionByName(name: string): Promise<EmbyItem | undefined> {
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

  async getCollectionItems(collectionId: string): Promise<EmbyItem[]> {
    const result = await this.request<EmbySearchResult>(`/Items?ParentId=${collectionId}&Fields=ProviderIds`);
    return result.Items || [];
  }

  async deleteCollection(collectionId: string): Promise<void> {
    await this.request(`/Items/${collectionId}`, {
      method: 'DELETE',
    });
  }

  async updateCollectionMetadata(collectionId: string, metadata: Partial<EmbyItem>): Promise<void> {
    const item = await this.request<EmbyItem>(`/Items/${collectionId}`);

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
    url.searchParams.set('api_key', this.apiKey);

    console.log(`[Emby Client] Uploading image to: ${url.toString().replace(this.apiKey, '***')}`);
    console.log(`[Emby Client] Item ID: ${itemId}, Image Type: ${imageType}, Size: ${imageData.length} bytes, MIME: ${mimeType}`);

    try {
      // Emby expects base64 encoded image data with the correct image MIME type
      const base64Data = imageData.toString('base64');
      console.log(`[Emby Client] Converted to base64, length: ${base64Data.length} chars`);
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
        },
        body: base64Data,
      });

      console.log(`[Emby Client] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const responseText = await response.text();
        console.error(`[Emby Client] Error response body: ${responseText}`);
        const error = new Error(`Failed to upload image: ${response.status} ${response.statusText} - ${responseText}`) as HttpError;
        error.status = response.status;
        throw error;
      }

      return true;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to upload image to Emby server at ${this.baseUrl}`) as HttpError;
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

export function createEmbyClient(serverUrl: string | undefined, apiKey: string | undefined): EmbyClient | null {
  if (!serverUrl || !apiKey) {
    return null;
  }
  return new EmbyClient(serverUrl, apiKey);
}

export default EmbyClient;
