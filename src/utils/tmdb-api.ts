import { TMDB_API_DELAY_MS } from '../config/constants.js';

let lastTmdbApiCallTime = 0;

export async function waitForTmdbRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastTmdbApiCallTime;
  if (timeSinceLastCall < TMDB_API_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, TMDB_API_DELAY_MS - timeSinceLastCall));
  }
  lastTmdbApiCallTime = Date.now();
}

export async function fetchTmdbPoster(tmdbId: string, mediaType: string): Promise<string | null> {
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return null;
  }

  try {
    await waitForTmdbRateLimit();
    const type = mediaType === 'SHOW' ? 'tv' : 'movie';
    const response = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${tmdbApiKey}`
    );

    if (response.ok) {
      const data = (await response.json()) as { poster_path?: string };
      if (data.poster_path) {
        return `https://image.tmdb.org/t/p/w500${data.poster_path}`;
      }
    }
  } catch (error) {
    console.warn(`TMDB API error for ${tmdbId}:`, (error as Error).message);
  }

  return null;
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
