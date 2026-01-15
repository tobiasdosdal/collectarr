import crypto from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StatePayload {
  userId: string;
  timestamp: number;
  nonce: string;
}

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

/**
 * Generate a secure OAuth state token that includes the user ID
 * Format: base64(payload).base64(hmac)
 */
export const generateStateToken = (userId: string): string => {
  const payload: StatePayload = {
    userId,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto
    .createHmac('sha256', getSecret())
    .update(payloadStr)
    .digest('base64url');

  return `${payloadStr}.${hmac}`;
};

/**
 * Verify and extract user ID from OAuth state token
 * Returns null if invalid or expired
 */
export const verifyStateToken = (state: string): string | null => {
  try {
    const parts = state.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const payloadStr = parts[0];
    const providedHmac = parts[1];

    if (!payloadStr || !providedHmac) {
      return null;
    }

    // Verify HMAC
    const expectedHmac = crypto
      .createHmac('sha256', getSecret())
      .update(payloadStr)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(providedHmac), Buffer.from(expectedHmac))) {
      return null;
    }

    // Decode and validate payload
    const payload: StatePayload = JSON.parse(
      Buffer.from(payloadStr, 'base64url').toString('utf8')
    );

    // Check expiration
    if (Date.now() - payload.timestamp > STATE_TTL_MS) {
      return null;
    }

    return payload.userId;
  } catch {
    return null;
  }
};
