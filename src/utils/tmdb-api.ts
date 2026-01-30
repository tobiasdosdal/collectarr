import { TMDB_API_DELAY_MS } from '../config/constants.js';
import { withRetry } from './retry.js';
import { handleNetworkError } from './error-handling.js';

let lastTmdbApiCallTime = 0;

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

export async function fetchTmdbPoster(tmdbId: string, mediaType: string): Promise<string | null> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    
    const data = await withRetry(
      async () => {
        const response = await fetch(
          `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbApiKey}`
        );
        
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
    console.warn(`TMDB API error for ${tmdbId}:`, (error as Error).message);
  }

  return null;
}

export async function fetchTmdbBackdrop(tmdbId: string, mediaType: string): Promise<string | null> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    
    const data = await withRetry(
      async () => {
        const response = await fetch(
          `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbApiKey}`
        );
        
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
    console.warn(`TMDB API error for ${tmdbId}:`, (error as Error).message);
  }

  return null;
}

export async function fetchTmdbRating(tmdbId: string, mediaType: string): Promise<{ rating: number | null; ratingCount: number | null }> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return { rating: null, ratingCount: null };
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';

    const data = await withRetry(
      async () => {
        const response = await fetch(
          `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbApiKey}`
        );

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
    console.warn(`TMDB rating fetch failed for ${tmdbId}:`, (error as Error).message);
  }

  return { rating: null, ratingCount: null };
}

export async function searchTmdbByTitle(
  title: string,
  mediaType: string,
  year: number | null
): Promise<string | null> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    console.warn('TMDB_API_KEY not configured, cannot search by title');
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    let searchUrl = `https://api.themoviedb.org/3/search/${type}?api_key=${tmdbApiKey}&query=${encodeURIComponent(title)}`;
    if (year) {
      searchUrl += `&year=${year}`;
    }

    const response = await fetch(searchUrl);

    if (response.ok) {
      const data = (await response.json()) as { results?: Array<{ poster_path?: string; id?: number; title?: string }> };
      const results = data.results;

      if (results && results.length > 0) {
        for (const result of results) {
          if (result.poster_path) {
            const posterUrl = `https://image.tmdb.org/t/p/w500${result.poster_path}`;
            console.log(`TMDB search found poster for "${title}": ${result.title || 'unknown'}`);
            return posterUrl;
          }
        }
        if (results.length > 0) {
          console.warn(`TMDB search found ${results.length} results for "${title}" but none had posters`);
        }
      } else {
        console.warn(`TMDB search found no results for "${title}"`);
      }
    } else {
      console.warn(`TMDB search failed for "${title}": ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.warn(`TMDB search error for "${title}":`, (error as Error).message);
  }

  return null;
}
