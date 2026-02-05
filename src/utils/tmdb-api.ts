import { TMDB_API_DELAY_MS } from '../config/constants.js';
import { withRetry } from './retry.js';
import { createLogger } from './runtime-logger.js';

let lastTmdbApiCallTime = 0;
const log = createLogger('tmdb.api');

function resolveTmdbApiKey(apiKey?: string): string | undefined {
  return apiKey || process.env.TMDB_API_KEY;
}

function buildTmdbRequest(
  apiKey: string,
  path: string,
  queryParams?: URLSearchParams
): { url: string; headers: Record<string, string> } {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  if (queryParams) {
    for (const [key, value] of queryParams.entries()) {
      url.searchParams.set(key, value);
    }
  }

  const isV4Token = apiKey.startsWith('eyJ');
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (isV4Token) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    url.searchParams.set('api_key', apiKey);
  }

  return { url: url.toString(), headers };
}

export async function waitForTmdbRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastTmdbApiCallTime;
  if (timeSinceLastCall < TMDB_API_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, TMDB_API_DELAY_MS - timeSinceLastCall));
  }
  lastTmdbApiCallTime = Date.now();
}

interface TmdbMovieResponse {
  poster_path?: string;
  backdrop_path?: string;
  vote_average?: number;
  vote_count?: number;
}

export async function fetchTmdbPoster(
  tmdbId: string,
  mediaType: string,
  apiKey?: string
): Promise<string | null> {
  const tmdbApiKey = resolveTmdbApiKey(apiKey);
  if (!tmdbApiKey) {
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    
    const data = await withRetry(
      async () => {
        const request = buildTmdbRequest(tmdbApiKey, `/${type}/${tmdbId}`);
        const response = await fetch(request.url, { headers: request.headers });
        
        if (!response.ok) {
          throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
        }
        
        return response.json() as Promise<TmdbMovieResponse>;
      },
      { maxRetries: 2, retryableStatusCodes: [429, 500, 502, 503, 504] }
    );
    
    if (data.poster_path) {
      return `https://image.tmdb.org/t/p/w500${data.poster_path}`;
    }
  } catch (error) {
    log.warn('TMDB poster fetch failed', {
      tmdbId,
      mediaType,
      error: (error as Error).message,
    });
  }

  return null;
}

export async function fetchTmdbBackdrop(
  tmdbId: string,
  mediaType: string,
  apiKey?: string
): Promise<string | null> {
  const tmdbApiKey = resolveTmdbApiKey(apiKey);
  if (!tmdbApiKey) {
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    
    const data = await withRetry(
      async () => {
        const request = buildTmdbRequest(tmdbApiKey, `/${type}/${tmdbId}`);
        const response = await fetch(request.url, { headers: request.headers });
        
        if (!response.ok) {
          throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
        }
        
        return response.json() as Promise<TmdbMovieResponse>;
      },
      { maxRetries: 2, retryableStatusCodes: [429, 500, 502, 503, 504] }
    );
    
    if (data.backdrop_path) {
      return `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`;
    }
  } catch (error) {
    log.warn('TMDB backdrop fetch failed', {
      tmdbId,
      mediaType,
      error: (error as Error).message,
    });
  }

  return null;
}

export async function fetchTmdbRating(
  tmdbId: string,
  mediaType: string,
  apiKey?: string
): Promise<{ rating: number | null; ratingCount: number | null }> {
  const tmdbApiKey = resolveTmdbApiKey(apiKey);
  if (!tmdbApiKey) {
    return { rating: null, ratingCount: null };
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';

    const data = await withRetry(
      async () => {
        const request = buildTmdbRequest(tmdbApiKey, `/${type}/${tmdbId}`);
        const response = await fetch(request.url, { headers: request.headers });

        if (!response.ok) {
          throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<TmdbMovieResponse>;
      },
      { maxRetries: 2, retryableStatusCodes: [429, 500, 502, 503, 504] }
    );

    // TMDB vote_average is 0-10 scale, convert to match MDBList 0-100 scale
    const rating = data.vote_average ? Math.round(data.vote_average * 10) : null;
    const ratingCount = data.vote_count || null;

    return { rating, ratingCount };
  } catch (error) {
    log.warn('TMDB rating fetch failed', {
      tmdbId,
      mediaType,
      error: (error as Error).message,
    });
  }

  return { rating: null, ratingCount: null };
}

export async function searchTmdbByTitle(
  title: string,
  mediaType: string,
  year: number | null,
  apiKey?: string
): Promise<string | null> {
  const tmdbApiKey = resolveTmdbApiKey(apiKey);
  if (!tmdbApiKey) {
    log.debug('TMDB API key not configured; skipping title search', {
      title,
      mediaType,
      year,
    });
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    const params = new URLSearchParams({ query: title });
    if (year) {
      params.set('year', year.toString());
    }
    const request = buildTmdbRequest(tmdbApiKey, `/search/${type}`, params);
    const response = await fetch(request.url, { headers: request.headers });

    if (response.ok) {
      const data = (await response.json()) as { results?: Array<{ poster_path?: string; id?: number; title?: string }> };
      const results = data.results;

      if (results && results.length > 0) {
        for (const result of results) {
          if (result.poster_path) {
            const posterUrl = `https://image.tmdb.org/t/p/w500${result.poster_path}`;
            log.debug('TMDB title search found poster', {
              title,
              matchedTitle: result.title || 'unknown',
            });
            return posterUrl;
          }
        }
        if (results.length > 0) {
          log.debug('TMDB title search found results but no posters', {
            title,
            count: results.length,
          });
        }
      } else {
        log.debug('TMDB title search found no results', { title });
      }
    } else {
      log.warn('TMDB title search request failed', {
        title,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    log.warn('TMDB title search error', {
      title,
      error: (error as Error).message,
    });
  }

  return null;
}
