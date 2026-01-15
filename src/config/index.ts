import type { AppConfig } from '../types/index.js';

export const config: AppConfig = {
  server: {
    port: parseInt(process.env.PORT || '7795', 10),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
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
