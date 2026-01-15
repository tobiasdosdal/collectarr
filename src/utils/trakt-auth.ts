/**
 * Trakt Authentication Utilities
 * Handles token refresh and validation
 */

import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../types/index.js';

export interface TraktTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

interface TraktTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface HttpError extends Error {
  status?: number;
  code?: string;
  originalError?: Error;
}

export function tokenNeedsRefresh(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true;

  const expiry = new Date(expiresAt);
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return expiry < oneDayFromNow;
}

export async function refreshTraktToken(refreshToken: string, config: AppConfig): Promise<TraktTokens> {
  const { trakt } = config.external;

  if (!trakt.clientId || !trakt.clientSecret) {
    throw new Error('Trakt client credentials not configured');
  }

  let response: Response;
  try {
    response = await fetch('https://api.trakt.tv/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: trakt.clientId,
        client_secret: trakt.clientSecret,
        redirect_uri: trakt.redirectUri,
        grant_type: 'refresh_token',
      }),
    });
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const networkError = new Error('Network error: Failed to connect to Trakt API') as HttpError;
      networkError.code = (error as NodeJS.ErrnoException).code || 'NETWORK_ERROR';
      networkError.originalError = error;
      throw networkError;
    }
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Failed to refresh Trakt token: ${response.status}`) as HttpError;
    error.status = response.status;
    throw error;
  }

  const tokens = await response.json() as TraktTokenResponse;

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}

export async function ensureValidTraktTokens(
  prisma: PrismaClient,
  config: AppConfig
): Promise<string> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      traktAccessToken: true,
      traktRefreshToken: true,
      traktExpiresAt: true,
    },
  });

  if (!settings?.traktAccessToken) {
    throw new Error('Trakt not connected');
  }

  if (tokenNeedsRefresh(settings.traktExpiresAt)) {
    if (!settings.traktRefreshToken) {
      throw new Error('Trakt token expired and no refresh token available');
    }

    const newTokens = await refreshTraktToken(settings.traktRefreshToken, config);

    await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        traktAccessToken: newTokens.accessToken,
        traktRefreshToken: newTokens.refreshToken,
        traktExpiresAt: newTokens.expiresAt,
      },
    });

    return newTokens.accessToken;
  }

  return settings.traktAccessToken;
}

export default {
  tokenNeedsRefresh,
  refreshTraktToken,
  ensureValidTraktTokens,
};
