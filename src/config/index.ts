import type { AppConfig } from '../types/index.js';

export const config: AppConfig = {
  server: {
    port: parseInt(process.env.PORT || '7795', 10),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  auth: {
    disabled: process.env.DISABLE_AUTH === 'true',
  },
  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (process.env.DISABLE_AUTH === 'true') {
        return secret || 'not-used-when-auth-disabled';
      }
      if (!secret) {
        throw new Error('JWT_SECRET environment variable is required');
      }
      if (secret.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters');
      }
      return secret;
    })(),
    expiresIn: '7d',
  },
  encryption: {
    key: (() => {
      const key = process.env.ENCRYPTION_KEY;
      if (process.env.DISABLE_AUTH === 'true') {
        return key || 'not-used-when-auth-disabled-padding';
      }
      if (!key) {
        throw new Error('ENCRYPTION_KEY environment variable is required');
      }
      if (key.length < 32) {
        throw new Error('ENCRYPTION_KEY must be at least 32 characters');
      }
      return key;
    })(),
  },
  external: {
    mdblist: {
      apiKey: process.env.MDBLIST_API_KEY,
      baseUrl: 'https://api.mdblist.com',
    },
    tmdb: {
      apiKey: process.env.TMDB_API_KEY,
      baseUrl: 'https://api.themoviedb.org/3',
    },
    trakt: {
      clientId: process.env.TRAKT_CLIENT_ID,
      clientSecret: process.env.TRAKT_CLIENT_SECRET,
      baseUrl: 'https://api.trakt.tv',
      redirectUri: process.env.TRAKT_REDIRECT_URI || 'http://localhost:7795/api/v1/auth/trakt/callback',
    },
  },
};

export default config;
