#!/usr/bin/env ts-node
/**
 * Generate secure credentials for production .env
 *
 * Usage:
 *   npx ts-node scripts/generate-credentials.ts
 *   npx ts-node scripts/generate-credentials.ts --password mySecurePassword123
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

function generateSecureSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  AQUARI Airdrop - Production Credentials Generator');
  console.log('═'.repeat(60) + '\n');

  // Get password from command line or generate one
  const args = process.argv.slice(2);
  const passwordIndex = args.indexOf('--password');
  let password: string;

  if (passwordIndex !== -1 && args[passwordIndex + 1] !== undefined) {
    password = args[passwordIndex + 1]!;
    console.log('Using provided password\n');
  } else {
    password = crypto.randomBytes(16).toString('base64').slice(0, 20);
    console.log('Generated random password (save this!):\n');
    console.log(`  ADMIN_PASSWORD_PLAIN: ${password}\n`);
  }

  // Hash the password
  console.log('Generating bcrypt hash (this may take a moment)...\n');
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  // Generate session secret
  const sessionSecret = generateSecureSecret(64);

  console.log('─'.repeat(60));
  console.log('Add these to your production .env file:');
  console.log('─'.repeat(60) + '\n');

  console.log(`ADMIN_USERNAME=admin`);
  console.log(`ADMIN_PASSWORD=${hash}`);
  console.log(`SESSION_SECRET=${sessionSecret}`);

  console.log('\n' + '─'.repeat(60));
  console.log('Security Notes:');
  console.log('─'.repeat(60));
  console.log('1. Store ADMIN_PASSWORD_PLAIN somewhere safe (password manager)');
  console.log('2. The ADMIN_PASSWORD in .env is the bcrypt hash, not plain text');
  console.log('3. SESSION_SECRET should be unique per environment');
  console.log('4. Never commit .env to version control');
  console.log('5. Rotate credentials periodically\n');

  // Verify the hash works
  const verified = await bcrypt.compare(password, hash);
  console.log(`Hash verification: ${verified ? '✓ PASSED' : '✗ FAILED'}\n`);
}

main().catch(console.error);
