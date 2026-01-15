/**
 * Trakt Authentication Utilities
 * Handles token refresh and validation
 */

/**
 * Check if a Trakt token needs refresh (within 1 day of expiry)
 */
export function tokenNeedsRefresh(expiresAt) {
  if (!expiresAt) return true;

  const expiry = new Date(expiresAt);
  const now = new Date();
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return expiry < oneDayFromNow;
}

/**
 * Refresh a Trakt access token
 */
export async function refreshTraktToken(refreshToken, config) {
  const { trakt } = config.external;

  if (!trakt.clientId || !trakt.clientSecret) {
    throw new Error('Trakt client credentials not configured');
  }

  let response;
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
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const networkError = new Error(`Network error: Failed to connect to Trakt API`);
      networkError.code = error.code || 'NETWORK_ERROR';
      networkError.originalError = error;
      throw networkError;
    }
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Failed to refresh Trakt token: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const tokens = await response.json();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}

/**
 * Ensure user has valid Trakt tokens, refreshing if needed
 */
export async function ensureValidTraktTokens(prisma, userId, config) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      traktAccessToken: true,
      traktRefreshToken: true,
      traktExpiresAt: true,
    },
  });

  if (!user?.traktAccessToken) {
    throw new Error('Trakt not connected');
  }

  // Check if token needs refresh
  if (tokenNeedsRefresh(user.traktExpiresAt)) {
    if (!user.traktRefreshToken) {
      throw new Error('Trakt token expired and no refresh token available');
    }

    // Refresh the token
    const newTokens = await refreshTraktToken(user.traktRefreshToken, config);

    // Update in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        traktAccessToken: newTokens.accessToken,
        traktRefreshToken: newTokens.refreshToken,
        traktExpiresAt: newTokens.expiresAt,
      },
    });

    return newTokens.accessToken;
  }

  return user.traktAccessToken;
}

export default {
  tokenNeedsRefresh,
  refreshTraktToken,
  ensureValidTraktTokens,
};
