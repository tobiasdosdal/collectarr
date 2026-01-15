/**
 * Emby Server API Client
 * Handles direct communication with Emby server REST API
 */

class EmbyClient {
  constructor(serverUrl, apiKey) {
    // Remove trailing slash
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Make a request to the Emby API
   */
  async request(endpoint, options = {}) {
    const url = new URL(`${this.serverUrl}${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);

    try {
      const response = await fetch(url.toString(), {
        ...options,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = new Error(`Emby API error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      // Some endpoints return no content
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      // Handle network errors (fetch failures, DNS errors, timeouts, etc.)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to connect to Emby server at ${this.serverUrl}`);
        networkError.code = error.code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      // Re-throw other errors (including API errors)
      throw error;
    }
  }

  /**
   * Test connection to the server
   */
  async testConnection() {
    try {
      const info = await this.request('/System/Info/Public');
      return {
        success: true,
        serverName: info.ServerName,
        version: info.Version,
        id: info.Id,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get server info (authenticated)
   */
  async getServerInfo() {
    return this.request('/System/Info');
  }

  /**
   * Get all libraries
   */
  async getLibraries() {
    const result = await this.request('/Library/VirtualFolders');
    return result;
  }

  /**
   * Search items in the library
   * @param {Object} params - Search parameters
   */
  async searchItems(params = {}) {
    const queryParams = new URLSearchParams();

    if (params.searchTerm) queryParams.set('SearchTerm', params.searchTerm);
    if (params.includeItemTypes) queryParams.set('IncludeItemTypes', params.includeItemTypes);
    if (params.years) queryParams.set('Years', params.years);
    if (params.recursive !== false) queryParams.set('Recursive', 'true');
    if (params.limit) queryParams.set('Limit', params.limit.toString());
    if (params.fields) queryParams.set('Fields', params.fields);

    // Provider ID filters
    if (params.anyProviderIdEquals) {
      queryParams.set('AnyProviderIdEquals', params.anyProviderIdEquals);
    }

    const endpoint = `/Items?${queryParams.toString()}`;
    return this.request(endpoint);
  }

  /**
   * Find item by provider ID (IMDb, TMDb, TVDB)
   */
  async findItemByProviderId(providerId, providerName = 'Imdb') {
    const result = await this.searchItems({
      anyProviderIdEquals: `${providerName}.${providerId}`,
      fields: 'ProviderIds,Path,ProductionYear,Name',
      recursive: true,
    });

    return result.Items?.[0] || null;
  }

  /**
   * Normalize a title for comparison (remove special chars, normalize spaces)
   */
  normalizeTitle(title) {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
      .replace(/\s+/g, ' ')      // Normalize multiple spaces
      .trim();
  }

  /**
   * Find item by multiple provider IDs (tries in order)
   * Also validates title match when available
   */
  async findItemByAnyProviderId({ imdbId, tmdbId, tvdbId, title, year, mediaType }) {
    // Try IMDb first (most reliable)
    if (imdbId) {
      const item = await this.findItemByProviderId(imdbId, 'Imdb');
      if (item) {
        item.matchedBy = 'imdb';
        // Validate title if provided (warns if mismatch but still returns the item)
        if (title && item.Name) {
          const normalizedSearch = this.normalizeTitle(title);
          const normalizedFound = this.normalizeTitle(item.Name);
          if (normalizedSearch !== normalizedFound) {
            item.titleMismatch = true;
            item.expectedTitle = title;
          }
        }
        return item;
      }
    }

    // Try TMDb
    if (tmdbId) {
      const item = await this.findItemByProviderId(tmdbId, 'Tmdb');
      if (item) {
        item.matchedBy = 'tmdb';
        // Validate title if provided
        if (title && item.Name) {
          const normalizedSearch = this.normalizeTitle(title);
          const normalizedFound = this.normalizeTitle(item.Name);
          if (normalizedSearch !== normalizedFound) {
            item.titleMismatch = true;
            item.expectedTitle = title;
          }
        }
        return item;
      }
    }

    // Try TVDB (for shows)
    if (tvdbId) {
      const item = await this.findItemByProviderId(tvdbId, 'Tvdb');
      if (item) {
        item.matchedBy = 'tvdb';
        // Validate title if provided
        if (title && item.Name) {
          const normalizedSearch = this.normalizeTitle(title);
          const normalizedFound = this.normalizeTitle(item.Name);
          if (normalizedSearch !== normalizedFound) {
            item.titleMismatch = true;
            item.expectedTitle = title;
          }
        }
        return item;
      }
    }

    // Fallback to title + year search - but be strict about matching
    if (title) {
      const itemType = mediaType === 'MOVIE' ? 'Movie' : 'Series';
      const result = await this.searchItems({
        searchTerm: title,
        includeItemTypes: itemType,
        years: year?.toString(),
        limit: 20, // Get more results to find better matches
        fields: 'ProviderIds,ProductionYear,Name',
      });

      const items = result.Items || [];
      const normalizedSearchTitle = this.normalizeTitle(title);
      
      // Try to find exact or very close match
      let bestMatch = null;
      let bestScore = 0;
      
      for (const item of items) {
        const itemTitle = item.Name || '';
        const normalizedItemTitle = this.normalizeTitle(itemTitle);
        
        // Check year match (required if year is provided)
        const yearMatch = !year || item.ProductionYear === year;
        if (!yearMatch) continue;
        
        // Exact normalized title match (highest confidence)
        if (normalizedSearchTitle === normalizedItemTitle) {
          item.matchedBy = 'title-exact';
          return item;
        }
        
        // Calculate similarity score
        // Check if search title contains item title or vice versa (partial match)
        const containsMatch = normalizedSearchTitle.includes(normalizedItemTitle) || 
                             normalizedItemTitle.includes(normalizedSearchTitle);
        
        if (containsMatch) {
          // Calculate how much of the title matches
          const shorter = normalizedSearchTitle.length < normalizedItemTitle.length 
            ? normalizedSearchTitle 
            : normalizedItemTitle;
          const longer = normalizedSearchTitle.length >= normalizedItemTitle.length 
            ? normalizedSearchTitle 
            : normalizedItemTitle;
          
          // If the shorter title is at least 80% of the longer, consider it a good match
          const similarity = shorter.length / longer.length;
          if (similarity > bestScore && similarity >= 0.8) {
            bestScore = similarity;
            bestMatch = item;
            item.matchedBy = `title-partial-${Math.round(similarity * 100)}`;
          }
        }
      }
      
      // Only return best match if we found a reasonably good one
      if (bestMatch && bestScore >= 0.85) {
        return bestMatch;
      }
      
      // If year was provided and we didn't find a good match, don't return anything
      // This prevents matching wrong movies from the same year
      if (year) {
        return null;
      }
      
      // If no year provided, we can be slightly more lenient but still require good title match
      if (bestMatch && bestScore >= 0.75) {
        return bestMatch;
      }
    }

    return null;
  }

  /**
   * Get all collections
   */
  async getCollections() {
    const result = await this.request('/Items?IncludeItemTypes=BoxSet&Recursive=true&Fields=ProviderIds');
    return result.Items || [];
  }

  /**
   * Get collection by name (returns first match)
   * Note: If multiple collections have the same name, returns the first one found
   */
  async getCollectionByName(name) {
    if (!name) return null;
    const collections = await this.getCollections();
    const normalizedName = name.trim().toLowerCase();
    return collections.find(c => c.Name?.trim().toLowerCase() === normalizedName) || null;
  }

  /**
   * Create a new collection
   */
  async createCollection(name, itemIds = []) {
    if (!name || name.trim() === '') {
      throw new Error('Collection name is required');
    }

    const params = new URLSearchParams();
    params.set('Name', name.trim());
    params.set('IsLocked', 'false');
    
    // Emby requires at least one item when creating a collection
    if (itemIds.length > 0) {
      // Limit to first item for creation (we'll add rest after)
      params.set('Ids', itemIds[0]);
    }

    const result = await this.request(`/Collections?${params.toString()}`, {
      method: 'POST',
    });

    if (!result || !result.Id) {
      throw new Error('Failed to create collection: Invalid response from Emby');
    }

    return result;
  }

  /**
   * Add items to a collection
   */
  async addItemsToCollection(collectionId, itemIds) {
    if (!itemIds || itemIds.length === 0) return;
    if (!collectionId) throw new Error('Collection ID is required');

    // Emby API has a limit on URL length, so batch if needed
    const batchSize = 50; // Conservative batch size for URL length limits
    if (itemIds.length <= batchSize) {
      await this.request(`/Collections/${collectionId}/Items?Ids=${itemIds.join(',')}`, {
        method: 'POST',
      });
    } else {
      // Batch the additions
      for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        await this.request(`/Collections/${collectionId}/Items?Ids=${batch.join(',')}`, {
          method: 'POST',
        });
      }
    }
  }

  /**
   * Remove items from a collection
   */
  async removeItemsFromCollection(collectionId, itemIds) {
    if (!itemIds || itemIds.length === 0) return;
    if (!collectionId) throw new Error('Collection ID is required');

    // Emby API has a limit on URL length, so batch if needed
    const batchSize = 50; // Conservative batch size for URL length limits
    if (itemIds.length <= batchSize) {
      await this.request(`/Collections/${collectionId}/Items?Ids=${itemIds.join(',')}`, {
        method: 'DELETE',
      });
    } else {
      // Batch the removals
      for (let i = 0; i < itemIds.length; i += batchSize) {
        const batch = itemIds.slice(i, i + batchSize);
        await this.request(`/Collections/${collectionId}/Items?Ids=${batch.join(',')}`, {
          method: 'DELETE',
        });
      }
    }
  }

  /**
   * Get items in a collection
   */
  async getCollectionItems(collectionId) {
    if (!collectionId) {
      throw new Error('Collection ID is required');
    }
    
    const result = await this.request(`/Items?ParentId=${collectionId}&Fields=ProviderIds,Name,ProductionYear`);
    return result.Items || [];
  }

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId) {
    await this.request(`/Items/${collectionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Update collection metadata
   */
  async updateCollectionMetadata(collectionId, metadata) {
    // First get the current item
    const item = await this.request(`/Items/${collectionId}`);

    // Merge with new metadata
    const updated = {
      ...item,
      ...metadata,
    };

    await this.request(`/Items/${collectionId}`, {
      method: 'POST',
      body: JSON.stringify(updated),
    });
  }

  /**
   * Upload an image for an item
   * @param {string} itemId - The item ID
   * @param {string} imageType - Image type: Primary, Backdrop, Banner, etc.
   * @param {Buffer} imageData - The image data as a Buffer
   * @param {string} mimeType - The MIME type of the image
   */
  async uploadItemImage(itemId, imageType, imageData, mimeType) {
    const url = new URL(`${this.serverUrl}/Items/${itemId}/Images/${imageType}`);
    url.searchParams.set('api_key', this.apiKey);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
        },
        body: imageData,
      });

      if (!response.ok) {
        const error = new Error(`Failed to upload image: ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      return true;
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new Error(`Network error: Failed to upload image to Emby server at ${this.serverUrl}`);
        networkError.code = error.code || 'NETWORK_ERROR';
        networkError.originalError = error;
        throw networkError;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Delete an image from an item
   * @param {string} itemId - The item ID
   * @param {string} imageType - Image type: Primary, Backdrop, Banner, etc.
   */
  async deleteItemImage(itemId, imageType) {
    await this.request(`/Items/${itemId}/Images/${imageType}`, {
      method: 'DELETE',
    });
  }
}

export function createEmbyClient(serverUrl, apiKey) {
  if (!serverUrl || !apiKey) {
    return null;
  }
  return new EmbyClient(serverUrl, apiKey);
}

export default EmbyClient;
