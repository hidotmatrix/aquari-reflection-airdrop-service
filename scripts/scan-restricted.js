/**
 * Scan for bot-restricted addresses and store them in MongoDB
 *
 * Usage: node scripts/scan-restricted.js [--rpc <url>]
 *
 * This script:
 * 1. Fetches all unique holder addresses from the database
 * 2. Checks each against AQUARI's isBotRestricted() function
 * 3. Stores restricted addresses in the `restricted_addresses` collection
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { MongoClient } = require('mongodb');

const AQUARI_ADDRESS = process.env.AQUARI_ADDRESS || '0x7F0E9971D3320521Fc88F863E173a4cddBB051bA';
const ABI = ['function isBotRestricted(address account) external view returns (bool)'];

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  let rpcUrl = process.env.RPC_URL || 'http://localhost:8545';

  const rpcIndex = args.indexOf('--rpc');
  if (rpcIndex !== -1 && args[rpcIndex + 1]) {
    rpcUrl = args[rpcIndex + 1];
  }

  console.log('=== AQUARI Bot-Restricted Address Scanner ===\n');
  console.log('RPC:', rpcUrl);
  console.log('Token:', AQUARI_ADDRESS);

  // Connect to MongoDB
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  console.log('Connected to MongoDB\n');

  // Connect to blockchain
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(AQUARI_ADDRESS, ABI, provider);

  // Get all unique holder addresses
  const addresses = await db.collection('holders').distinct('address');
  console.log('Total unique addresses to check:', addresses.length);

  const restricted = [];
  const BATCH_SIZE = 20;
  const DELAY_MS = 100;

  console.log('Scanning for restricted addresses...\n');

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (addr) => {
        try {
          const isRestricted = await contract.isBotRestricted(addr);
          return { address: addr, isRestricted };
        } catch (e) {
          // Retry once
          await new Promise(r => setTimeout(r, 500));
          try {
            const isRestricted = await contract.isBotRestricted(addr);
            return { address: addr, isRestricted };
          } catch (e2) {
            console.log('Error checking', addr, ':', e2.message.substring(0, 50));
            return { address: addr, isRestricted: false, error: true };
          }
        }
      })
    );

    for (const r of results) {
      if (r.isRestricted) {
        restricted.push(r.address);
        console.log('RESTRICTED:', r.address);
      }
    }

    // Progress update
    const checked = Math.min(i + BATCH_SIZE, addresses.length);
    process.stdout.write(`\rProgress: ${checked}/${addresses.length} (${Math.round(checked/addresses.length*100)}%)`);

    // Rate limit protection
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n\n=== RESULTS ===');
  console.log('Total checked:', addresses.length);
  console.log('Restricted found:', restricted.length);

  if (restricted.length > 0) {
    console.log('\nStoring restricted addresses in database...');

    // Upsert each restricted address
    for (const addr of restricted) {
      await db.collection('restricted_addresses').updateOne(
        { address: addr },
        {
          $set: {
            address: addr,
            reason: 'Bot-restricted by AQUARI contract',
            detectedAt: new Date(),
            updatedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    // Create index
    await db.collection('restricted_addresses').createIndex({ address: 1 }, { unique: true });

    console.log('Stored', restricted.length, 'restricted addresses');
    console.log('\nRestricted addresses:');
    restricted.forEach(a => console.log(' ', a));
  } else {
    console.log('\nNo restricted addresses found!');
  }

  await client.close();
  console.log('\nDone!');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
