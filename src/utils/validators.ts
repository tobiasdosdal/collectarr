const URL_PATTERN = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;

export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return URL_PATTERN.test(url);
  }
}

export function validateServerUrl(url: string | null | undefined): { valid: boolean; error?: string } {
  if (!url) {
    return { valid: false, error: 'Server URL is required' };
  }
  
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/\/$/, '');
}

export function isValidApiKey(key: string | null | undefined, service: 'tmdb' | 'trakt' | 'mdblist' | 'emby' | 'radarr' | 'sonarr'): boolean {
  if (!key || key.trim().length === 0) return false;
  
  const trimmed = key.trim();
  
  switch (service) {
    case 'tmdb':
      return trimmed.length >= 32;
    case 'trakt':
      return trimmed.length >= 20;
    case 'mdblist':
      return trimmed.length >= 8;
    default:
      return trimmed.length >= 1;
  }
}

export function validateEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email.trim());
}

export function validateRequired(value: unknown, fieldName: string): { valid: boolean; error?: string } {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { valid: false, error: `${fieldName} is required` };
  }
  return { valid: true };
}
