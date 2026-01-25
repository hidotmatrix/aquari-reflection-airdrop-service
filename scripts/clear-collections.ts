#!/usr/bin/env ts-node
/**
 * Clear all collections except restrictedAddresses
 *
 * Usage:
 *   npx ts-node scripts/clear-collections.ts
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aquari-airdrop';

// Collections to preserve (will NOT be deleted)
const PRESERVED_COLLECTIONS = ['restricted_addresses'];

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  AQUARI Airdrop - Clear Collections');
  console.log('═'.repeat(60) + '\n');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log(`Connected to: ${db.databaseName}\n`);

    // Get all collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    console.log(`Found ${collectionNames.length} collections:`);
    collectionNames.forEach(name => {
      const preserved = PRESERVED_COLLECTIONS.includes(name);
      console.log(`  ${preserved ? '🔒' : '🗑️ '} ${name}${preserved ? ' (preserved)' : ''}`);
    });

    console.log('\n' + '─'.repeat(60));

    // Delete collections (except preserved ones)
    let deleted = 0;
    for (const name of collectionNames) {
      if (PRESERVED_COLLECTIONS.includes(name)) {
        console.log(`⏭️  Skipping: ${name}`);
        continue;
      }

      const count = await db.collection(name).countDocuments();
      await db.collection(name).drop();
      console.log(`✅ Deleted: ${name} (${count} documents)`);
      deleted++;
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`\n✓ Deleted ${deleted} collections`);
    console.log(`✓ Preserved ${PRESERVED_COLLECTIONS.length} collections`);

    // Show preserved collection stats
    for (const name of PRESERVED_COLLECTIONS) {
      if (collectionNames.includes(name)) {
        const count = await db.collection(name).countDocuments();
        console.log(`\n📊 ${name}: ${count} documents`);
      }
    }

    console.log('\n');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
