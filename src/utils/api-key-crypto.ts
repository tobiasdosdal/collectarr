/**
 * API Key encryption/decryption utilities
 * Handles encrypting API keys before storage and decrypting when reading
 */

import { encrypt, decrypt } from './encryption.js';
import { createLogger } from './runtime-logger.js';

interface EncryptedApiKey {
  apiKey: string;
  apiKeyIv: string;
}

const log = createLogger('security.api-key');

/**
 * Encrypt an API key for storage
 * Returns the encrypted value and IV
 */
export const encryptApiKey = (plainApiKey: string): EncryptedApiKey | null => {
  if (!plainApiKey) return null;

  const result = encrypt(plainApiKey);
  if (!result) return null;

  return {
    apiKey: result.encrypted,
    apiKeyIv: result.iv,
  };
};

/**
 * Decrypt an API key from storage
 * Handles both encrypted (with IV) and legacy unencrypted keys
 */
export const decryptApiKey = (encryptedApiKey: string, apiKeyIv: string | null): string => {
  // If no IV, assume it's a legacy unencrypted key
  if (!apiKeyIv) {
    return encryptedApiKey;
  }

  const decrypted = decrypt(encryptedApiKey, apiKeyIv);
  if (!decrypted) {
    // If decryption fails, return the original (might be legacy unencrypted)
    log.error('Failed to decrypt API key; returning original value');
    return encryptedApiKey;
  }

  return decrypted;
};
