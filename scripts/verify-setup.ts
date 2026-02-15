/**
 * Verify critical setup for actions-server
 *
 * Checks:
 * - Database connection
 * - USDC mint account exists on configured network
 * - Arbiter keypair is configured and valid
 * - Environment variables are set
 *
 * Usage:
 *   npm run verify:setup
 */

import { PrismaClient } from '@prisma/client';
import { Connection, PublicKey } from '@solana/web3.js';
import { loadArbiterKeypair } from '../src/utils/keypair';

const prisma = new PrismaClient();

async function verifySetup() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       🔍 Artha Network - Setup Verification                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  let allPassed = true;

  // 1. Check Environment Variables
  console.log('📋 Checking environment variables...');
  const requiredEnvVars = [
    'DATABASE_URL',
    'USDC_MINT',
    'ARBITER_ED25519_SECRET_HEX',
    'SOLANA_RPC_URL'
  ];

  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (!value || value.trim() === '') {
      console.log(`   ❌ ${envVar} - NOT SET`);
      allPassed = false;
    } else {
      console.log(`   ✅ ${envVar} - SET`);
    }
  }
  console.log('');

  // 2. Check Database Connection
  console.log('🗄️  Checking database connection...');
  try {
    await prisma.$connect();
    console.log('   ✅ Database connection successful');

    // Verify critical tables exist
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'artha'
      ORDER BY table_name;
    `;
    console.log(`   ✅ Found ${tables.length} tables in artha schema`);

    // Check for auth_challenges specifically
    const hasAuthChallenges = tables.some(t => t.table_name === 'auth_challenges');
    if (hasAuthChallenges) {
      console.log('   ✅ auth_challenges table exists');
    } else {
      console.log('   ❌ auth_challenges table NOT FOUND');
      allPassed = false;
    }
  } catch (error) {
    console.log(`   ❌ Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
    allPassed = false;
  }
  console.log('');

  // 3. Check Arbiter Keypair
  console.log('🔑 Checking arbiter keypair...');
  try {
    const arbiterKeypair = loadArbiterKeypair();
    if (arbiterKeypair) {
      console.log(`   ✅ Arbiter keypair loaded successfully`);
      console.log(`   📍 Public key: ${arbiterKeypair.publicKey.toBase58()}`);
    } else {
      console.log('   ❌ Arbiter keypair NOT configured');
      allPassed = false;
    }
  } catch (error) {
    console.log(`   ❌ Failed to load arbiter keypair: ${error instanceof Error ? error.message : String(error)}`);
    allPassed = false;
  }
  console.log('');

  // 4. Check USDC Mint on Solana
  console.log('💰 Checking USDC mint account...');
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const usdcMint = process.env.USDC_MINT;

    if (!usdcMint) {
      console.log('   ❌ USDC_MINT not configured');
      allPassed = false;
    } else {
      const mintPubkey = new PublicKey(usdcMint);
      const accountInfo = await connection.getAccountInfo(mintPubkey);

      if (accountInfo) {
        console.log(`   ✅ USDC mint account exists on ${rpcUrl.includes('devnet') ? 'Devnet' : 'network'}`);
        console.log(`   📍 Mint address: ${usdcMint}`);
      } else {
        console.log(`   ❌ USDC mint account NOT FOUND on network`);
        console.log(`   📍 Attempted: ${usdcMint}`);
        allPassed = false;
      }
    }
  } catch (error) {
    console.log(`   ❌ Failed to check mint: ${error instanceof Error ? error.message : String(error)}`);
    allPassed = false;
  }
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('✅ All checks passed! System is ready.');
  } else {
    console.log('❌ Some checks failed. Please review the errors above.');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

verifySetup().catch((error) => {
  console.error('Verification script failed:', error);
  process.exit(1);
});
