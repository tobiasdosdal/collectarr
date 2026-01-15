import type { AppConfig } from '../types/index.js';

export const config: AppConfig = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  jwt: {
    secret: process.env.JWT_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable must be set in production');
      }
      return 'dev-secret-do-not-use-in-production';
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
      redirectUri: process.env.TRAKT_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/trakt/callback',
    },
  },
};

export default config;
