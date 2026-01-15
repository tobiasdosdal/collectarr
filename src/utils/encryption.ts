import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

if (!process.env.ENCRYPTION_KEY) {
  console.warn('ENCRYPTION_KEY not set - using development key');
}

const getKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY || 'dev-encryption-key-change-in-production-32bytes!';
  return Buffer.from(key.padEnd(32, '0').substring(0, 32), 'utf8');
};

export interface EncryptedData {
  encrypted: string;
  iv: string;
}

export const encrypt = (text: string): EncryptedData | null => {
  if (!text) return null;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
  };
};

export const decrypt = (encryptedText: string, ivHex: string): string | null => {
  if (!encryptedText || !ivHex) return null;

  try {
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', (error as Error).message);
    return null;
  }
};
