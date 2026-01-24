#!/usr/bin/env node

/**
 * Sync Restricted Addresses
 *
 * Run this script to load pre-scanned bot-restricted addresses into MongoDB.
 * These addresses cannot receive airdrops.
 *
 * Usage: node scripts/sync-restricted.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aquari-airdrop';

// ═══════════════════════════════════════════════════════════════════════════
// RESTRICTED ADDRESSES (Bot-restricted, cannot receive airdrops)
// Last updated: 2026-01-24
// ═══════════════════════════════════════════════════════════════════════════
const RESTRICTED_ADDRESSES = [
  "0x0ad7c815d969c8a46c098d44d0e1a5a443410e12",
  "0x2f7839f4a0535647390812c4936b141f1f89c6eb",
  "0x63ecf53cf1d5d719b68df6fb8fb705315733c6b2",
  "0x6b1438e780ec9e4180598c0dcc5837a887394243",
  "0x97d6d3db3fcf4b56784b176d2c859b34e63d9961",
  "0xc90d71a9d7d00de3bb9017397bb1acf60ff22340",
  "0xccbcee3ebc81d1f684bf0de1a34aff18d735dcb5",
  "0xd3c0c8f97e5e3e8b8c490f2ace92dc43fcf5293a"
];
// ═══════════════════════════════════════════════════════════════════════════

async function syncRestricted() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SYNC RESTRICTED ADDRESSES');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Connecting to:', MONGODB_URI);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db();
    const collection = db.collection('restricted_addresses');

    // Check current count
    const beforeCount = await collection.countDocuments();
    console.log(`Current documents in collection: ${beforeCount}`);
    console.log(`Addresses to sync: ${RESTRICTED_ADDRESSES.length}\n`);

    // Use bulkWrite with upsert for efficiency
    const operations = RESTRICTED_ADDRESSES.map(address => ({
      updateOne: {
        filter: { address: address.toLowerCase() },
        update: {
          $setOnInsert: {
            address: address.toLowerCase(),
            reason: 'bot-restricted',
            createdAt: new Date()
          }
        },
        upsert: true
      }
    }));

    const result = await collection.bulkWrite(operations);

    const afterCount = await collection.countDocuments();

    console.log('✅ Done!');
    console.log(`   Inserted: ${result.upsertedCount}`);
    console.log(`   Already existed: ${RESTRICTED_ADDRESSES.length - result.upsertedCount}`);
    console.log(`   Total in DB: ${afterCount}\n`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

syncRestricted();
