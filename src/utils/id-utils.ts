export function normalizeImdbId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim().toLowerCase();
  if (trimmed.startsWith('tt')) return trimmed;
  if (/^\d+$/.test(trimmed)) return `tt${trimmed.padStart(7, '0')}`;
  return trimmed;
}

export function normalizeTmdbId(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

export function normalizeTvdbId(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

export function normalizeTraktId(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

export function isValidImdbId(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^tt\d{7,}$/.test(id.trim().toLowerCase());
}

export function isValidTmdbId(id: string | number | null | undefined): boolean {
  if (id === null || id === undefined) return false;
  const str = String(id);
  return /^\d+$/.test(str);
}

export function isValidTvdbId(id: string | number | null | undefined): boolean {
  if (id === null || id === undefined) return false;
  const str = String(id);
  return /^\d+$/.test(str);
}

export function normalizeMediaType(type: string | null | undefined): 'MOVIE' | 'SHOW' | null {
  if (!type) return null;
  const normalized = type.trim().toUpperCase();
  if (normalized === 'MOVIE' || normalized === 'MOVIES' || normalized === 'FILM') return 'MOVIE';
  if (normalized === 'SHOW' || normalized === 'SHOWS' || normalized === 'TV' || normalized === 'SERIES') return 'SHOW';
  return null;
}

export function isMovie(type: string | null | undefined): boolean {
  const normalized = normalizeMediaType(type);
  return normalized === 'MOVIE';
}

export function isShow(type: string | null | undefined): boolean {
  const normalized = normalizeMediaType(type);
  return normalized === 'SHOW';
}
