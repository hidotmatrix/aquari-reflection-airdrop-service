import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Hash a plain-text password
 * Use this to generate the hash for ADMIN_PASSWORD_HASH in .env
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Verify a plain-text password against a hash
 */
export async function verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
  // Handle legacy plain-text passwords during migration
  // If hash doesn't start with $2, it's likely plain-text
  if (!hash.startsWith('$2')) {
    console.warn('[SECURITY WARNING] Plain-text password detected. Please hash your ADMIN_PASSWORD.');
    return plainPassword === hash;
  }

  return bcrypt.compare(plainPassword, hash);
}

/**
 * Check if a string is a bcrypt hash
 */
export function isBcryptHash(value: string): boolean {
  return value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$');
}

/**
 * Generate a secure random string for SESSION_SECRET
 */
export function generateSecureSecret(length: number = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i]! % chars.length];
  }
  return result;
}
